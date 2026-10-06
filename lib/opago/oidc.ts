import { sha256 } from '@noble/hashes/sha256';
import { base64url as encodeBase64url } from './encoding';
import type { AccountCredential, AccountLogin } from './account';
import type { PrivateStore } from './store';

export type OidcConfig = { issuer: string; clientId: string; redirectUri: string; authorizationEndpoint: string; tokenEndpoint: string };
type Tokens = { access_token: string; id_token: string; refresh_token?: string };
export type VerifiedClaims = { issuer: string; audience: string; subject: string; expiresAt: number; authTime: number;
  nonce: string; emailVerified: boolean; accessAudience: string; accessExpiresAt: number };
export interface OidcPlatform {
  /** Capture the current unlocked wallet lifecycle, including account-only use. */
  start?(): () => void;
  randomBytes(length: number): Uint8Array;
  browser(url: string, redirectUri: string): Promise<string | null>;
  token(url: string, form: URLSearchParams): Promise<Tokens>;
  /** Must validate both tokens' signatures via trusted issuer JWKS, allowed algorithms,
   * issuer/audience/type/expiry and revocation as applicable. Never decode-only. */
  verify(tokens: Tokens, config: OidcConfig, nonce: string): Promise<VerifiedClaims>;
}
export class OidcAccountLogin implements AccountLogin {
  readonly mode = 'oidc' as const;
  constructor(readonly config: OidcConfig, readonly trusted: { issuers: string[]; redirectUris: string[]; accessAudience: string },
    readonly platform: OidcPlatform, readonly store: PrivateStore, readonly now: () => number = Date.now) {
    if (!trusted.issuers.includes(config.issuer) || !trusted.redirectUris.includes(config.redirectUri)) throw new Error('Untrusted OIDC configuration.');
    for (const endpoint of [config.issuer, config.authorizationEndpoint, config.tokenEndpoint]) {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.origin !== new URL(config.issuer).origin) throw new Error('Untrusted OIDC endpoint.');
    }
  }
  private async accept(tokens: Tokens, nonce: string, fresh: boolean, active: () => void): Promise<AccountCredential> {
    const claims = await this.platform.verify(tokens, this.config, nonce);
    active();
    if (claims.issuer !== this.config.issuer || claims.audience !== this.config.clientId || claims.nonce !== nonce || !claims.subject ||
        !claims.emailVerified || claims.expiresAt <= this.now() || claims.accessExpiresAt <= this.now() ||
        claims.accessAudience !== this.trusted.accessAudience || claims.authTime > this.now() + 30_000 ||
        fresh && this.now() - claims.authTime > 300_000) throw new Error('OIDC authentication did not satisfy the account contract.');
    await this.store.write('f3.oidc.' + this.config.issuer, { tokens, nonce, subject: claims.subject });
    active();
    return { accessToken: tokens.access_token, expiresAt: claims.accessExpiresAt, authTime: claims.authTime, subject: claims.subject };
  }
  async login(fresh: boolean) {
    const active = this.platform.start?.() || (() => {});
    const verifier = encodeBase64url(this.platform.randomBytes(32));
    const state = encodeBase64url(this.platform.randomBytes(32));
    const nonce = encodeBase64url(this.platform.randomBytes(32));
    const url = new URL(this.config.authorizationEndpoint);
    const params = { response_type: 'code', client_id: this.config.clientId, redirect_uri: this.config.redirectUri,
      scope: 'openid email profile', state, nonce, code_challenge_method: 'S256',
      code_challenge: encodeBase64url(sha256(new TextEncoder().encode(verifier))), ...(fresh ? { prompt: 'login', max_age: '0' } : {}) };
    for (const [k,v] of Object.entries(params)) url.searchParams.set(k, v);
    const callback = await this.platform.browser(url.toString(), this.config.redirectUri);
    active();
    if (!callback) throw new Error('Account sign-in cancelled.');
    const result = new URL(callback);
    const base = new URL(this.config.redirectUri);
    if (result.protocol !== base.protocol || result.host !== base.host || result.pathname !== base.pathname || result.hash ||
        result.username || result.password || [...result.searchParams.keys()].some((k, i, keys) => keys.indexOf(k) !== i) ||
        result.searchParams.get('state') !== state || result.searchParams.has('error') || !result.searchParams.get('code')) throw new Error('Invalid OIDC callback.');
    const tokens = await this.platform.token(this.config.tokenEndpoint, new URLSearchParams({ grant_type: 'authorization_code',
      client_id: this.config.clientId, redirect_uri: this.config.redirectUri, code: result.searchParams.get('code')!, code_verifier: verifier }));
    active(); return this.accept(tokens, nonce, fresh, active);
  }
  async refresh() {
    const active = this.platform.start?.() || (() => {});
    const saved = await this.store.read<{ tokens: Tokens; nonce: string; subject: string }>('f3.oidc.' + this.config.issuer);
    if (!saved?.tokens.refresh_token) throw new Error('Sign in to your OPAGO account again.');
    const tokens = await this.platform.token(this.config.tokenEndpoint, new URLSearchParams({ grant_type: 'refresh_token',
      client_id: this.config.clientId, refresh_token: saved.tokens.refresh_token }));
    const claims = await this.platform.verify(tokens, this.config, saved.nonce);
    active();
    if (claims.subject !== saved.subject) throw new Error('OIDC account changed during refresh.');
    return this.accept(tokens, saved.nonce, false, active);
  }
  async logout() { await this.store.remove('f3.oidc.' + this.config.issuer); }
}
