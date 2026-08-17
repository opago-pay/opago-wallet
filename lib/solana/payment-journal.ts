import type { SolanaTransactionStatus } from './account';
import type { SolanaAsset } from './amounts';
import { parseSolanaPublicKey } from './config';
import { parseSolanaSignature } from './explorer';

export const SOLANA_PAYMENT_JOURNAL_KEY = 'opago.solana.payment-journal.v1';
const MAX_JOURNAL_RECORDS = 50;
const MAX_RECONCILIATIONS_PER_REFRESH = 5;

export type SolanaPaymentJournalState = 'pending' | 'confirmed' | 'failed';

export interface SolanaPaymentJournalRecord {
  signature: string;
  recipientAddress: string;
  asset: SolanaAsset;
  amountBaseUnits: string;
  state: SolanaPaymentJournalState;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SolanaPaymentSubmission {
  signature: string;
  recipientAddress: string;
  asset: SolanaAsset;
  amountBaseUnits: bigint;
}

export interface SolanaPaymentResolution {
  signature: string;
  state: 'confirmed' | 'failed';
  result: string;
}

export interface SolanaPaymentLifecycle {
  onSubmitted?(submission: SolanaPaymentSubmission): Promise<void>;
  onResolved?(resolution: SolanaPaymentResolution): Promise<void>;
}

export interface SolanaPaymentJournalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface JournalDocument {
  version: 1;
  records: SolanaPaymentJournalRecord[];
}

function safeResult(result: string): string {
  const normalized = result.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(normalized)) {
    throw new Error('Solana payment result is invalid.');
  }
  return normalized;
}

function assertRecord(value: unknown): SolanaPaymentJournalRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Solana payment journal contains an invalid record.');
  }
  const record = value as Partial<SolanaPaymentJournalRecord>;
  try {
    parseSolanaSignature(record.signature || '');
    parseSolanaPublicKey(record.recipientAddress || '', 'Solana journal recipient');
  } catch {
    throw new Error('Solana payment journal contains an invalid record.');
  }
  const resultIsValid = record.result === null || (
    typeof record.result === 'string' &&
    (() => {
      try {
        return safeResult(record.result!) === record.result;
      } catch {
        return false;
      }
    })()
  );
  if (
    (record.asset !== 'SOL' && record.asset !== 'USDC') ||
    typeof record.amountBaseUnits !== 'string' ||
    !/^[1-9]\d*$/.test(record.amountBaseUnits) ||
    (record.state !== 'pending' && record.state !== 'confirmed' && record.state !== 'failed') ||
    !resultIsValid ||
    (record.state === 'pending' && record.result !== null) ||
    (record.state !== 'pending' && record.result === null) ||
    typeof record.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    typeof record.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    throw new Error('Solana payment journal contains an invalid record.');
  }
  return record as SolanaPaymentJournalRecord;
}

function parseDocument(raw: string | null): JournalDocument {
  if (raw === null) return { version: 1, records: [] };
  if (raw.length > 64 * 1024) throw new Error('Solana payment journal is too large.');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Solana payment journal is not valid JSON.');
  }
  if (!value || typeof value !== 'object') throw new Error('Solana payment journal is invalid.');
  const document = value as Partial<JournalDocument>;
  if (
    document.version !== 1 ||
    !Array.isArray(document.records) ||
    document.records.length > MAX_JOURNAL_RECORDS
  ) {
    throw new Error('Solana payment journal version is unsupported.');
  }
  return { version: 1, records: document.records.map(assertRecord) };
}

