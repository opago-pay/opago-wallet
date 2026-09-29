import type { HederaTransactionStatus } from './account';

export const HEDERA_PAYMENT_JOURNAL_KEY = 'opago.hedera.payment-journal.v1';
export const HEDERA_PAYMENT_JOURNAL_V2_PREFIX = 'opago.hedera.payment-journal.v2.';
export function hederaPaymentScope(network: 'mainnet' | 'testnet', publicKey: string): string {
  if (!/^[0-9a-f]{64}$/.test(publicKey)) throw new Error('Hedera wallet identity is invalid.');
  return `${network}:${publicKey}`;
}

const MAX_SETTLED_RECORDS = 50;
const MAX_PENDING_RECORDS = 10_000;
const TRANSACTION_ID_PATTERN =
  /^\d+\.\d+\.\d+(?:@\d+\.\d{1,9}|-\d+-\d{1,9})$/;
const ACCOUNT_ID_PATTERN = /^0\.0\.[1-9]\d*$/;
const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;
function transactionPayer(transactionId: string): string | null {
  return /^(\d+\.\d+\.\d+)(?:@|-)/.exec(transactionId)?.[1] || null;
}

export type HederaPaymentJournalState = 'pending' | 'confirmed' | 'failed';

export interface HederaPaymentJournalRecord {
  scope: string;
  transactionId: string;
  mode: 'direct' | 'checkout';
  recipientAccountId: string;
  amountTinybars: string;
  paymentId: string | null;
  state: HederaPaymentJournalState;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HederaPaymentSubmission {
  transactionId: string;
  mode: 'direct' | 'checkout';
  recipientAccountId: string;
  amountTinybars: bigint;
  paymentId?: string;
}

export interface HederaPaymentResolution {
  transactionId: string;
  state: 'confirmed' | 'failed';
  result: string;
}

export interface HederaPaymentLifecycle {
  onSubmitted?(submission: HederaPaymentSubmission): Promise<void>;
  onResolved?(resolution: HederaPaymentResolution): Promise<void>;
}

export interface HederaPaymentJournalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface JournalDocument {
  version: 2;
  scope: string;
  records: HederaPaymentJournalRecord[];
}

function assertRecord(value: unknown, scope: string): HederaPaymentJournalRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Hedera payment journal contains an invalid record.');
  }
  const record = value as Partial<HederaPaymentJournalRecord>;
  if (
    record.scope !== scope ||
    typeof record.transactionId !== 'string' ||
    !TRANSACTION_ID_PATTERN.test(record.transactionId) ||
    (record.mode !== 'direct' && record.mode !== 'checkout') ||
    typeof record.recipientAccountId !== 'string' ||
    !ACCOUNT_ID_PATTERN.test(record.recipientAccountId) ||
    typeof record.amountTinybars !== 'string' ||
    !/^[1-9]\d*$/.test(record.amountTinybars) ||
    (record.paymentId !== null &&
      (typeof record.paymentId !== 'string' || !BYTES32_PATTERN.test(record.paymentId))) ||
    (record.state !== 'pending' && record.state !== 'confirmed' && record.state !== 'failed') ||
    (record.result !== null && typeof record.result !== 'string') ||
    typeof record.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    typeof record.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    throw new Error('Hedera payment journal contains an invalid record.');
  }
  return record as HederaPaymentJournalRecord;
}

function parseDocument(raw: string | null, scope: string): JournalDocument {
  if (raw === null) return { version: 2, scope, records: [] };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Hedera payment journal is not valid JSON.');
  }
  if (!value || typeof value !== 'object') {
    throw new Error('Hedera payment journal is invalid.');
  }
  const document = value as Partial<JournalDocument>;
  if (document.version !== 2 || document.scope !== scope || !Array.isArray(document.records)) {
    throw new Error('Hedera payment journal version is unsupported.');
  }
  return {
    version: 2, scope,
    records: document.records.map(record => assertRecord(record, scope)),
  };
}

function safeResult(result: string): string {
  const normalized = result.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(normalized)) {
    throw new Error('Hedera payment result is invalid.');
  }
  return normalized;
}

