import { randomUUID } from 'expo-crypto';

/** Contract-faithful lifecycle previews. These adapters are deterministic local mocks:
 * they never instantiate OpagoApi, HKA transport, fetch, or any live backend.
 */
export const ACCOUNT_DELETION_PREVIEW_ENABLED = false;
export const WALLET_DETACH_PREVIEW_ENABLED = false;
export type AccountLifecycleStatus = 'active' | 'deletion_pending' | 'deletion_cancelled' | 'deleted';
export type DeletionReceipt = {
  deletion_id: string;
  status: 'deletion_pending';
  requested_at: string;
  scheduled_delete_at: string;
  receipt_token: string;
  receipt_expires_at: string;
};
export type DeletionStatus = {
  deletion_id: string;
  status: AccountLifecycleStatus;
  requested_at: string | null;
  scheduled_delete_at: string | null;
};
export type DetachReceipt = {
  wallet_id: string;
  status: 'unbound';
  detached_at: string;
  payments_enabled: false;
  evidence_id: string;
};
export type LifecycleRequest = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  auth: 'account_fresh' | 'receipt' | 'wallet_proof';
  idempotency_key?: string;
  body?: Record<string, unknown>;
};
export type LifecycleFailureCode =
  | 'unauthorized' | 'account_not_fresh' | 'deletion_in_progress' | 'idempotency_conflict'
  | 'receipt_expired' | 'deletion_not_cancellable' | 'rate_limited' | 'compliance_unavailable'
  | 'proof_invalid' | 'wallet_not_found' | 'account_mismatch' | 'proof_replayed' | 'proof_expired';
