import { jcs } from './encoding';
import { assertTxContract, externalId, type Report, type Receipt, type PaymentStatus } from './tx-contract';
import { SyncError, type TxPort, type SyncOwner, type TxAuthorization } from './tx-sync';
import type { PrivateStore } from './store';
type Stored = { key: string; digest: string; receipt: Receipt };
type Identity = { externalId: string; transactionId: string; terminal: PaymentStatus | null; conflict: boolean; verified: boolean };
type TestDocument = { reports: Stored[]; identities: Identity[]; rejections?: { key: string; digest: string; code: string }[] };
const timestamp = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z','Z');
/** Synthetic, explicitly selected local backend. No network, SDK, POS or payment access.
 * HBAR disabled by default as in the merged contract. The opt-in represents PR 593 acceptance only. */
export class TransactionContractTestAdapter implements TxPort {
  readonly mode = 'contract-test' as const;
  readonly writes: { key: string; report: Report }[] = [];
  loseNextResponse = false;
  rejectNext: SyncError | null = null;
  enabledHbar = false;
  expired = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly store: PrivateStore, readonly owner: SyncOwner, readonly uuid: () => string,
    readonly now: () => number = Date.now, readonly walletId = 'a5555555-5555-4555-8555-555555555555') {}
  async authorize(owner: SyncOwner): Promise<TxAuthorization> {
    if (jcs(owner) !== jcs(this.owner)) throw new SyncError('forbidden');
    if (this.expired) throw new SyncError('sync_session_expired');
    return { walletId: this.walletId, ownershipEpoch: 1, source: owner.source, sourceWalletId: owner.sourceWalletId,
      subject: owner.subject, network: owner.network, installationId: owner.installationId,
      bearer: 'synthetic-local-wallet-token', expiresAt: this.now() + 60_000 };
  }
  private serial<T>(work: () => Promise<T>) { const result = this.queue.catch(() => undefined).then(work); this.queue = result; return result; }
  private key() { return 'f5.test.receipts.' + this.walletId; }
  private async load(): Promise<TestDocument> {
    const old = await this.store.read<TestDocument | Stored[]>(this.key());
    return !old ? { reports: [], identities: [] } : Array.isArray(old) ? { reports: old, identities: [] } : old;
  }
  private async check(auth: TxAuthorization) {
    const current = await this.authorize(this.owner);
    if (auth.walletId !== current.walletId || auth.subject !== current.subject || auth.sourceWalletId !== current.sourceWalletId ||
      auth.source !== current.source || auth.network !== current.network || auth.installationId !== current.installationId || auth.bearer !== current.bearer ||
      auth.ownershipEpoch !== current.ownershipEpoch || auth.expiresAt <= this.now()) throw new SyncError('forbidden');
  }
  report(auth: TxAuthorization, report: Report, key: string): Promise<Receipt> { return this.serial(async () => {
    await this.check(auth); assertTxContract('WalletPaymentReport', report); assertTxContract('Uuid', key);
    const document = await this.load(); const stored = document.reports; const digest = jcs(report);
    const rejection = document.rejections?.find(v => v.key === key);
    if (rejection) { if (rejection.digest !== digest) throw new SyncError('idempotency_conflict'); throw new SyncError(rejection.code); }
    if (this.rejectNext || report.asset === 'HBAR' && !this.enabledHbar) {
      const error = this.rejectNext || new SyncError('asset_not_enabled'); this.rejectNext = null;
      if (!error.retryable) { document.rejections ||= []; document.rejections.push({ key, digest, code: error.code }); await this.store.write(this.key(), document); }
      throw error;
    }
    if (report.asset === 'HBAR' ? this.owner.source !== 'hedera' || report.network !== this.owner.network : this.owner.source !== 'spark') throw new SyncError('forbidden');
    const previous = stored.find(v => v.key === key);
    if (previous) { if (previous.digest !== digest) throw new SyncError('idempotency_conflict'); return previous.receipt; }
    const unresolved = report.status === null || report.status === 'pending' || (report.asset === 'BTC' ? report.amount_msat : report.amount_tinybar) === null;
    const external = externalId(report); let identity = document.identities.find(v => v.externalId === external);
    if (external && !unresolved) {
      if (!identity) { identity = { externalId: external, transactionId: this.uuid(), terminal: report.status, conflict: false, verified: false }; document.identities.push(identity); }
      else if (identity.terminal && identity.terminal !== report.status) { identity.conflict = true; identity.verified = false; }
    }
    const receipt: Receipt = { receipt_id: this.uuid(), wallet_id: auth.walletId, received_at: timestamp(this.now()), id_source: report.id_source,
      source_payment_id: report.source_payment_id, external_id: externalId(report),
      resolution: report.source_payment_id === null ? 'quarantined' : !identity || identity.conflict ? 'unresolved' : 'linked',
      transaction_id: identity && !identity.conflict ? identity.transactionId : null,
      verification_status: identity?.verified ? 'verified' : 'wallet_reported', retry_due_at: !identity || identity.conflict ? timestamp(this.now() + 5000) : null };
    assertTxContract('WalletPaymentReceipt', receipt);
    stored.push({ key, digest, receipt });
    if (identity) for (const row of stored.filter(row => row.receipt.external_id === identity!.externalId)) {
      row.receipt.resolution = identity.conflict ? 'unresolved' : 'linked'; row.receipt.transaction_id = identity.conflict ? null : identity.transactionId;
      row.receipt.verification_status = identity.verified ? 'verified' : 'wallet_reported'; row.receipt.retry_due_at = identity.conflict ? timestamp(this.now() + 5000) : null;
    }
    await this.store.write(this.key(), document); this.writes.push({ key, report });
    if (this.loseNextResponse) { this.loseNextResponse = false; throw new SyncError('sync_network', true); }
    return receipt;
  }); }
  async receipt(auth: TxAuthorization, id: string) { await this.check(auth); const records = (await this.load()).reports;
    const item = records.find(v => v.receipt.receipt_id === id); if (!item) throw new SyncError('not_found'); return item.receipt; }
  /** Explicit synthetic evidence, not a provider/network verification. */
  verifyTestEvidence() { return this.serial(async () => {
    const document = await this.load(); const records = document.reports;
    for (const row of records) if (row.receipt.source_payment_id) {
      let identity = document.identities.find(v => v.externalId === row.receipt.external_id);
      if (!identity) { identity = { externalId: row.receipt.external_id!, transactionId: row.receipt.transaction_id || this.uuid(), terminal: 'settled', conflict: false, verified: true }; document.identities.push(identity); }
      row.receipt.resolution = 'linked'; row.receipt.transaction_id = identity.transactionId; row.receipt.verification_status = 'verified'; row.receipt.retry_due_at = null;
    }
    for (const row of document.identities) { row.conflict = false; row.verified = true; }
    await this.store.write(this.key(), document);
  }); }
}
