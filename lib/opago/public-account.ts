import type { HkaHttp } from './hka';
import type { AppConfig } from './contract-types';
import { assertContract } from './contract';
import { base64url, unbase64url, parseStrictJson, utf8, validUnicode } from './encoding';
import { hpkeSuite } from './hpke-crypto';
import { PUBLIC_API_ORIGIN } from './public-account-origin';

// The sole approved bootstrap location. Runtime policy comes from /app/config.
// No issuer, client ID, secret, signing root or service URL is inferred from it.
export { PUBLIC_API_ORIGIN } from './public-account-origin';
export const CUSTOMER_CONTEXT = 'public-customer';
export const CUSTOMER_CONTEXT_HEADER = 'X-OPAGO-Login-Context';
export type PublicIdentity = { opago_id: string; tenant_id: 'opago'; roles: ['Merchant' | 'PrivateCustomer']; email?: string | null };
/** This is deliberately NOT an AccountCredential or a WalletBearer. */
export type PublicAccountSession = { accessToken: string; expiresAt: number; identity: PublicIdentity };
export type AccountProblem = 'unavailable' | 'rejected' | 'expired' | 'invalid' | 'rateLimited' | 'update' | 'cancelled';
export class PublicAccountError extends Error {
  constructor(readonly problem: AccountProblem, readonly retryAfterSeconds = 0) { super('OPAGO account: ' + problem); }
}
export function publicAccountErrorMessage(cause: unknown): string {
  switch (cause instanceof PublicAccountError ? cause.problem : 'unavailable') {
    case 'rejected': return 'Sign-in was not accepted. Check your details or contact OPAGO support.';
    case 'expired': return 'Your OPAGO session expired. Sign in again.';
    case 'invalid': return 'Enter your email address and password.';
    case 'rateLimited': return 'Too many attempts. Please wait before signing in again.';
    case 'update': return 'Update your app to use OPAGO account services. Your local wallet remains available.';
    case 'cancelled': return 'Sign-in cancelled.';
    default: return 'OPAGO account services are temporarily unavailable. Your local wallet remains available.';
  }
}
type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PublicAccountError('unavailable');
  return value as Json;
}
function fields(value: Json, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw new PublicAccountError('unavailable');
}
function customer(value: Json): asserts value is Json & { tenant_id: 'opago'; roles: ['Merchant' | 'PrivateCustomer'] } {
  if (value.tenant_id !== 'opago' || !Array.isArray(value.roles) || value.roles.length !== 1 ||
      !['Merchant', 'PrivateCustomer'].includes(value.roles[0])) throw new PublicAccountError('rejected');
}
function identity(value: unknown): PublicIdentity {
  const data = object(value); fields(data, ['opago_id', 'tenant_id', 'roles'], ['email']); customer(data);
  if (typeof data.opago_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.opago_id) ||
      data.email !== undefined && data.email !== null && (typeof data.email !== 'string' || data.email.length > 320)) throw new PublicAccountError('unavailable');
  return data as PublicIdentity;
}
function abort(signal?: AbortSignal) { if (signal?.aborted) throw new PublicAccountError('cancelled'); }
function retryAfter(value?: string) { return value && /^\d{1,6}$/.test(value) ? Math.min(Number(value), 86400) : 0; }

/** Existing API session contract, exact-origin HTTPS, one credential POST, no
 * Keycloak discovery/browser/JWKS or token refresh and no F3 token substitution. */