export function createHederaPaymentJournal(
  storage: HederaPaymentJournalStorage,
  scope: string,
  now: () => Date = () => new Date(),
) {
  if (!/^(mainnet|testnet):[0-9a-f]{64}$/.test(scope)) throw new Error('Hedera payment scope is invalid.');
  const key = HEDERA_PAYMENT_JOURNAL_V2_PREFIX + scope;
  let queue: Promise<unknown> = Promise.resolve();
  let generation = 0;

  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const running = queue.then(operation, operation);
    queue = running.then(() => undefined, () => undefined);
    return running;
  }

  async function read(): Promise<HederaPaymentJournalRecord[]> {
    return parseDocument(await storage.getItem(key), scope).records;
  }

  async function assertNoUnscopedPending(): Promise<void> {
    const raw = await storage.getItem(HEDERA_PAYMENT_JOURNAL_KEY);
    if (raw === null) return;
    let legacy: unknown;
    try { legacy = JSON.parse(raw); }
    catch { throw new Error('Legacy Hedera payment journal needs review before another payment.'); }
    const document = legacy as { version?: unknown; records?: unknown };
    if (document?.version !== 1 || !Array.isArray(document.records) ||
        document.records.some((record: unknown) => !record || typeof record !== 'object' ||
          !['pending', 'confirmed', 'failed'].includes((record as { state?: string }).state || ''))) {
      throw new Error('Legacy Hedera payment journal needs review before another payment.');
    }
    if (document.records.some((record: { state: string }) => record.state === 'pending')) {
      throw new Error('An unscoped Hedera payment is unresolved. Review it before sending again.');
    }
  }

  async function write(records: HederaPaymentJournalRecord[]): Promise<void> {
    const pending = records.filter(record => record.state === 'pending');
    const settled = records.filter(record => record.state !== 'pending');
    const document: JournalDocument = {
      version: 2, scope,
      // Keep every unresolved transfer even when later settled payments arrive.
      // Only completed history is trimmed by the local display limit.
      records: [...pending, ...settled.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, MAX_SETTLED_RECORDS)].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
    await storage.setItem(key, JSON.stringify(document));
  }

  return {
    list(): Promise<HederaPaymentJournalRecord[]> {
      return exclusive(read);
    },

    assertNoUnresolvedDirectPayment(sourceAccountId: string): Promise<void> {
      return exclusive(async () => {
        await assertNoUnscopedPending();
        if ((await read()).some(item => item.mode === 'direct' && item.state === 'pending' &&
          transactionPayer(item.transactionId) === sourceAccountId)) {
          throw new Error('A previous HBAR payment is still being checked. Do not send it again.');
        }
      });
    },

    recordSubmitted(submission: HederaPaymentSubmission): Promise<void> {
      return exclusive(async () => {
        await assertNoUnscopedPending();
        if (!TRANSACTION_ID_PATTERN.test(submission.transactionId)) {
          throw new Error('Hedera transaction ID is invalid.');
        }
        if (!ACCOUNT_ID_PATTERN.test(submission.recipientAccountId)) {
          throw new Error('Hedera recipient account ID is invalid.');
        }
        if (submission.amountTinybars <= 0n) {
          throw new Error('Hedera payment amount must be positive.');
        }
        const paymentId = submission.paymentId?.toLowerCase() || null;
        if (paymentId !== null && !BYTES32_PATTERN.test(paymentId)) {
          throw new Error('Hedera checkout payment ID is invalid.');
        }
        const records = await read();
        if (submission.mode === 'direct' && records.some(item =>
          item.mode === 'direct' && item.state === 'pending' &&
          transactionPayer(item.transactionId) === transactionPayer(submission.transactionId))) {
          throw new Error('A previous HBAR payment is still being checked. Do not send it again.');
        }
        if (!records.some(item => item.transactionId === submission.transactionId) &&
            records.filter(item => item.state === 'pending').length >= MAX_PENDING_RECORDS) {
          throw new Error('Too many unresolved Hedera payments. Resolve them before sending again.');
        }
        const timestamp = now().toISOString();
        const existing = records.find(item => item.transactionId === submission.transactionId);
        const record: HederaPaymentJournalRecord = {
          scope,
          transactionId: submission.transactionId,
          mode: submission.mode,
          recipientAccountId: submission.recipientAccountId,
          amountTinybars: submission.amountTinybars.toString(),
          paymentId,
          state: existing?.state || 'pending',
          result: existing?.result || null,
          createdAt: existing?.createdAt || timestamp,
          updatedAt: timestamp,
        };
        await write([
          record,
          ...records.filter(item => item.transactionId !== submission.transactionId),
        ]);
      });
    },

    recordResolved(resolution: HederaPaymentResolution): Promise<void> {
      return exclusive(async () => {
        const records = await read();
        const existing = records.find(item => item.transactionId === resolution.transactionId);
        if (!existing) return;
        const updated: HederaPaymentJournalRecord = {
          ...existing,
          state: resolution.state,
          result: safeResult(resolution.result),
          updatedAt: now().toISOString(),
        };
        await write([
          updated,
          ...records.filter(item => item.transactionId !== resolution.transactionId),
        ]);
      });
    },

    reconcile(
      loadStatus: (transactionId: string) => Promise<HederaTransactionStatus>,
    ): Promise<HederaPaymentJournalRecord[]> {
      return (async () => {
        const snapshot = await exclusive(async () => ({ records: await read(), generation }));
        const pending = snapshot.records.filter(record => record.state === 'pending');
        const outcomes = new Map<string, HederaTransactionStatus>();
        // Network requests must not hold the storage queue used by submissions.
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
          while (next < pending.length) {
            const record = pending[next++];
            try { outcomes.set(record.transactionId, await loadStatus(record.transactionId)); }
            catch { /* Keep this payment unresolved. */ }
          }
        }));
        return exclusive(async () => {
          const records = await read();
          if (snapshot.generation !== generation) return records;
          let changed = false;
          const reconciled = records.map(record => {
            const status = outcomes.get(record.transactionId);
            if (record.state !== 'pending' || !status || status.state === 'pending' ||
                (status.state === 'success' && status.result !== 'SUCCESS') ||
                (status.state === 'failed' && (!status.result || status.result === 'UNKNOWN'))) return record;
            changed = true;
            return {
              ...record,
              state: status.state === 'success' ? 'confirmed' as const : 'failed' as const,
              result: safeResult(status.result!),
              updatedAt: now().toISOString(),
            };
          });
          if (changed) await write(reconciled);
          return reconciled;
        });
      })();
    },

    clear(): Promise<void> {
      return exclusive(async () => {
        generation += 1;
        await storage.removeItem(key);
      });
    },
  };
}
