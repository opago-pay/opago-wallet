export const LIGHTNING_PAYMENT_JOURNAL_KEY = 'opago.lightning.payment-journal.v1';

const MAX_JOURNAL_RECORDS = 100;
const PAYMENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const RESULT_PATTERN = /^[A-Z][A-Z0-9_]{0,95}$/;

export type LightningPaymentJournalState = 'pending' | 'confirmed' | 'failed';

export interface LightningPaymentJournalRecord {
  paymentHash: string;
  amountSats: number;
  requestId: string | null;
  state: LightningPaymentJournalState;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LightningPaymentResolution {
  state: 'pending' | 'confirmed' | 'failed';
  result: string | null;
  requestId?: string | null;
}

export interface LightningPaymentJournalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface JournalDocument {
  version: 1;
  records: LightningPaymentJournalRecord[];
}

function normalizePaymentHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!PAYMENT_HASH_PATTERN.test(normalized)) {
    throw new Error('Lightning payment hash is invalid.');
  }
  return normalized;
}

function normalizeRequestId(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error('Lightning request ID is invalid.');
  }
  return normalized;
}

function normalizeResult(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().toUpperCase();
  if (!RESULT_PATTERN.test(normalized)) {
    throw new Error('Lightning payment result is invalid.');
  }
  return normalized;
}

function assertRecord(value: unknown): LightningPaymentJournalRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Lightning payment journal contains an invalid record.');
  }
  const record = value as Partial<LightningPaymentJournalRecord>;
  if (
    typeof record.paymentHash !== 'string' ||
    !PAYMENT_HASH_PATTERN.test(record.paymentHash) ||
    !Number.isSafeInteger(record.amountSats) ||
    (record.amountSats || 0) <= 0 ||
    (record.requestId !== null &&
      (
        typeof record.requestId !== 'string' ||
        record.requestId !== record.requestId.trim() ||
        record.requestId.length < 1 ||
        record.requestId.length > 512 ||
        /[\u0000-\u001f\u007f]/.test(record.requestId)
      )) ||
    (record.state !== 'pending' && record.state !== 'confirmed' && record.state !== 'failed') ||
    (record.result !== null &&
      (typeof record.result !== 'string' || !RESULT_PATTERN.test(record.result))) ||
    typeof record.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    typeof record.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    throw new Error('Lightning payment journal contains an invalid record.');
  }
  return record as LightningPaymentJournalRecord;
}

function parseDocument(raw: string | null): JournalDocument {
  if (raw === null) return { version: 1, records: [] };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Lightning payment journal is not valid JSON.');
  }
  if (!value || typeof value !== 'object') {
    throw new Error('Lightning payment journal is invalid.');
  }
  const document = value as Partial<JournalDocument>;
  if (document.version !== 1 || !Array.isArray(document.records)) {
    throw new Error('Lightning payment journal version is unsupported.');
  }
  if (document.records.length > MAX_JOURNAL_RECORDS) {
    throw new Error('Lightning payment journal exceeds its safe size.');
  }
  return { version: 1, records: document.records.map(assertRecord) };
}