export class PublicAccountClient {
  constructor(private readonly http: HkaHttp, private readonly platform: 'ios' | 'android', private readonly build: number,
    private readonly random: (length: number) => Uint8Array, private readonly now = Date.now) {
    if (!Number.isSafeInteger(build) || build < 1) throw new PublicAccountError('unavailable');
  }
  private async request(path: string, method: 'GET' | 'POST', body?: unknown, bearer?: string, signal?: AbortSignal, login = false, expected = 200) {
    abort(signal);
    try {
      const response = await this.http(PUBLIC_API_ORIGIN + path, { method, headers: {
        Accept: 'application/json', 'Cache-Control': 'no-store', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(login ? { [CUSTOMER_CONTEXT_HEADER]: CUSTOMER_CONTEXT } : {}),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal, maxBytes: 32768, timeoutMs: 10000 });
      abort(signal);
      if (response.status === 429) throw new PublicAccountError('rateLimited', retryAfter(response.retryAfter));
      if (response.status === 401 || response.status === 403) throw new PublicAccountError(bearer ? 'expired' : 'rejected');
      if (!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.cacheControl || '')) throw new PublicAccountError('unavailable');
      if (response.status === 204 && path === '/api/v2/auth/logout') return { response, json: {} };
      if (response.status !== expected || !/^application\/json(?:\s*;|$)/i.test(response.contentType) || utf8(response.body).length > 32768) throw new PublicAccountError('unavailable');
      return { response, json: object(parseStrictJson(response.body)) };
    } catch (cause) {
      abort(signal);
      if (cause instanceof PublicAccountError) throw cause;
      throw new PublicAccountError('unavailable');
    }
  }
  async configuration(signal?: AbortSignal): Promise<AppConfig> {
    const { json } = await this.request('/api/v2/app/config', 'GET', undefined, undefined, signal);
    try { assertContract<AppConfig>('AppConfig', json); } catch { throw new PublicAccountError('unavailable'); }
    const issued = Date.parse(json.issued_at), expires = Date.parse(json.valid_until), now = this.now();
    if (json.audience !== PUBLIC_API_ORIGIN || issued > now + 300000 || expires <= now || expires <= issued) throw new PublicAccountError('unavailable');
    if (json.min_supported_build[this.platform] > this.build) throw new PublicAccountError('update');
    // oidc is legacy metadata in the pinned 0.2.0 schema, never a destination.
    return json;
  }
  async login(email: string, password: string, signal?: AbortSignal): Promise<PublicAccountSession> {
    const username = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) || Array.from(username).length > 320 || !validUnicode(username) ||
        !password.trim() || !validUnicode(password) || Array.from(password).length > 4096) throw new PublicAccountError('invalid');
    await this.configuration(signal);
    const { json: key } = await this.request('/api/v2/auth/login/hpke-key', 'GET', undefined, undefined, signal, true);
    // A previous facade may silently ignore the context header and use staff login.
    // Require the server's explicit acknowledgement before encrypting credentials.
    if (key.login_context !== CUSTOMER_CONTEXT || key.encryption !== 'hpke-v1' || key.mode !== 0 || key.kem_id !== 32 || key.kdf_id !== 1 ||
        key.aead_id !== 2 || key.audience !== PUBLIC_API_ORIGIN || typeof key.kid !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(key.kid) ||
        typeof key.public_key !== 'string' || key.info !== base64url(utf8('opago-api:auth:hpke:v1\0' + PUBLIC_API_ORIGIN + '\0' + key.kid)) ||
        !Number.isSafeInteger(key.server_time) || Math.abs(Number(key.server_time) * 1000 - this.now()) > 300000 ||
        key.max_age_seconds !== 300 || key.future_skew_seconds !== 30) throw new PublicAccountError('unavailable');
    let envelope: { encryption: string; kid: string; enc: string; ciphertext: string };
    try {
      const raw = unbase64url(key.public_key); if (raw.length !== 32 || raw.every(byte => byte === 0)) throw new Error();
      const nonce = this.random(16); if (nonce.length !== 16) throw new Error();
      const publicKey = await hpkeSuite.kem.deserializePublicKey(raw.slice().buffer);
      const sender = await hpkeSuite.createSenderContext({ recipientPublicKey: publicKey, info: utf8('opago-api:auth:hpke:v1\0' + PUBLIC_API_ORIGIN + '\0' + key.kid).buffer });
      const plaintext = utf8(JSON.stringify({ username, password, issued_at: Math.floor(this.now() / 1000), nonce: base64url(nonce) }));
      password = ''; if (plaintext.length > 8192) { plaintext.fill(0); throw new PublicAccountError('invalid'); }
      try {
        const ciphertext = await sender.seal(plaintext.slice().buffer);
        envelope = { encryption: 'hpke-v1', kid: key.kid, enc: base64url(new Uint8Array(sender.enc)), ciphertext: base64url(new Uint8Array(ciphertext)) };
      } finally { plaintext.fill(0); }
    } catch (cause) { if (cause instanceof PublicAccountError) throw cause; throw new PublicAccountError('unavailable'); }
    const { json: session } = await this.request('/api/v2/auth/token', 'POST', envelope, undefined, signal, true);
    fields(session, ['access_token', 'token_type', 'expires_at', 'tenant_id', 'roles']); customer(session);
    if (typeof session.access_token !== 'string' || !/^[A-Za-z0-9._~+/-]{1,8192}=*$/.test(session.access_token) ||
        typeof session.token_type !== 'string' || session.token_type.toLowerCase() !== 'bearer' || typeof session.expires_at !== 'string' ||
        !/(?:Z|[+-]\d\d:\d\d)$/.test(session.expires_at)) throw new PublicAccountError('unavailable');
    const expiresAt = Date.parse(session.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.now()) throw new PublicAccountError('expired');
    const verified = identity((await this.request('/api/v2/auth/me', 'GET', undefined, session.access_token, signal)).json);
    if (verified.roles[0] !== session.roles[0] || expiresAt <= this.now()) throw new PublicAccountError('rejected');
    return { accessToken: session.access_token, expiresAt, identity: verified };
  }
  async verify(session: PublicAccountSession, signal?: AbortSignal): Promise<PublicAccountSession> {
    if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= this.now() ||
        typeof session.accessToken !== 'string' || !/^[A-Za-z0-9._~+/-]{1,8192}=*$/.test(session.accessToken)) throw new PublicAccountError('expired');
    const old = identity(session.identity);
    await this.configuration(signal);
    const verified = identity((await this.request('/api/v2/auth/me', 'GET', undefined, session.accessToken, signal)).json);
    if (verified.opago_id !== old.opago_id || verified.roles[0] !== old.roles[0] || session.expiresAt <= this.now()) throw new PublicAccountError('expired');
    return { ...session, identity: verified };
  }
  async logout(session: PublicAccountSession, signal?: AbortSignal) {
    await this.request('/api/v2/auth/logout', 'POST', undefined, session.accessToken, signal);
  }
  async requestPasswordReset(email: string, language: string, signal?: AbortSignal) {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || Array.from(normalized).length > 320 || !validUnicode(normalized)) throw new PublicAccountError('invalid');
    await this.configuration(signal);
    const { json } = await this.request('/api/v2/auth/password-reset/request', 'POST', { email: normalized, language: language === 'de' ? 'de' : 'en' }, undefined, signal, false, 202);
    fields(json, ['status']); if (json.status !== 'accepted') throw new PublicAccountError('unavailable');
  }
}