export class LifecyclePreviewError extends Error {
  constructor(readonly code: LifecycleFailureCode, readonly status: number) { super(code); }
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const time = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const uuid = () => randomUUID();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** State is owned by this adapter instance, just like a server-side pending record. */
export class MockAccountLifecycleAdapter {
  readonly mode = 'mock-only' as const;
  readonly calls: LifecycleRequest[] = [];
  private status: AccountLifecycleStatus = 'active';
  private receipt: DeletionReceipt | null = null;
  private readonly idempotency = new Map<string, { fingerprint: string; receipt: DeletionReceipt }>();
  private readonly cancelResults = new Map<string, { fingerprint: string; result: DeletionStatus }>();
  constructor(private readonly now: () => number = Date.now, private readonly makeUuid: () => string = uuid) {}
  private fresh(authTime: number | null | undefined) {
    if (authTime == null || this.now() - authTime < 0 || this.now() - authTime > 300_000) {
      throw new LifecyclePreviewError('account_not_fresh', 403);
    }
  }
  async deleteAccount(input: { accountBearer: string; authTime: number | null; idempotencyKey: string; hpkeEnvelope: boolean }): Promise<DeletionReceipt> {
    if (!input.accountBearer) throw new LifecyclePreviewError('unauthorized', 401);
    this.fresh(input.authTime);
    if (!input.hpkeEnvelope) throw new LifecyclePreviewError('unauthorized', 401);
    if (!uuidPattern.test(input.idempotencyKey)) throw new LifecyclePreviewError('idempotency_conflict', 409);
    this.calls.push({ method: 'DELETE', path: '/api/v2/account', auth: 'account_fresh', idempotency_key: input.idempotencyKey, body: { encryption: 'hpke-v1' } });
    const fingerprint = 'DELETE:/api/v2/account';
    const prior = this.idempotency.get(input.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new LifecyclePreviewError('idempotency_conflict', 409);
      return clone(prior.receipt);
    }
    if (this.receipt && this.status === 'deletion_pending') throw new LifecyclePreviewError('deletion_in_progress', 409);
    const requested = this.now();
    this.status = 'deletion_pending';
    this.receipt = {
      deletion_id: this.makeUuid(), status: 'deletion_pending', requested_at: time(requested),
      scheduled_delete_at: time(requested + 30 * 86400_000), receipt_token: 'mock-receipt-' + this.makeUuid(),
      receipt_expires_at: time(requested + 30 * 86400_000),
    };
    this.idempotency.set(input.idempotencyKey, { fingerprint, receipt: clone(this.receipt) });
    return clone(this.receipt);
  }
  async deletionStatus(deletionId: string, receiptToken: string): Promise<DeletionStatus> {
    if (!this.receipt || deletionId !== this.receipt.deletion_id) throw new LifecyclePreviewError('receipt_expired', 410);
    if (!receiptToken || receiptToken !== this.receipt.receipt_token || this.now() >= Date.parse(this.receipt.receipt_expires_at)) {
      throw new LifecyclePreviewError('receipt_expired', 410);
    }
    this.calls.push({ method: 'GET', path: '/api/v2/account/deletions/' + deletionId, auth: 'receipt' });
    return { deletion_id: deletionId, status: this.status, requested_at: this.receipt.requested_at, scheduled_delete_at: this.receipt.scheduled_delete_at };
  }
  async cancelDeletion(input: { deletionId: string; accountBearer: string; authTime: number | null; idempotencyKey: string }): Promise<DeletionStatus> {
    if (!input.accountBearer) throw new LifecyclePreviewError('unauthorized', 401);
    this.fresh(input.authTime);
    if (!uuidPattern.test(input.idempotencyKey)) throw new LifecyclePreviewError('idempotency_conflict', 409);
    const fingerprint = 'POST:/api/v2/account/deletions/' + input.deletionId + '/cancel';
    const prior = this.cancelResults.get(input.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new LifecyclePreviewError('idempotency_conflict', 409);
      return clone(prior.result);
    }
    if (!this.receipt || input.deletionId !== this.receipt.deletion_id || this.status !== 'deletion_pending' ||
        this.now() >= Date.parse(this.receipt.scheduled_delete_at)) throw new LifecyclePreviewError('deletion_not_cancellable', 410);
    this.calls.push({ method: 'POST', path: '/api/v2/account/deletions/' + input.deletionId + '/cancel', auth: 'account_fresh', idempotency_key: input.idempotencyKey });
    this.status = 'deletion_cancelled';
    const result = { deletion_id: input.deletionId, status: this.status, requested_at: this.receipt.requested_at, scheduled_delete_at: this.receipt.scheduled_delete_at };
    this.cancelResults.set(input.idempotencyKey, { fingerprint, result: clone(result) });
    return clone(result);
  }
  /** Mock the 30-day lifecycle transition without performing any external deletion. */
  finalizeDeletion() { if (this.status === 'deletion_pending' && this.receipt && this.now() >= Date.parse(this.receipt.scheduled_delete_at)) this.status = 'deleted'; }
}

export type DetachChallenge = { challenge_id: string; action: 'wallet_detach'; action_params: { wallet_id: string; party_id: string; account_generation: number }; expires_at: string };
export class MockWalletDetachAdapter {
  readonly mode = 'mock-only' as const;
  readonly calls: LifecycleRequest[] = [];
  private pending: DetachChallenge | null = null;
  private proofUsed = false;
  private detached = false;
  private readonly issuedProofs = new Map<string, { challengeId: string; used: boolean }>();
  private readonly detachResults = new Map<string, { fingerprint: string; result: DetachReceipt }>();
  constructor(private readonly walletId: string, private readonly partyId: string, private readonly generation: number,
    private readonly now: () => number = Date.now, private readonly makeUuid: () => string = uuid) {}
  async challenge(): Promise<DetachChallenge> {
    const challenge = { challenge_id: this.makeUuid(), action: 'wallet_detach' as const,
      action_params: { wallet_id: this.walletId, party_id: this.partyId, account_generation: this.generation },
      expires_at: time(this.now() + 60_000) };
    this.pending = challenge; this.proofUsed = false;
    this.calls.push({ method: 'POST', path: '/api/v2/wallet/auth/challenge', auth: 'wallet_proof',
      body: { action: 'wallet_detach', action_params: challenge.action_params } });
    return clone(challenge);
  }
  async verify(challenge: DetachChallenge, signatureValid: boolean): Promise<{ proof_token: string }> {
    if (!this.pending || challenge.challenge_id !== this.pending.challenge_id || JSON.stringify(challenge.action_params) !== JSON.stringify(this.pending.action_params)) {
      throw new LifecyclePreviewError('proof_invalid', 403);
    }
    if (this.now() >= Date.parse(this.pending.expires_at)) throw new LifecyclePreviewError('proof_expired', 410);
    if (!signatureValid) throw new LifecyclePreviewError('proof_invalid', 403);
    this.calls.push({ method: 'POST', path: '/api/v2/wallet/auth/verify', auth: 'wallet_proof', body: { challenge_id: challenge.challenge_id } });
    const proofToken = 'mock-proof-' + this.makeUuid() + '-' + this.makeUuid();
    this.issuedProofs.set(proofToken, { challengeId: this.pending.challenge_id, used: false });
    return { proof_token: proofToken };
  }
  async detach(input: { accountBearer: string; authTime: number | null; proofToken: string; installationId: string;
    idempotencyKey: string; signatureVerified: boolean }): Promise<DetachReceipt> {
    if (!input.accountBearer) throw new LifecyclePreviewError('unauthorized', 401);
    if (input.authTime == null || this.now() - input.authTime < 0 || this.now() - input.authTime > 300_000) throw new LifecyclePreviewError('account_not_fresh', 403);
    if (!uuidPattern.test(input.idempotencyKey)) throw new LifecyclePreviewError('idempotency_conflict', 409);
    const fingerprint = 'POST:/api/v2/account/wallets/' + this.walletId + '/detach:' + input.installationId + ':' + input.proofToken;
    const prior = this.detachResults.get(input.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new LifecyclePreviewError('idempotency_conflict', 409);
      return clone(prior.result);
    }
    if (!this.pending || this.now() >= Date.parse(this.pending.expires_at)) throw new LifecyclePreviewError('proof_expired', 410);
    const issued = this.issuedProofs.get(input.proofToken);
    if (!input.signatureVerified || !issued || issued.challengeId !== this.pending.challenge_id) throw new LifecyclePreviewError('proof_invalid', 403);
    if (issued.used || this.proofUsed) throw new LifecyclePreviewError('proof_replayed', 409);
    if (!input.installationId || this.detached) throw new LifecyclePreviewError('wallet_not_found', 404);
    this.calls.push({ method: 'POST', path: '/api/v2/account/wallets/' + this.walletId + '/detach', auth: 'account_fresh',
      idempotency_key: input.idempotencyKey, body: { proof_token: input.proofToken, installation_id: input.installationId } });
    issued.used = true; this.proofUsed = true; this.detached = true;
    const result = { wallet_id: this.walletId, status: 'unbound' as const, detached_at: time(this.now()), payments_enabled: false as const, evidence_id: this.makeUuid() };
    this.detachResults.set(input.idempotencyKey, { fingerprint, result: clone(result) });
    return clone(result);
  }
}