export function createSolanaPaymentJournal(
  storage: SolanaPaymentJournalStorage,
  now: () => Date = () => new Date(),
) {
  let queue: Promise<unknown> = Promise.resolve();
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const running = queue.then(operation, operation);
    queue = running.then(() => undefined, () => undefined);
    return running;
  }
  async function read(): Promise<SolanaPaymentJournalRecord[]> {
    return parseDocument(await storage.getItem(SOLANA_PAYMENT_JOURNAL_KEY)).records;
  }
  async function write(records: SolanaPaymentJournalRecord[]): Promise<void> {
    await storage.setItem(SOLANA_PAYMENT_JOURNAL_KEY, JSON.stringify({
      version: 1,
      records: records
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, MAX_JOURNAL_RECORDS),
    } satisfies JournalDocument));
  }
  return {
    list(): Promise<SolanaPaymentJournalRecord[]> {
      return exclusive(read);
    },
    recordSubmitted(submission: SolanaPaymentSubmission): Promise<void> {
      return exclusive(async () => {
        const signature = parseSolanaSignature(submission.signature);
        const recipientAddress = parseSolanaPublicKey(
          submission.recipientAddress,
          'Solana recipient',
        ).toBase58();
        if (submission.amountBaseUnits <= 0n) throw new Error('Solana payment amount must be positive.');
        if (submission.asset !== 'SOL' && submission.asset !== 'USDC') {
          throw new Error('Solana payment asset is invalid.');
        }
        const records = await read();
        const timestamp = now().toISOString();
        const existing = records.find(item => item.signature === signature);
        if (
          existing &&
          (
            existing.recipientAddress !== recipientAddress ||
            existing.asset !== submission.asset ||
            existing.amountBaseUnits !== submission.amountBaseUnits.toString()
          )
        ) {
          throw new Error('Solana payment signature is already bound to different payment details.');
        }
        const record: SolanaPaymentJournalRecord = {
          signature,
          recipientAddress,
          asset: submission.asset,
          amountBaseUnits: submission.amountBaseUnits.toString(),
          state: existing?.state || 'pending',
          result: existing?.result || null,
          createdAt: existing?.createdAt || timestamp,
          updatedAt: timestamp,
        };
        await write([record, ...records.filter(item => item.signature !== signature)]);
      });
    },
    recordResolved(resolution: SolanaPaymentResolution): Promise<void> {
      return exclusive(async () => {
        const signature = parseSolanaSignature(resolution.signature);
        const records = await read();
        const existing = records.find(item => item.signature === signature);
        if (!existing) return;
        if (existing.state !== 'pending') {
          if (existing.state === resolution.state && existing.result === safeResult(resolution.result)) return;
          throw new Error('A resolved Solana payment state cannot be changed.');
        }
        await write([{
          ...existing,
          state: resolution.state,
          result: safeResult(resolution.result),
          updatedAt: now().toISOString(),
        }, ...records.filter(item => item.signature !== signature)]);
      });
    },
    reconcile(
      loadStatus: (signature: string) => Promise<SolanaTransactionStatus>,
    ): Promise<SolanaPaymentJournalRecord[]> {
      return exclusive(async () => {
        const records = await read();
        const signaturesToCheck = new Set(
          records
            .filter(record => record.state === 'pending')
            .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
            .slice(0, MAX_RECONCILIATIONS_PER_REFRESH)
            .map(record => record.signature),
        );
        const reconciled: SolanaPaymentJournalRecord[] = [];
        for (const record of records) {
          if (!signaturesToCheck.has(record.signature)) {
            reconciled.push(record);
            continue;
          }
          const checkedAt = now().toISOString();
          let status: SolanaTransactionStatus;
          try {
            // A small rotating batch is checked sequentially so a free public RPC never receives
            // a burst while every pending record still gets another turn on later refreshes.
            status = await loadStatus(record.signature);
          } catch {
            reconciled.push({ ...record, updatedAt: checkedAt });
            continue;
          }
          if (status.state === 'pending') {
            reconciled.push({ ...record, updatedAt: checkedAt });
            continue;
          }
          reconciled.push({
            ...record,
            state: status.state === 'success' ? 'confirmed' as const : 'failed' as const,
            result: safeResult(status.result || (status.state === 'success' ? 'CONFIRMED' : 'FAILED')),
            updatedAt: checkedAt,
          });
        }
        if (JSON.stringify(reconciled) !== JSON.stringify(records)) await write(reconciled);
        return reconciled;
      });
    },
    clear(): Promise<void> {
      return exclusive(() => storage.removeItem(SOLANA_PAYMENT_JOURNAL_KEY));
    },
  };
}
