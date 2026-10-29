import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

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
  | 'proof_invalid' | 'wallet_not_found' | 'account_mismatch' | 'proof_replayed' | 'proof_expired'
  | 'invalid_request' | 'challenge_invalid' | 'signature_invalid';
export class LifecyclePreviewError extends Error {
  constructor(readonly code: LifecycleFailureCode, readonly status: number) { super(code); }
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const time = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const uuid = () => {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') return cryptoObject.randomUUID();
  // Test-only fallback for runtimes without Web Crypto; app screens inject expo-crypto's randomUUID.
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-a' + hex.slice(17, 20) + '-' + hex.slice(20);
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** State is owned by this adapter instance, just like a server-side pending record. */
export class MockAccountLifecycleAdapter {
  readonly mode = 'mock-only' as const;
  readonly calls: LifecycleRequest[] = [];
  private status: AccountLifecycleStatus = 'active';
  private receipt: DeletionReceipt | null = null;
  private readonly deletionRecords = new Map<string, { receipt: DeletionReceipt; status: AccountLifecycleStatus }>();
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
      receipt_expires_at: time(requested + 60 * 86400_000),
    };
    this.deletionRecords.set(this.receipt.deletion_id, { receipt: clone(this.receipt), status: 'deletion_pending' });
    this.idempotency.set(input.idempotencyKey, { fingerprint, receipt: clone(this.receipt) });
    return clone(this.receipt);
  }
  async deletionStatus(deletionId: string, receiptToken: string): Promise<DeletionStatus> {
    const record = this.deletionRecords.get(deletionId);
    if (!record) throw new LifecyclePreviewError('receipt_expired', 410);
    if (!receiptToken || receiptToken !== record.receipt.receipt_token || this.now() >= Date.parse(record.receipt.receipt_expires_at)) {
      throw new LifecyclePreviewError('receipt_expired', 410);
    }
    this.calls.push({ method: 'GET', path: '/api/v2/account/deletions/' + deletionId, auth: 'receipt' });
    return { deletion_id: deletionId, status: record.status, requested_at: record.receipt.requested_at, scheduled_delete_at: record.receipt.scheduled_delete_at };
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
    const record = this.deletionRecords.get(input.deletionId);
    if (!record || record.status !== 'deletion_pending' || this.now() >= Date.parse(record.receipt.scheduled_delete_at)) throw new LifecyclePreviewError('deletion_not_cancellable', 410);
    this.calls.push({ method: 'POST', path: '/api/v2/account/deletions/' + input.deletionId + '/cancel', auth: 'account_fresh', idempotency_key: input.idempotencyKey });
    record.status = 'deletion_cancelled';
    if (this.receipt?.deletion_id === input.deletionId) this.status = 'deletion_cancelled';
    const result = { deletion_id: input.deletionId, status: record.status, requested_at: record.receipt.requested_at, scheduled_delete_at: record.receipt.scheduled_delete_at };
    this.cancelResults.set(input.idempotencyKey, { fingerprint, result: clone(result) });
    return clone(result);
  }
  /** Mock the 30-day lifecycle transition without performing any external deletion. */
  finalizeDeletion() {
    for (const record of this.deletionRecords.values()) {
      if (record.status === 'deletion_pending' && this.now() >= Date.parse(record.receipt.scheduled_delete_at)) record.status = 'deleted';
    }
    const current = this.receipt && this.deletionRecords.get(this.receipt.deletion_id);
    if (current) this.status = current.status;
  }
}

