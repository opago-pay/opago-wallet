import type { PrivateStore } from './store';
import { assertSessionContext, sessionTimestamp, sessionUuid, signV3SessionChallenge, v3SessionChallengeDigest,
  type V3SessionChallenge, type V3SessionContext, type V3SessionSigner } from '../wallet-session-proof';

export type V3WalletSession = { wallet_id: string; installation_id: string; access_token: string; expires_at: string };
type Proof = { challenge_id: string; signature: string };
type Pending = { context: V3SessionContext; key: string; body: Proof };
export interface V3SessionPort {
  /** Adapter owns approved account authentication, service forwarding and secure transport.
   * This module neither stores an AccountBearer nor enables any production route. */
  request(input: { method: 'POST'; path: string; contract: 'tx-foundation-v3';
    context: V3SessionContext; idempotencyKey: string; body: unknown }): Promise<{ status: number; body: unknown; authenticated: true }>;
}
const same = (a: V3SessionContext, b: V3SessionContext) => a.tenant === b.tenant && a.subject === b.subject &&
  a.walletId === b.walletId && a.sourceWalletId === b.sourceWalletId && a.installationId === b.installationId;
function sessionResponse(value: unknown, context: V3SessionContext, now: number): V3WalletSession {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'access_token,expires_at,installation_id,wallet_id') throw new Error('Invalid session response');
  const result = value as V3WalletSession;
  const expiry = sessionTimestamp(result.expires_at);
  if (result.wallet_id !== context.walletId || result.installation_id !== context.installationId ||
      typeof result.access_token !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(result.access_token) ||
      expiry <= now || expiry > now + 900_000) throw new Error('Invalid session response');
  return { ...result };
}

/** Explicit issuance only. No refresh/logout/status endpoints, automatic renewal,
 * F3 token conversion, cross-device handoff or global bootstrap activation. One owner per store key. */
export class V3WalletSessionClient {
  private busy = false;
  private generation = 0;
  private clearing = 0;
  private writes: Promise<unknown> = Promise.resolve();
  private readonly context: V3SessionContext;
  private readonly key: string;
  constructor(context: V3SessionContext, private readonly port: V3SessionPort, private readonly store: PrivateStore,
    private readonly uuid: () => string, private readonly now = () => Date.now()) {
    assertSessionContext(context); this.context = { ...context };
    this.key = 'v3-session:' + context.tenant + ':' + context.subject + ':' + context.walletId + ':' + context.installationId;
  }
  private id() { const id = this.uuid(); if (!sessionUuid(id)) throw new Error('Invalid operation key'); return id; }
  private async exclusive<T>(operation: (current: () => void) => Promise<T>) {
    if (this.busy || this.clearing) throw new Error('Session operation in progress');
    this.busy = true; const generation = this.generation;
    const current = () => { if (generation !== this.generation) throw new Error('Session operation cancelled'); };
    try { return await operation(current); } finally { this.busy = false; }
  }
  /** Fetching a challenge grants no consent and sends no signature. */
  async challenge(): Promise<V3SessionChallenge> {
    return this.exclusive(async current => {
      if (await this.store.read(this.key + ':pending')) throw new Error('Recover pending session issuance first');
      current();
      let operation = await this.store.read<{ context: V3SessionContext; key: string; createdAt: number }>(this.key + ':challenge'); current();
      if (operation && (!same(operation.context, this.context) || !sessionUuid(operation.key) || !Number.isFinite(operation.createdAt))) throw new Error('Invalid pending challenge');
      if (!operation || this.now() - operation.createdAt >= 300_000 || this.now() < operation.createdAt) {
        operation = { context: { ...this.context }, key: this.id(), createdAt: this.now() };
        await this.write(current, () => this.store.write(this.key + ':challenge', operation)); current();
      }
      const result = await this.port.request({ method: 'POST', path: '/api/v3/wallets/challenges', contract: 'tx-foundation-v3',
        context: { ...this.context }, idempotencyKey: operation.key, body: { purpose: 'session', wallet_id: this.context.walletId, installation_id: this.context.installationId } });
      current();
      if (result.authenticated !== true || result.status !== 201) throw new Error('Session challenge unavailable');
      v3SessionChallengeDigest(result.body, this.context, this.now());
      return { ...result.body as V3SessionChallenge };
    });
  }
  async issue(challenge: V3SessionChallenge, signer: V3SessionSigner, authorize: () => Promise<() => void>): Promise<V3WalletSession> {
    return this.exclusive(async current => {
      if (await this.store.read(this.key + ':pending')) throw new Error('Recover pending session issuance first');
      current();
      let approved: (() => void) | undefined;
      const consentCurrent = () => { current(); approved?.(); };
      const body = await signV3SessionChallenge(signer, challenge, this.context, async () => {
        current(); approved = await authorize(); return consentCurrent;
      }, this.now);
      current();
      const pending: Pending = { context: { ...this.context }, key: this.id(), body };
      await this.write(consentCurrent, () => this.store.write(this.key + ':pending', pending)); consentCurrent();
      await this.write(consentCurrent, () => this.store.remove(this.key + ':challenge')); consentCurrent();
      return this.dispatch(pending, consentCurrent);
    });
  }
  /** Retry exact approved bytes/key; never signs anew or pretends to extend expiry. */
  async recover(): Promise<V3WalletSession> {
    return this.exclusive(async current => {
      const pending = await this.store.read<Pending>(this.key + ':pending'); current();
      if (!pending || !same(pending.context, this.context) || !sessionUuid(pending.key) ||
          !sessionUuid(pending.body?.challenge_id) || !/^[0-9a-f]{128}$/.test(pending.body?.signature)) throw new Error('No valid pending session issuance');
      return this.dispatch(pending, current);
    });
  }
  private async dispatch(pending: Pending, current: () => void): Promise<V3WalletSession> {
    const result = await this.port.request({ method: 'POST', path: '/api/v3/wallets/' + this.context.walletId + '/sessions',
      contract: 'tx-foundation-v3', context: { ...this.context }, idempotencyKey: pending.key, body: { ...pending.body } });
    current();
    if (result.authenticated !== true || result.status !== 201) throw new Error('Session issuance unresolved');
    const session = sessionResponse(result.body, this.context, this.now());
    await this.write(current, () => this.store.write(this.key, session)); current();
    await this.write(current, () => this.store.remove(this.key + ':pending')); current();
    return session;
  }
  /** Local inspection only, not a claim that the server still accepts the token. */
  async localSession(): Promise<V3WalletSession | null> {
    const generation = this.generation;
    if (this.clearing) return null;
    const value = await this.store.read(this.key);
    if (generation !== this.generation || this.clearing) return null;
    if (!value) return null;
    try { return sessionResponse(value, this.context, this.now()); } catch { return null; }
  }
  private write(current: () => void, operation: () => Promise<void>): Promise<void> {
    const result = this.writes.then(() => { current(); return operation(); });
    this.writes = result.catch(() => {}); return result;
  }
  /** Invalidates in-flight callbacks; clears locally even while the network is stalled.
   * Does not claim server-side revocation. */
  async clearLocal(): Promise<void> {
    this.generation++; this.clearing++;
    try {
      await this.write(() => {}, async () => {
        await this.store.remove(this.key); await this.store.remove(this.key + ':pending'); await this.store.remove(this.key + ':challenge');
      });
    } finally { this.clearing--; }
  }
}
