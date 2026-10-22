import { sha256 } from '@noble/hashes/sha256';
import { base64url as encodeBase64url } from './encoding';
import type { AccountCredential, AccountLogin } from './account';
import type { PrivateStore } from './store';
import { OpagoError } from './api';

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
  /** Native Wallet uses the broker end-session contract; generic test adapters may omit it. */
  endSession?(config: OidcConfig, idToken: string): Promise<void>;
  /** Must validate both tokens' signatures via trusted issuer JWKS, allowed algorithms,
   * issuer/audience/type/expiry and revocation as applicable. Never decode-only. */
  verify(tokens: Tokens, config: OidcConfig, nonce: string): Promise<VerifiedClaims>;
}
type SessionControl = { generation: number; writes: Promise<unknown>; loginGeneration?: number; logout?: Promise<void>;
  refresh?: { generation: number; promise: Promise<AccountCredential> } };
// Native runtimes can recreate adapters; coordinate all instances sharing a store/slot.
const controls = new WeakMap<PrivateStore, Map<string, SessionControl>>();
function sessionControl(store: PrivateStore, slot: string): SessionControl {
  let slots = controls.get(store);
  if (!slots) { slots = new Map(); controls.set(store, slots); }
  let control = slots.get(slot);
  if (!control) { control = { generation: 0, writes: Promise.resolve() }; slots.set(slot, control); }
  return control;
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
  private get slot() { return 'f3.oidc.' + this.config.issuer; }
  private get logoutSlot() { return this.slot + '.pending-logout'; }
  private get control() { return sessionControl(this.store, this.slot); }
  private capture(replace = false) {
    const control = this.control;
    if (control.logout) throw new OpagoError('account_logout_pending', true);
    if (replace) { control.generation++; control.refresh = undefined; }
    const generation = control.generation;
    const current = this.platform.start?.() || (() => {});
    return () => {
      if (generation !== control.generation) throw new Error('Account authentication was cancelled.');
      current();
    };
  }
  private write<T>(action: () => Promise<T>): Promise<T> {
    const control = this.control;
    const result = control.writes.catch(() => undefined).then(action);
    control.writes = result; return result;
  }
  private async accept(tokens: Tokens, nonce: string, fresh: boolean, active: () => void): Promise<AccountCredential> {
    const claims = await this.platform.verify(tokens, this.config, nonce);
    active();
    if (claims.issuer !== this.config.issuer || claims.audience !== this.config.clientId || claims.nonce !== nonce || !claims.subject ||
        typeof claims.emailVerified !== 'boolean' || claims.expiresAt <= this.now() || claims.accessExpiresAt <= this.now() ||
        claims.accessAudience !== this.trusted.accessAudience || claims.authTime > this.now() + 30_000 ||
        fresh && this.now() - claims.authTime > 300_000) throw new Error('OIDC authentication did not satisfy the account contract.');
    await this.write(async () => {
      active();
      await this.store.write(this.slot, { tokens, nonce, subject: claims.subject });
      // A lock/logout/new login may arrive while secure storage is writing.
      // Cleanup stays inside the queue so it cannot erase a newer session.
      try { active(); } catch (cause) {
        try {
          if (this.platform.endSession && this.control.logout) await this.store.write(this.logoutSlot, { clientId: this.config.clientId, idToken: tokens.id_token });
        } finally { await this.store.remove(this.slot); }
        throw cause;
      }
      if (this.platform.endSession) await this.store.remove(this.logoutSlot);
    });
    active();
    return { accessToken: tokens.access_token, expiresAt: claims.accessExpiresAt, authTime: claims.authTime, subject: claims.subject };
  }
  async login(fresh: boolean) {
    const active = this.capture(true); active();
    const control = this.control; const generation = control.generation;
    control.loginGeneration = generation;
    try {
      await this.control.writes.catch(() => undefined); active();
      // An explicit new sign-in may recover after an expired logout hint. Force
      // fresh authentication; discard the old retry hint only after verified login.
      const pending = this.platform.endSession && await this.store.read(this.logoutSlot);
      active(); return await this.loginOnce(fresh || !!pending, active);
    }
    finally { if (control.loginGeneration === generation) control.loginGeneration = undefined; }
  }
  private async loginOnce(fresh: boolean, active: () => void) {
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
        result.searchParams.get('state') !== state || result.searchParams.get('iss') !== this.config.issuer || result.searchParams.has('error') || !result.searchParams.get('code')) throw new Error('Invalid OIDC callback.');
    const tokens = await this.platform.token(this.config.tokenEndpoint, new URLSearchParams({ grant_type: 'authorization_code',
      client_id: this.config.clientId, redirect_uri: this.config.redirectUri, code: result.searchParams.get('code')!, code_verifier: verifier }));
    active(); return this.accept(tokens, nonce, fresh, active);
  }
  async refresh() {
    const active = this.capture(); active();
    const control = this.control;
    if (control.loginGeneration === control.generation) throw new Error('Account sign-in is in progress.');
    let flight = control.refresh;
    if (!flight || flight.generation !== control.generation) {
      flight = { generation: control.generation, promise: this.refreshOnce(active) };
      control.refresh = flight;
    }
    try { const credential = await flight.promise; active(); return credential; }
    finally { if (control.refresh === flight) control.refresh = undefined; }
  }
  private async refreshOnce(active: () => void) {
    await this.control.writes.catch(() => undefined); active();
    const saved = await this.store.read<{ tokens: Tokens; nonce: string; subject: string }>(this.slot);
    active();
    if (!saved?.tokens.refresh_token) throw new Error('Sign in to your OPAGO account again.');
    const tokens = await this.platform.token(this.config.tokenEndpoint, new URLSearchParams({ grant_type: 'refresh_token',
      client_id: this.config.clientId, refresh_token: saved.tokens.refresh_token }));
    active();
    const claims = await this.platform.verify(tokens, this.config, saved.nonce);
    active();
    if (claims.subject !== saved.subject) throw new Error('OIDC account changed during refresh.');
    return this.accept(tokens, saved.nonce, false, active);
  }
  async logout() {
    const control = this.control;
    if (control.logout) return control.logout;
    control.generation++; control.refresh = undefined;
    // Preserve generic/local-only adapters. Native always supplies endSession.
    if (!this.platform.endSession) return this.write(() => this.store.remove(this.slot));
    const flight = this.logoutOnce(); control.logout = flight;
    try { await flight; } finally { if (control.logout === flight) control.logout = undefined; }
  }
  private async logoutOnce() {
    // Retain only the ID hint in PrivateStore for explicit retry, never access/refresh
    // authority. A new login cannot race an in-flight account-wide revocation.
    const pending = await this.write(async () => {
      const saved = await this.store.read<{ tokens: Tokens }>(this.slot);
      const previous = await this.store.read<{ clientId: string; idToken: string }>(this.logoutSlot);
      const record = previous || (saved ? { clientId: this.config.clientId, idToken: saved.tokens.id_token } : null);
      try { if (record) await this.store.write(this.logoutSlot, record); }
      finally { await this.store.remove(this.slot); }
      return record;
    });
    if (!pending) return;
    if (pending.clientId !== this.config.clientId) throw new OpagoError('account_logout_pending', true);
    try {
      await this.platform.endSession!(this.config, pending.idToken);
      await this.write(() => this.store.remove(this.logoutSlot));
    } catch { throw new OpagoError('account_logout_pending', true); }
  }
}
