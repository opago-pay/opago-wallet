import { p256 } from '@noble/curves/p256';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { base64url, unbase64url, parseStrictJson, strictUtf8, utf8 } from './encoding';
import type { OidcPlatform, OidcConfig } from './oidc';

type Json = Record<string, unknown>;
export type OidcVerifierPorts = { json(url: string): Promise<unknown>;
  verifyRs256(n: Uint8Array, e: Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean> };
export type OidcDiscovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid OIDC document.'); return value as Json;
}
function endpoint(raw: unknown, issuer: string): string {
  if (typeof raw !== 'string') throw new Error('Missing OIDC endpoint.');
  const url = new URL(raw); const trusted = new URL(issuer);
  if (url.protocol !== 'https:' || url.origin !== trusted.origin || url.username || url.password || url.hash || url.search) throw new Error('Untrusted OIDC endpoint.'); return url.toString();
}
/** Discovery is bound to the locally pinned issuer; no token-supplied key URLs are followed. */
export async function discoverOidc(issuer: string, json: OidcVerifierPorts['json']): Promise<OidcDiscovery> {
  if (issuer.endsWith('/') || endpoint(issuer, issuer) !== issuer) throw new Error('Invalid pinned OIDC issuer.');
  const doc = object(await json(issuer + '/.well-known/openid-configuration'));
  if (doc.issuer !== issuer) throw new Error('OIDC issuer mismatch.');
  return { issuer, authorization_endpoint: endpoint(doc.authorization_endpoint, issuer), token_endpoint: endpoint(doc.token_endpoint, issuer), jwks_uri: endpoint(doc.jwks_uri, issuer) };
}
function audience(value: unknown, expected: string) { return value === expected || Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string') && value.includes(expected); }
function second(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || !Number.isSafeInteger((value as number) * 1000)) throw new Error('Invalid token timestamp.'); return (value as number) * 1000;
}
export function createOidcVerifier(discovery: OidcDiscovery, accessAudience: string, ports: OidcVerifierPorts,
  now: () => number = Date.now, allowedAlgorithms = ['RS256', 'ES256']) : OidcPlatform['verify'] {
  if (!accessAudience || allowedAlgorithms.length === 0 || allowedAlgorithms.some(a => !['RS256', 'ES256', 'EdDSA'].includes(a))) throw new Error('Invalid OIDC verification policy.');
  return async (tokens, config: OidcConfig, nonce) => {
    if (config.issuer !== discovery.issuer) throw new Error('OIDC issuer changed.');
    // Fetch fresh JWKS for each login/refresh. Server-side session/key revocation remains authoritative.
    const set = object(await ports.json(discovery.jwks_uri));
    if (!Array.isArray(set.keys) || set.keys.length === 0 || set.keys.length > 32) throw new Error('Invalid OIDC JWKS.');
    const keys = set.keys.map(object); const ids = keys.map(k => k.kid);
    if (ids.some(id => typeof id !== 'string' || !id || id.length > 128) || new Set(ids).size !== ids.length) throw new Error('Ambiguous OIDC signing keys.');
    async function verify(raw: string, id: boolean): Promise<Json> {
      if (typeof raw !== 'string' || raw.length > 16_384) throw new Error('Invalid OIDC token.');
      const parts = raw.split('.'); if (parts.length !== 3) throw new Error('Invalid OIDC token.');
      const header = object(parseStrictJson(strictUtf8(unbase64url(parts[0]))));
      if (typeof header.alg !== 'string' || !allowedAlgorithms.includes(header.alg) || typeof header.kid !== 'string' ||
        header.crit !== undefined || header.b64 !== undefined || header.jku !== undefined || header.x5u !== undefined || header.jwk !== undefined ||
        (id ? header.typ !== undefined && header.typ !== 'JWT' : !['JWT', 'at+jwt'].includes(header.typ as string))) throw new Error('Unsupported OIDC token header.');
      const key = keys.find(k => k.kid === header.kid);
      if (!key || key.use !== undefined && key.use !== 'sig' || key.alg !== undefined && key.alg !== header.alg ||
        key.key_ops !== undefined && (!Array.isArray(key.key_ops) || key.key_ops.length !== 1 || key.key_ops[0] !== 'verify') ||
        ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'].some(k => key[k] !== undefined)) throw new Error('Invalid OIDC verification key.');
      const data = utf8(parts[0] + '.' + parts[1]); const signature = unbase64url(parts[2]); let valid = false;
      if (header.alg === 'RS256' && key.kty === 'RSA' && typeof key.n === 'string' && typeof key.e === 'string') {
        const n = unbase64url(key.n); const e = unbase64url(key.e);
        if (n.length < 256 || n.length > 512 || n[0] < 128 || e.length > 4 || e.length === 0 || e[0] === 0 || (e[e.length - 1] & 1) === 0 || e.length === 1 && e[0] < 3 || signature.length !== n.length) throw new Error('Unsafe OIDC RSA key.');
        valid = await ports.verifyRs256(n, e, data, signature);
      } else if (header.alg === 'ES256' && key.kty === 'EC' && key.crv === 'P-256' && typeof key.x === 'string' && typeof key.y === 'string') {
        const x = unbase64url(key.x); const y = unbase64url(key.y);
        if (x.length !== 32 || y.length !== 32 || signature.length !== 64) throw new Error('Invalid OIDC EC key.');
        valid = p256.verify(signature, sha256(data), new Uint8Array([4, ...x, ...y]), { lowS: false, format: 'compact' });
      } else if (header.alg === 'EdDSA' && key.kty === 'OKP' && key.crv === 'Ed25519' && typeof key.x === 'string') {
        const x = unbase64url(key.x); if (x.length !== 32 || signature.length !== 64) throw new Error('Invalid OIDC Ed25519 key.');
        valid = ed25519.verify(signature, data, x, { zip215: false });
      }
      if (!valid) throw new Error('Invalid OIDC token signature.');
      const claims = object(parseStrictJson(strictUtf8(unbase64url(parts[1]))));
      if (claims.iss !== config.issuer || !audience(claims.aud, id ? config.clientId : accessAudience) || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 256 ||
        second(claims.exp) <= now() || second(claims.iat) > now() + 30_000 || second(claims.iat) >= second(claims.exp) ||
        claims.nbf !== undefined && second(claims.nbf) > now() + 30_000 ||
        claims.azp !== undefined && claims.azp !== config.clientId || (Array.isArray(claims.aud) && claims.aud.length > 1 || !id) && claims.azp !== config.clientId) throw new Error('Invalid OIDC token claims.');
      return claims;
    }
    const id = await verify(tokens.id_token, true); const access = await verify(tokens.access_token, false);
    if (id.sub !== access.sub || id.nonce !== nonce || id.email_verified !== true || typeof id.email !== 'string' || !id.email ||
      access.typ !== undefined && access.typ !== 'Bearer' || id.auth_time !== undefined && second(id.auth_time) > now() + 30_000 ||
      id.at_hash !== undefined && id.at_hash !== base64url(sha256(utf8(tokens.access_token)).slice(0, 16))) throw new Error('OIDC account or nonce mismatch.');
    return { issuer: config.issuer, audience: config.clientId, subject: id.sub as string, expiresAt: second(id.exp), authTime: second(id.auth_time),
      nonce, emailVerified: true, accessAudience, accessExpiresAt: second(access.exp) };
  };
}