export type DetachChallenge = {
  challenge_id: string;
  nonce: string;
  network: 'mainnet' | 'regtest';
  wallet_pubkey: string;
  message: string;
  action: 'wallet_detach';
  action_params: { wallet_id: string; party_id: string; account_generation: number };
  installation_id: string;
  issued_at: string;
  expires_at: string;
};
export class MockWalletDetachAdapter {
  readonly mode = 'mock-only' as const;
  readonly calls: LifecycleRequest[] = [];
  private readonly pendingChallenges = new Map<string, DetachChallenge>();
  private readonly challengeResults = new Map<string, { fingerprint: string; result: DetachChallenge }>();
  private readonly consumedChallenges = new Set<string>();
  private readonly consumedNonces = new Set<string>();
  private detached = false;
  private readonly verifyResults = new Map<string, { fingerprint: string; result: { proof_token: string } }>();
  private readonly issuedProofs = new Map<string, { challengeId: string; installationId: string; expiresAt: number; used: boolean }>();
  private readonly detachResults = new Map<string, { fingerprint: string; result: DetachReceipt }>();
  constructor(private readonly walletId: string, private readonly partyId: string, private readonly generation: number,
    private readonly now: () => number = Date.now, private readonly makeUuid: () => string = uuid,
    private readonly network: 'mainnet' | 'regtest' = 'mainnet', private readonly walletPubkey = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798') {}
  async challenge(installationId: string, idempotencyKey: string): Promise<DetachChallenge> {
    if (!uuidPattern.test(installationId) || !uuidPattern.test(idempotencyKey) || !/^(02|03)[0-9a-f]{64}$/i.test(this.walletPubkey)) throw new LifecyclePreviewError('invalid_request', 400);
    const fingerprint = 'POST:/api/v2/wallet/auth/challenge:' + installationId;
    const prior = this.challengeResults.get(idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new LifecyclePreviewError('idempotency_conflict', 409);
      return clone(prior.result);
    }
    for (const [id, challenge] of this.pendingChallenges) {
      if (this.now() >= Date.parse(challenge.expires_at)) this.pendingChallenges.delete(id);
    }
    if (this.pendingChallenges.size >= 5) throw new LifecyclePreviewError('rate_limited', 429);
    const issuedAt = this.now();
    const actionParams = { wallet_id: this.walletId, party_id: this.partyId, account_generation: this.generation };
    const issuedAtText = time(issuedAt);
    const expiresAtText = time(issuedAt + 300_000);
    const nonce = (this.makeUuid() + this.makeUuid()).replace(/-/g, '').toLowerCase();
    const paramsJson = JSON.stringify({ account_generation: actionParams.account_generation, party_id: actionParams.party_id, wallet_id: actionParams.wallet_id });
    const actionParamsHash = bytesToHex(sha256(utf8ToBytes(paramsJson)));
    const message = [
      'opago-wallet-auth', 'domain: api.opago.com', 'network: ' + this.network,
      'wallet_pubkey: ' + this.walletPubkey.toLowerCase(), 'nonce: ' + nonce,
      'issued_at: ' + issuedAtText, 'expires_at: ' + expiresAtText,
      'action: wallet_detach', 'action_params_sha256: ' + actionParamsHash,
    ].join('\n');
    const challenge = { challenge_id: this.makeUuid(), nonce, network: this.network, wallet_pubkey: this.walletPubkey.toLowerCase(),
      message, action: 'wallet_detach' as const, action_params: actionParams,
      installation_id: installationId, issued_at: issuedAtText, expires_at: expiresAtText };
    this.pendingChallenges.set(challenge.challenge_id, clone(challenge));
    this.calls.push({ method: 'POST', path: '/api/v2/wallet/auth/challenge', auth: 'wallet_proof',
      idempotency_key: idempotencyKey, body: { wallet_pubkey: challenge.wallet_pubkey, network: challenge.network, action: 'wallet_detach',
        action_params: challenge.action_params, installation_id: installationId } });
    this.challengeResults.set(idempotencyKey, { fingerprint, result: clone(challenge) });
    return clone(challenge);
  }
  async verify(challenge: DetachChallenge, signatureValid: boolean, idempotencyKey: string): Promise<{ proof_token: string }> {
    if (!uuidPattern.test(idempotencyKey)) throw new LifecyclePreviewError('invalid_request', 400);
    const fingerprint = 'POST:/api/v2/wallet/auth/verify:' + JSON.stringify({ challenge, signatureValid });
    const prior = this.verifyResults.get(idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new LifecyclePreviewError('idempotency_conflict', 409);
      const cachedProof = this.issuedProofs.get(bytesToHex(sha256(utf8ToBytes(prior.result.proof_token))));
      if (!cachedProof || this.now() >= cachedProof.expiresAt) throw new LifecyclePreviewError('proof_expired', 410);
      return clone(prior.result);
    }
    const pending = this.pendingChallenges.get(challenge.challenge_id);
    if (!pending || challenge.nonce !== pending.nonce ||
        challenge.installation_id !== pending.installation_id ||
        challenge.message !== pending.message || challenge.wallet_pubkey !== pending.wallet_pubkey || challenge.network !== pending.network ||
        challenge.issued_at !== pending.issued_at ||
        challenge.expires_at !== pending.expires_at ||
        JSON.stringify(challenge.action_params) !== JSON.stringify(pending.action_params)) {
      throw new LifecyclePreviewError('challenge_invalid', 401);
    }
    if (this.consumedChallenges.has(challenge.challenge_id) || this.consumedNonces.has(pending.nonce)) throw new LifecyclePreviewError('challenge_invalid', 401);
    if (this.now() >= Date.parse(pending.expires_at)) throw new LifecyclePreviewError('challenge_invalid', 401);
    if (!signatureValid) throw new LifecyclePreviewError('signature_invalid', 401);
    this.calls.push({ method: 'POST', path: '/api/v2/wallet/auth/verify', auth: 'wallet_proof',
      idempotency_key: idempotencyKey, body: { challenge_id: challenge.challenge_id, installation_id: challenge.installation_id } });
    const proofToken = 'mock-proof-' + this.makeUuid() + '-' + this.makeUuid();
    const result = { proof_token: proofToken };
    this.issuedProofs.set(bytesToHex(sha256(utf8ToBytes(proofToken))), { challengeId: pending.challenge_id,
      installationId: pending.installation_id, expiresAt: this.now() + 300_000, used: false });
    this.consumedChallenges.add(challenge.challenge_id);
    this.consumedNonces.add(pending.nonce);
    this.pendingChallenges.delete(challenge.challenge_id);
    this.verifyResults.set(idempotencyKey, { fingerprint, result: clone(result) });
    return clone(result);
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
    const issued = this.issuedProofs.get(bytesToHex(sha256(utf8ToBytes(input.proofToken))));
    if (!issued) throw new LifecyclePreviewError('proof_invalid', 403);
    if (this.now() >= issued.expiresAt) throw new LifecyclePreviewError('proof_expired', 410);
    if (!input.signatureVerified || issued.installationId !== input.installationId) throw new LifecyclePreviewError('proof_invalid', 403);
    if (issued.used) throw new LifecyclePreviewError('proof_replayed', 409);
    if (!input.installationId || this.detached) throw new LifecyclePreviewError('wallet_not_found', 404);
    this.calls.push({ method: 'POST', path: '/api/v2/account/wallets/' + this.walletId + '/detach', auth: 'account_fresh',
      idempotency_key: input.idempotencyKey, body: { proof_token: input.proofToken, installation_id: input.installationId } });
    issued.used = true; this.detached = true;
    const result = { wallet_id: this.walletId, status: 'unbound' as const, detached_at: time(this.now()), payments_enabled: false as const, evidence_id: this.makeUuid() };
    this.detachResults.set(input.idempotencyKey, { fingerprint, result: clone(result) });
    return clone(result);
  }
}
