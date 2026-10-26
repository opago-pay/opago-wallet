import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { jcs, utf8 } from './encoding';
import type { PrivateStore } from './store';
import { assertTxContract, checkReceipt, type Report, type Receipt } from './tx-contract';

/** Local fences are never sent as evidence or as an ownership claim. */
export type SyncOwner = { localWalletId: string; source: 'spark' | 'hedera'; sourceWalletId: string; network: string;
  subject: string; installationId: string; generation: number };
export type TxAuthorization = { walletId: string; ownershipEpoch: number; source: SyncOwner['source']; sourceWalletId: string;
  network: string; subject: string; installationId: string; bearer: string; expiresAt: number };
export interface TxPort {
  readonly mode: 'hka' | 'contract-test';
  /** Resolves an authorized v3 binding/session. F3's v2 token is not implicitly a v3 token. */
  authorize(owner: SyncOwner): Promise<TxAuthorization>;
  report(auth: TxAuthorization, report: Report, idempotencyKey: string): Promise<Receipt>;
  receipt(auth: TxAuthorization, receiptId: string): Promise<Receipt>;
}
export type Candidate = { localId: string; report: Report };
export type SourcePage = { items: Candidate[]; next: string | null; skipped?: number };
export type SyncSource = { id: string; read(cursor: string | null): Promise<SourcePage> };
type Entry = { id: string; digest: string; localId: string; report: Report; attempts: number; retryAt: number; error?: string };
type Acknowledged = { eventId: string; identity: Pick<Report, 'id_source' | 'source_payment_id'>; receipt: Receipt; retryAt: number; attempts: number };
type Document = { version: 1; owner: SyncOwner; target: { walletId: string; ownershipEpoch: number } | null;
  entries: Entry[]; seen: Record<string, string[]>; sources: Record<string, { cursor: string | null; pages: number; cycles: number; skipped: number }>;
  receipts: Acknowledged[]; acknowledged: number; migrated: string[]; nextSource?: number };
