import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { hpkeSuite, responseDecrypt } from './hpke-crypto';
import { assertContract, routeContract, routeQueryParameters, matchesSchema } from './contract';
import type { AppConfig, KeyDocument, HpkeResponse, HpkeRequest } from './contract-types';
import { OpagoError, type HkaTransport, type Request } from './api';
import type { PrivateStore } from './store';
import { base64url, unbase64url, jcs, parseStrictJson, strictUtf8, utf8 } from './encoding';

export type HkaHttp = (url: string, options: { method: Request['method']; headers: Record<string, string>; body?: string;
  maxBytes: number; timeoutMs: number }) => Promise<{ status: number; body: string; contentType: string; cacheControl?: string; retryAfter?: string }>;
export type HkaTrust = { audience: string; roots: Record<string, string>; platform: 'ios' | 'android'; build: number;
  oidc: { issuer: string; clientId: string; redirectUri: string }; testOnly?: boolean };
export type RequestAad = { method: string; path: string; query: [string, string][]; kid: string; nonce: string;
  issued_at: string; audience: string; idempotency_key: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publishedTestRoot = '6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw';
type Watermark = { issuedAt: string; digest: string };
function date(s: string) { const ms = Date.parse(s); if (!Number.isFinite(ms)) throw new Error('Invalid key timestamp.'); return ms; }
function digest(value: unknown) { return base64url(sha256(utf8(jcs(value)))); }
function encode(s: string) { return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
/** Canonical query bytes also become the exact HTTP request target. '+' is literal. */
export function canonicalTarget(raw: string, method = 'GET'): { path: string; query: [string, string][]; target: string } {
  const [path, rawQuery, extra] = raw.split('?');
  if (extra !== undefined || !/^\/api\/v2\/[A-Za-z0-9_/-]+$/.test(path) || path.includes('//') || path.endsWith('/')) throw new Error('Ambiguous HPKE path.');
  const allowed = routeQueryParameters(method, path);
  const seen = new Set<string>(); const query: [string, string][] = [];
  if (rawQuery !== undefined) {
    if (!rawQuery) throw new Error('Empty HPKE query.');
    for (const pair of rawQuery.split('&')) {
      const parts = pair.split('='); if (parts.length !== 2) throw new Error('Invalid HPKE query.');
      const key = decodeURIComponent(parts[0]); const value = decodeURIComponent(parts[1]);
      const param = allowed.find(p => p.name === key);
      if (!param || seen.has(key) || !value) throw new Error('Unsupported HPKE query.');
      const parsed = param.schema.type === 'integer' ? /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN : param.schema.type === 'boolean' ? value === 'true' ? true : value === 'false' ? false : undefined : value;
      if (!matchesSchema(param.schema, parsed)) throw new Error('Invalid HPKE query value.');
      seen.add(key); query.push([encode(key), encode(value)]);
    }
    query.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
  }
  if (allowed.some(p => p.required && !seen.has(p.name))) throw new Error('Missing HPKE query.');
  return { path, query, target: path + (query.length ? '?' + query.map(p => p.join('=')).join('&') : '') };
}
export function verifyKeyDocument(value: unknown, config: AppConfig, trust: HkaTrust, now: number, last?: Watermark): KeyDocument {
  assertContract<KeyDocument>('KeyDocument', value);
  const document = value.document;
  const root = trust.roots[value.signing_key_id];
  if (!root || config.revoked_signing_key_ids.includes(value.signing_key_id) || document.audience !== trust.audience ||
    date(document.issued_at) > now + 300_000 || last && (document.issued_at < last.issuedAt || document.issued_at === last.issuedAt && digest(document) !== last.digest)) throw new Error('Untrusted HPKE key document.');
  const rootBytes = unbase64url(root); const signature = unbase64url(value.signature);
  if (rootBytes.length !== 32 || signature.length !== 64 || !ed25519.verify(signature, utf8(jcs(document)), rootBytes, { zip215: false })) throw new Error('Invalid HPKE signing root or signature.');
  const kids = document.keys.map(k => k.kid);
  if (new Set(kids).size !== kids.length || !kids.includes(document.active_kid) || config.revoked_kids.includes(document.active_kid)) throw new Error('Invalid or revoked active HPKE key.');
  for (const key of document.keys) {
    const bytes = unbase64url(key.public_key);
    if (bytes.length !== 32 || bytes.every(b => b === 0) || date(key.not_after) <= now) throw new Error('Invalid or expired HPKE key.');
  }
  return value;
}
/** V6/V7 contract transport. It never retries a business operation or accepts a plaintext success. */
export class NativeHkaTransport implements HkaTransport {
  readonly mode: 'hka' | 'contract-test';
  private current?: { config: AppConfig; keys: KeyDocument; freshUntil: number };
  private refreshing?: Promise<{ config: AppConfig; keys: KeyDocument }>;
  constructor(readonly trust: HkaTrust, private readonly http: HkaHttp, private readonly store: PrivateStore,
    private readonly random: (length: number) => Uint8Array, private readonly now: () => number = Date.now) {
    const origin = new URL(trust.audience);
    if (origin.protocol !== 'https:' || origin.origin !== trust.audience || origin.username || origin.password || !Number.isSafeInteger(trust.build) || trust.build < 1 ||
      Object.keys(trust.roots).length < 1 || Object.keys(trust.roots).length > 4 || Object.entries(trust.roots).some(([id, key]) => !/^[A-Za-z0-9._-]{1,64}$/.test(id) || unbase64url(key).length !== 32 || !trust.testOnly && key === publishedTestRoot)) throw new Error('Invalid pinned HKA configuration.');
    if (!trust.testOnly && (origin.hostname.endsWith('.invalid') || origin.hostname === 'localhost')) throw new Error('Test endpoint cannot be used for live HKA.');
    this.mode = trust.testOnly ? 'contract-test' : 'hka';
  }
  private async plain(path: string, deadline: number) {
    const result = await this.http(this.trust.audience + path, { method: 'GET', headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
      maxBytes: 16_384, timeoutMs: Math.max(1, deadline - this.now()) });
    if (this.now() >= deadline || result.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(result.contentType) ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(result.cacheControl || '') || utf8(result.body).length > 16_384) throw new Error('Fresh HKA configuration is unavailable.');
    return parseStrictJson(result.body);
  }
  private async watermark(kind: string, issuedAt: string, value: unknown) {
    const slot = 'f3.hka.' + this.trust.audience + '.' + kind;
    const last = await this.store.read<Watermark>(slot); const next = { issuedAt, digest: digest(value) };
    if (last && (issuedAt < last.issuedAt || issuedAt === last.issuedAt && next.digest !== last.digest)) throw new Error('HKA configuration rollback.');
    await this.store.write(slot, next); return last;
  }
  async configuration(deadline = this.now() + 10_000): Promise<{ config: AppConfig; keys: KeyDocument }> {
    const now = this.now();
    if (this.current && now < this.current.freshUntil && date(this.current.config.issued_at) <= now + 300_000 &&
      this.current.keys.document.keys.every(k => date(k.not_after) > now)) return this.current;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const receivedAt = this.now(); const config = await this.plain('/api/v2/app/config', deadline);
      assertContract<AppConfig>('AppConfig', config);
      if (config.audience !== this.trust.audience || date(config.issued_at) > this.now() + 300_000 || date(config.valid_until) <= this.now() || date(config.valid_until) <= date(config.issued_at) ||
        config.oidc.issuer !== this.trust.oidc.issuer || config.oidc.client_id !== this.trust.oidc.clientId ||
        !config.oidc.redirect_uris.includes(this.trust.oidc.redirectUri) || !['openid', 'email', 'profile'].every(s => config.oidc.scopes.includes(s as 'openid'))) throw new Error('Unsupported or untrusted OPAGO configuration.');
      if (config.min_supported_build[this.trust.platform] > this.trust.build) throw new OpagoError('app_update_required');
      await this.watermark('config', config.issued_at, config);
      const last = await this.store.read<Watermark>('f3.hka.' + this.trust.audience + '.keys');
      const keys = verifyKeyDocument(await this.plain('/api/v2/auth/hpke-key', deadline), config, this.trust, this.now(), last || undefined);
      await this.watermark('keys', keys.document.issued_at, keys.document);
      this.current = { config, keys, freshUntil: Math.min(receivedAt + config.cache_max_age * 1000, date(config.valid_until)) };
      return { config, keys };
    })();
    try { return await this.refreshing; } finally { this.refreshing = undefined; }
  }
  async request(request: Request) {
    try { return await this.attempt(request, false); }
    catch (cause) { this.current = undefined; throw cause; } // Next explicit retry refreshes trust, never downgrades.
  }
  private async attempt(request: Request, renewed: boolean): Promise<{ status: number; body: unknown; authenticated: true; retryAfterSeconds?: number }> {
    const deadline = this.now() + 10_000;
    const target = canonicalTarget(request.path, request.method); const contract = routeContract(request.method, target.path); assertContract(contract.request, request.body);
    if (request.method !== 'GET' && !uuid.test(request.idempotencyKey || '') || request.auth !== 'none' && !request.bearer ||
      ['GET', 'DELETE'].includes(request.method) && jcs(request.body) !== '{}') throw new Error('Invalid HPKE request policy.');
    const { config, keys } = await this.configuration(deadline);
    const key = keys.document.keys.find(k => k.kid === keys.document.active_kid)!;
    const bytes = utf8(jcs(request.body)); if (bytes.length > 65_536) throw new Error('HPKE request exceeds limit.');
    const nonce = this.random(16); const entropy = this.random(32);
    if (nonce.length !== 16 || entropy.length !== 32) throw new Error('Secure randomness is unavailable.');
    const aad: RequestAad = { method: request.method, path: target.path, query: target.query, kid: key.kid, nonce: base64url(nonce),
      issued_at: new Date(Math.floor(this.now() / 1000) * 1000).toISOString().replace('.000Z', 'Z'), audience: this.trust.audience,
      idempotency_key: request.method === 'GET' ? null : request.idempotencyKey! };
    const ephemeral = await hpkeSuite.kem.deriveKeyPair(entropy); entropy.fill(0);
    const context = await hpkeSuite.createSenderContext({ recipientPublicKey: await hpkeSuite.kem.deserializePublicKey(unbase64url(key.public_key)),
      info: utf8('opago-api:hpke:v1\0' + this.trust.audience + '\0' + key.kid), ekm: ephemeral });
    const responseKey = new Uint8Array(await context.export(utf8('opago-response'), 32));
    try {
      const envelope: HpkeRequest = { encryption: 'hpke-v1', kid: key.kid, enc: base64url(new Uint8Array(context.enc)), nonce: aad.nonce,
        issued_at: aad.issued_at, ciphertext: base64url(new Uint8Array(await context.seal(bytes, utf8(jcs(aad))))) };
      const serialized = jcs(envelope); const headers: Record<string, string> = { Accept: 'application/json', 'Cache-Control': 'no-store' };
      if (request.auth !== 'none') headers.Authorization = 'Bearer ' + request.bearer;
      if (request.method !== 'GET') headers['Idempotency-Key'] = request.idempotencyKey!;
      let body: string | undefined;
      if (['GET', 'DELETE'].includes(request.method)) {
        headers['X-Opago-Envelope'] = base64url(utf8(serialized));
        if (headers['X-Opago-Envelope'].length > 16_384) throw new Error('HPKE header exceeds limit.');
      } else { body = serialized; headers['Content-Type'] = 'application/json'; }
      if (this.now() >= deadline || date(config.valid_until) <= this.now() || date(key.not_after) <= this.now()) throw new Error('HKA request expired before transmission.');
      const result = await this.http(this.trust.audience + target.target, { method: request.method, headers, body, maxBytes: 91_500, timeoutMs: Math.max(1, deadline - this.now()) });
      if (this.now() >= deadline || !Number.isInteger(result.status) || result.status < 200 || result.status > 599 || result.status >= 300 && result.status < 400 ||
        !/^application\/json(?:\s*;|$)/i.test(result.contentType) || utf8(result.body).length > 91_500) throw new Error('Invalid HKA response.');
      const encrypted = parseStrictJson(result.body); assertContract<HpkeResponse>('HpkeResponse', encrypted);
      const clear = responseDecrypt(responseKey, unbase64url(encrypted.nonce), unbase64url(encrypted.ciphertext), utf8(jcs({ request_aad: aad, http_status: result.status })));
      if (clear.length > 65_536) throw new Error('Decrypted HKA response exceeds limit.');
      const clearBody = parseStrictJson(strictUtf8(clear));
      if (result.status === 400 && (clearBody as { error?: { code?: string } })?.error?.code === 'invalid_hpke_credentials' && !renewed) {
        assertContract('Error', clearBody); this.current = undefined;
        return this.attempt(request, true); // Exactly one fresh key/config and envelope, identical semantic key/input.
      }
      const retryAfterSeconds = /^\d{1,6}$/.test(result.retryAfter || '') ? Number(result.retryAfter) : undefined;
      return { status: result.status, body: clearBody, authenticated: true as const, retryAfterSeconds };
    } finally { responseKey.fill(0); }
  }
}
