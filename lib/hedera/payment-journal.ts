import type { HederaTransactionStatus } from './account';

export const HEDERA_PAYMENT_JOURNAL_KEY = 'opago.hedera.payment-journal.v1';

const MAX_JOURNAL_RECORDS = 50;
const TRANSACTION_ID_PATTERN =
  /^\d+\.\d+\.\d+(?:@\d+\.\d{1,9}|-\d+-\d{1,9})$/;
const ACCOUNT_ID_PATTERN = /^0\.0\.[1-9]\d*$/;
const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;

export type HederaPaymentJournalState = 'pending' | 'confirmed' | 'failed';

export interface HederaPaymentJournalRecord {
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
  version: 1;
  records: HederaPaymentJournalRecord[];
}

function assertRecord(value: unknown): HederaPaymentJournalRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Hedera payment journal contains an invalid record.');
  }
  const record = value as Partial<HederaPaymentJournalRecord>;
  if (
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

function parseDocument(raw: string | null): JournalDocument {
  if (raw === null) return { version: 1, records: [] };
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
  if (document.version !== 1 || !Array.isArray(document.records)) {
    throw new Error('Hedera payment journal version is unsupported.');
  }
  return {
    version: 1,
    records: document.records.map(assertRecord),
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
  now: () => Date = () => new Date(),
) {
  let queue: Promise<unknown> = Promise.resolve();

  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const running = queue.then(operation, operation);
    queue = running.then(() => undefined, () => undefined);
    return running;
  }

  async function read(): Promise<HederaPaymentJournalRecord[]> {
    return parseDocument(await storage.getItem(HEDERA_PAYMENT_JOURNAL_KEY)).records;
  }

  async function write(records: HederaPaymentJournalRecord[]): Promise<void> {
    const document: JournalDocument = {
      version: 1,
      records: records
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, MAX_JOURNAL_RECORDS),
    };
    await storage.setItem(HEDERA_PAYMENT_JOURNAL_KEY, JSON.stringify(document));
  }

  return {
    list(): Promise<HederaPaymentJournalRecord[]> {
      return exclusive(read);
    },

    recordSubmitted(submission: HederaPaymentSubmission): Promise<void> {
      return exclusive(async () => {
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
        const timestamp = now().toISOString();
        const existing = records.find(item => item.transactionId === submission.transactionId);
        const record: HederaPaymentJournalRecord = {
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
      return exclusive(async () => {
        const records = await read();
        const reconciled = await Promise.all(records.map(async record => {
          if (record.state !== 'pending') return record;
          let status: HederaTransactionStatus;
          try {
            status = await loadStatus(record.transactionId);
          } catch {
            return record;
          }
          if (status.state === 'pending') return record;
          return {
            ...record,
            state: status.state === 'success' ? 'confirmed' as const : 'failed' as const,
            result: safeResult(status.result || (status.state === 'success' ? 'SUCCESS' : 'UNKNOWN')),
            updatedAt: now().toISOString(),
          };
        }));
        if (JSON.stringify(reconciled) !== JSON.stringify(records)) await write(reconciled);
        return reconciled;
      });
    },

    clear(): Promise<void> {
      return exclusive(() => storage.removeItem(HEDERA_PAYMENT_JOURNAL_KEY));
    },
  };
}