export class SyncError extends Error {
  constructor(readonly code: string, readonly retryable = false, readonly retryAfterSeconds = 0) { super(code); }
}
export function syncUserError(cause: unknown): string {
  const code = cause instanceof SyncError ? cause.code : cause instanceof Error ? cause.message : '';
  if (['forbidden','sync_session_expired'].includes(code)) return 'Sign in and prove wallet ownership again. Reports remain queued; no payment is sent again.';
  if (['asset_not_enabled','rail_not_enabled','sync_backend_pending'].includes(code)) return 'Backend integration is still pending. Reports remain on this device.';
  if (code === 'sync_owner_changed') return 'Wallet or account changed. This synchronization was stopped.';
  if (code === 'sync_storage_full') return 'Synchronization storage is full. Existing reports are preserved. Contact support.';
  if (code === 'sync_invalid_contract' || code === 'sync_invalid_receipt') return 'The synchronization response could not be verified. Reports remain queued.';
  return 'Synchronization is unavailable. Retry later. Reports remain queued; no payment is sent again.';
}
const queues = new WeakMap<PrivateStore, Map<string, Promise<unknown>>>();
const hash = (v: unknown) => bytesToHex(sha256(utf8(jcs(v))));
export function syncKey(owner: SyncOwner) { return 'f5.outbox.v1.' + hash(owner); }
export class TransactionSync {
  private readonly key: string;
  constructor(readonly store: PrivateStore, readonly owner: SyncOwner, readonly sources: SyncSource[], readonly port: TxPort | null,
    readonly uuid: () => string, readonly assertCurrent: () => void, readonly now: () => number = Date.now) {
    if (!owner.subject || !owner.sourceWalletId || !owner.localWalletId || !Number.isSafeInteger(owner.generation) || owner.generation < 0 ||
      new Set(sources.map(s => s.id)).size !== sources.length || sources.some(s => !/^[a-z][a-z0-9_-]{0,63}$/.test(s.id))) throw new SyncError('sync_owner_changed');
    this.owner = Object.freeze({ ...owner }); this.key = syncKey(this.owner);
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    let queue = queues.get(this.store); if (!queue) { queue = new Map(); queues.set(this.store, queue); }
    const result = (queue.get(this.key) || Promise.resolve()).catch(() => undefined).then(async () => { this.assertCurrent(); return work(); });
    queue.set(this.key, result); return result;
  }
  private async load(): Promise<Document> {
    this.assertCurrent(); const document = await this.store.read<Document>(this.key); this.assertCurrent();
    if (!document) return { version: 1, owner: this.owner, target: null, entries: [], seen: {}, sources: {}, receipts: [], acknowledged: 0, migrated: [] };
    if (document.version !== 1 || jcs(document.owner) !== jcs(this.owner) || !Array.isArray(document.entries) ||
      !Array.isArray(document.receipts) || !document.seen || !document.sources || !Array.isArray(document.migrated) ||
      !Number.isSafeInteger(document.acknowledged)) throw new SyncError('sync_invalid_contract');
    for (const e of document.entries) { assertTxContract('WalletPaymentReport', e.report); this.checkSource(e.report); }
    return document;
  }
  private async save(doc: Document) {
    this.assertCurrent(); if (utf8(jcs(doc)).length > 1_500_000) throw new SyncError('sync_storage_full');
    await this.store.write(this.key, doc); this.assertCurrent();
  }
  private checkSource(report: Report) {
    if (this.owner.source === 'spark' && report.asset !== 'BTC' || this.owner.source === 'hedera' &&
      (report.asset !== 'HBAR' || report.network !== this.owner.network)) throw new SyncError('sync_owner_changed');
  }
  private enqueue(doc: Document, items: Candidate[]) {
    for (const item of items) {
      if (!item.localId || item.localId.length > 512) throw new SyncError('sync_invalid_contract');
      assertTxContract('WalletPaymentReport', item.report); this.checkSource(item.report);
      if (Object.hasOwn(item.report, 'preimage')) throw new SyncError('sync_invalid_contract');
      // The only event UUID is the durable Idempotency-Key. The current wire contract has no event_id field.
      const { observed_at: ignored, ...facts } = item.report; void ignored;
      const digest = hash(facts); const localKey = hash(item.localId); const seen = doc.seen[localKey] || [];
      if (seen.includes(digest)) continue;
      if (doc.entries.length >= 500 || Object.keys(doc.seen).length >= 10_000 && !doc.seen[localKey] || seen.length >= 64) throw new SyncError('sync_storage_full');
      doc.entries.push({ id: this.uuid(), localId: item.localId, digest, report: item.report, attempts: 0, retryAt: 0 });
      doc.seen[localKey] = [...seen, digest];
    }
  }
  /** Migration uses the existing journals after their own idempotent v1/v2 migration.
   * No old transport cursor/ack is treated as a v3 ack; no journal is deleted. */
  migrate(marker: string, candidates: Candidate[]) { return this.serial(async () => {
    const doc = await this.load(); if (doc.migrated.includes(marker)) return;
    this.enqueue(doc, candidates); doc.migrated.push(marker); await this.save(doc);
  }); }
  collect(maxPages = 8) { return this.serial(async () => {
    if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 50) throw new SyncError('sync_invalid_contract');
    const doc = await this.load(); let pages = 0; const visited = new Map<string, Set<string | null>>(); const finished = new Set<string>();
    let failure: unknown;
    // Fair across independent streams; completion resets to the head, allowing overlap/status updates on the next pass.
    for (let round = 0; pages < maxPages && round < maxPages; round++) {
      for (let i = 0; i < this.sources.length; i++) {
        if (pages >= maxPages) break;
        const source = this.sources[doc.nextSource || 0]; doc.nextSource = ((doc.nextSource || 0) + 1) % this.sources.length;
        if (finished.has(source.id)) continue;
        const progress = doc.sources[source.id] || { cursor: null, pages: 0, cycles: 0, skipped: 0 };
        let page: SourcePage;
        try { page = await source.read(progress.cursor); this.assertCurrent(); }
        catch (cause) { this.assertCurrent(); failure ||= cause; finished.add(source.id); continue; }
        if (!Array.isArray(page.items) || page.next !== null && (typeof page.next !== 'string' || page.next.length > 4096 || page.next === progress.cursor)) throw new SyncError('sync_invalid_contract');
        const cursors = visited.get(source.id) || new Set(); cursors.add(progress.cursor); visited.set(source.id, cursors);
        if (page.next !== null && cursors.has(page.next)) throw new SyncError('sync_invalid_contract');
        this.enqueue(doc, page.items);
        doc.sources[source.id] = { cursor: page.next, pages: progress.pages + 1, cycles: progress.cycles + (page.next === null ? 1 : 0), skipped: progress.skipped + (page.skipped || 0) };
        await this.save(doc); // Items and source checkpoint are one atomic protected document.
        if (page.next === null) finished.add(source.id);
        pages++;
      }
      if (!this.sources.length) break;
    }
    if (failure) throw failure;
  }); }
  private async authorization(doc: Document) {
    if (!this.port) throw new SyncError('sync_backend_pending');
    const auth = await this.port.authorize(this.owner); this.assertCurrent();
    if (auth.subject !== this.owner.subject || auth.source !== this.owner.source || auth.sourceWalletId !== this.owner.sourceWalletId ||
      auth.network !== this.owner.network || auth.installationId !== this.owner.installationId) throw new SyncError('sync_owner_changed');
    assertTxContract('Uuid', auth.walletId);
    if (!Number.isSafeInteger(auth.ownershipEpoch) || auth.ownershipEpoch < 1 || !auth.bearer || auth.expiresAt <= this.now()) throw new SyncError('sync_session_expired');
    if (doc.target && (doc.target.walletId !== auth.walletId || doc.target.ownershipEpoch !== auth.ownershipEpoch)) throw new SyncError('sync_owner_changed');
    if (!doc.target) { doc.target = { walletId: auth.walletId, ownershipEpoch: auth.ownershipEpoch }; await this.save(doc); }
    return auth;
  }
  private delay(attempt: number, minimum = 0) { return Math.max(minimum * 1000, Math.min(300_000, 1000 * 2 ** Math.min(attempt, 9))); }
  /** Only an authenticated, definite no-write rejection can create a new raw report.
   * Unknown/lost responses always keep their original key. Explicit action, never automatic. */
  retryDisabledReports() { return this.serial(async () => {
    const doc = await this.load();
    for (const e of doc.entries) if (e.error === 'asset_not_enabled' || e.error === 'rail_not_enabled') {
      e.id = this.uuid(); e.attempts = 0; e.retryAt = 0; delete e.error;
    }
    await this.save(doc);
  }); }
  flush(maxReports = 20) { return this.serial(async () => {
    if (!Number.isSafeInteger(maxReports) || maxReports < 1 || maxReports > 100) throw new SyncError('sync_invalid_contract');
    const doc = await this.load(); const auth = await this.authorization(doc); let sent = 0;
    for (const entry of [...doc.entries]) {
      if (sent >= maxReports) break;
      if (entry.retryAt > this.now() || entry.error && !['sync_network','sync_session_expired','forbidden','tme_pending','tme_unavailable','upstream_unavailable','upstream_timeout','sync_invalid_receipt','sync_invalid_contract'].includes(entry.error)) continue;
      this.assertCurrent(); if (auth.expiresAt <= this.now()) throw new SyncError('sync_session_expired');
      entry.attempts++; entry.retryAt = this.now() + this.delay(entry.attempts); await this.save(doc);
      try {
        const receipt = await this.port!.report(auth, entry.report, entry.id); this.assertCurrent();
        checkReceipt(receipt, auth.walletId, entry.report);
        if (doc.receipts.length >= 10_000) throw new SyncError('sync_storage_full');
        doc.entries = doc.entries.filter(e => e.id !== entry.id);
        doc.receipts.push({ eventId: entry.id, identity: { id_source: entry.report.id_source, source_payment_id: entry.report.source_payment_id }, receipt,
          retryAt: receipt.retry_due_at ? Date.parse(receipt.retry_due_at) : 0, attempts: 0 });
        doc.acknowledged++; await this.save(doc); // A lost write replays the exact same key and body.
      } catch (cause) {
        this.assertCurrent(); entry.error = cause instanceof SyncError ? cause.code : cause instanceof Error && cause.message.startsWith('sync_') ? cause.message : 'sync_network';
        entry.retryAt = this.now() + this.delay(entry.attempts, cause instanceof SyncError ? cause.retryAfterSeconds : 0);
        await this.save(doc); throw cause;
      }
      sent++;
    }
  }); }
  refreshReceipts(maxReceipts = 20) { return this.serial(async () => {
    if (!Number.isSafeInteger(maxReceipts) || maxReceipts < 1 || maxReceipts > 100) throw new SyncError('sync_invalid_contract');
    const doc = await this.load(); const auth = await this.authorization(doc); let read = 0;
    for (const ack of doc.receipts) {
      if (read >= maxReceipts) break;
      if (!['unresolved','quarantined'].includes(ack.receipt.resolution) && ack.receipt.verification_status === 'verified' || ack.receipt.resolution === 'non_payment' || ack.retryAt > this.now()) continue;
      this.assertCurrent(); if (auth.expiresAt <= this.now()) throw new SyncError('sync_session_expired');
      ack.attempts++; ack.retryAt = this.now() + this.delay(ack.attempts); await this.save(doc);
      const receipt = await this.port!.receipt(auth, ack.receipt.receipt_id); this.assertCurrent();
      checkReceipt(receipt, auth.walletId, ack.identity as Report);
      if (receipt.receipt_id !== ack.receipt.receipt_id) throw new SyncError('sync_invalid_receipt');
      ack.receipt = receipt; ack.retryAt = receipt.retry_due_at ? Math.max(this.now() + 5000, Date.parse(receipt.retry_due_at)) : this.now() + 60_000;
      await this.save(doc); read++;
    }
  }); }
  snapshot() { return this.serial(async () => {
    const doc = await this.load(); return { queued: doc.entries.length, pending: doc.entries.filter(e => e.report.status === 'pending').length,
      settled: doc.entries.filter(e => e.report.status === 'settled').length, failed: doc.entries.filter(e => ['failed','canceled'].includes(e.report.status || '')).length,
      unknown: doc.entries.filter(e => e.report.status === null).length, retrying: doc.entries.filter(e => e.attempts > 0 && !e.error).length,
      blocked: doc.entries.filter(e => e.error).length, acknowledged: doc.acknowledged,
      verified: doc.receipts.filter(e => e.receipt.verification_status === 'verified' && e.receipt.resolution === 'linked').length,
      unresolved: doc.receipts.filter(e => ['unresolved','quarantined'].includes(e.receipt.resolution)).length,
      provisional: doc.receipts.filter(e => e.receipt.resolution === 'linked' && e.receipt.verification_status === 'wallet_reported').length,
      sources: doc.sources, backendAvailable: !!this.port, nextRetryAt: Math.min(...doc.entries.map(e => e.retryAt).filter(t => t > this.now()), Infinity) };
  }); }
}