export function createLightningPaymentJournal(
  storage: LightningPaymentJournalStorage,
  now: () => Date = () => new Date(),
) {
  let queue: Promise<unknown> = Promise.resolve();

  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const running = queue.then(operation, operation);
    queue = running.then(() => undefined, () => undefined);
    return running;
  }

  async function read(): Promise<LightningPaymentJournalRecord[]> {
    return parseDocument(await storage.getItem(LIGHTNING_PAYMENT_JOURNAL_KEY)).records;
  }

  async function write(records: LightningPaymentJournalRecord[]): Promise<void> {
    const pending = records.filter(record => record.state === 'pending');
    if (pending.length > MAX_JOURNAL_RECORDS) {
      throw new Error('Too many Lightning payments are still unresolved.');
    }
    const resolved = records
      .filter(record => record.state !== 'pending')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MAX_JOURNAL_RECORDS - pending.length);
    const document: JournalDocument = {
      version: 1,
      records: [...pending, ...resolved]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
    await storage.setItem(LIGHTNING_PAYMENT_JOURNAL_KEY, JSON.stringify(document));
  }

  return {
    list(): Promise<LightningPaymentJournalRecord[]> {
      return exclusive(read);
    },

    get(paymentHash: string): Promise<LightningPaymentJournalRecord | null> {
      return exclusive(async () => {
        const normalized = normalizePaymentHash(paymentHash);
        return (await read()).find(record => record.paymentHash === normalized) || null;
      });
    },

    recordPending(paymentHash: string, amountSats: number): Promise<void> {
      return exclusive(async () => {
        const normalized = normalizePaymentHash(paymentHash);
        if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
          throw new Error('Lightning payment amount must be a positive whole number of satoshis.');
        }
        const records = await read();
        const existing = records.find(record => record.paymentHash === normalized);
        if (existing?.state === 'confirmed') {
          throw new Error('This Lightning invoice has already been paid.');
        }
        if (existing?.state === 'pending') {
          throw new Error('This Lightning payment is already being processed.');
        }
        if (!existing && records.filter(record => record.state === 'pending').length >= MAX_JOURNAL_RECORDS) {
          throw new Error('Too many Lightning payments are still unresolved. Refresh activity before sending again.');
        }
        const timestamp = now().toISOString();
        const record: LightningPaymentJournalRecord = {
          paymentHash: normalized,
          amountSats,
          requestId: null,
          state: 'pending',
          result: null,
          createdAt: existing?.createdAt || timestamp,
          updatedAt: timestamp,
        };
        await write([record, ...records.filter(item => item.paymentHash !== normalized)]);
      });
    },

    recordRequestId(paymentHash: string, requestId: string): Promise<void> {
      return exclusive(async () => {
        const normalized = normalizePaymentHash(paymentHash);
        const normalizedRequestId = normalizeRequestId(requestId);
        const records = await read();
        const existing = records.find(record => record.paymentHash === normalized);
        if (!existing || !normalizedRequestId) return;
        const updated = {
          ...existing,
          requestId: normalizedRequestId,
          updatedAt: now().toISOString(),
        };
        await write([updated, ...records.filter(item => item.paymentHash !== normalized)]);
      });
    },

    recordResolved(
      paymentHash: string,
      state: 'confirmed' | 'failed',
      result: string,
      requestId?: string | null,
    ): Promise<void> {
      return exclusive(async () => {
        const normalized = normalizePaymentHash(paymentHash);
        const records = await read();
        const existing = records.find(record => record.paymentHash === normalized);
        if (!existing) return;
        const updated: LightningPaymentJournalRecord = {
          ...existing,
          requestId: normalizeRequestId(requestId) || existing.requestId,
          state,
          result: normalizeResult(result),
          updatedAt: now().toISOString(),
        };
        await write([updated, ...records.filter(item => item.paymentHash !== normalized)]);
      });
    },

    reconcile(
      resolve: (record: LightningPaymentJournalRecord) => Promise<LightningPaymentResolution>,
    ): Promise<LightningPaymentJournalRecord[]> {
      return exclusive(async () => {
        const records = await read();
        const reconciled = await Promise.all(records.map(async record => {
          if (record.state !== 'pending') return record;
          let resolution: LightningPaymentResolution;
          try {
            resolution = await resolve(record);
          } catch {
            return record;
          }
          if (resolution.state === 'pending') {
            const requestId = normalizeRequestId(resolution.requestId) || record.requestId;
            if (requestId === record.requestId) return record;
            return { ...record, requestId, updatedAt: now().toISOString() };
          }
          return {
            ...record,
            requestId: normalizeRequestId(resolution.requestId) || record.requestId,
            state: resolution.state,
            result: normalizeResult(resolution.result || resolution.state.toUpperCase()),
            updatedAt: now().toISOString(),
          };
        }));
        if (JSON.stringify(reconciled) !== JSON.stringify(records)) await write(reconciled);
        return reconciled;
      });
    },

    clear(): Promise<void> {
      return exclusive(() => storage.removeItem(LIGHTNING_PAYMENT_JOURNAL_KEY));
    },
  };
}
