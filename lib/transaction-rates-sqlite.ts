import type { SQLiteDatabase } from 'expo-sqlite';
import { assertRateRequest, assertTransactionRate, type TransactionRateJob, type TransactionRateRequest, type TransactionRate } from './transaction-rates';

type Database = Pick<SQLiteDatabase, 'execAsync' | 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;
type Row = { record_json: string };
const schema = `CREATE TABLE IF NOT EXISTS transaction_rates (
  scope TEXT NOT NULL, id TEXT NOT NULL, pending INTEGER NOT NULL, next_attempt INTEGER NOT NULL,
  record_json TEXT NOT NULL, PRIMARY KEY(scope, id));
  CREATE INDEX IF NOT EXISTS transaction_rates_pending ON transaction_rates(scope, pending, next_attempt);`;
const rank = { recorded: 0, network: 1 };

function decode(row: Row | null): TransactionRateJob | null {
  if (!row) return null;
  const job: TransactionRateJob = JSON.parse(row.record_json);
  assertRateRequest(job);
  if (!Number.isSafeInteger(job.attempts) || job.attempts < 0 || !Number.isSafeInteger(job.nextAttempt) || job.nextAttempt < 0) {
    throw new Error('Transaction rate storage is unavailable.');
  }
  if (job.quote) assertTransactionRate(job.quote);
  return job;
}

/** Unbounded, indexed local ledger; settled quotes are not trimmed with journals. */
export function createTransactionRateStore(open: () => Promise<Database>) {
  let database: Promise<Database> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let generation = 0;
  function exclusive<T>(work: (db: Database) => Promise<T>, assertCurrent: () => void = () => {}) {
    const expected = generation;
    const run = async () => {
      if (!database) database = open().then(async db => { await db.execAsync(schema); return db; }).catch(cause => { database = null; throw cause; });
      const db = await database;
      assertCurrent();
      if (expected !== generation) throw new Error('Wallet changed.');
      return work(db);
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  }
  const read = async (db: Database, scope: string, key: string) => decode(await db.getFirstAsync<Row>(
    'SELECT record_json FROM transaction_rates WHERE scope = ? AND id = ?', scope, key));
  const save = (db: Database, job: TransactionRateJob) => db.runAsync(`INSERT INTO transaction_rates
    (scope,id,pending,next_attempt,record_json) VALUES (?,?,?,?,?) ON CONFLICT(scope,id)
    DO UPDATE SET pending=excluded.pending,next_attempt=excluded.next_attempt,record_json=excluded.record_json`,
    job.scope, job.key, job.quote ? 0 : 1, job.nextAttempt, JSON.stringify(job));

  return {
    observe(request: TransactionRateRequest, assertCurrent: () => void = () => {}) {
      assertRateRequest(request);
      return exclusive(async db => {
        const old = await read(db, request.scope, request.key);
        assertCurrent();
        if (old) {
          const strongerTime = request.transactionAt !== null && (old.transactionAt === null || rank[request.timeBasis] > rank[old.timeBasis]);
          const blockAdded = !!request.bitcoinTxId && request.bitcoinTxId !== old.bitcoinTxId;
          if (!strongerTime && !blockAdded) return old;
          const next = { ...old, ...(strongerTime ? { transactionAt: request.transactionAt, timeBasis: request.timeBasis } : {}),
            ...(blockAdded ? { bitcoinTxId: request.bitcoinTxId } : {}), quote: null, attempts: 0, nextAttempt: 0 };
          await save(db, next);
          return next;
        }
        const job: TransactionRateJob = { ...request, quote: null, attempts: 0, nextAttempt: 0 };
        await save(db, job);
        return job;
      }, assertCurrent);
    },
    get(scope: string, key: string, assertCurrent: () => void = () => {}) { return exclusive(db => read(db, scope, key), assertCurrent); },
    due(scope: string, now: number, limit = 2, assertCurrent: () => void = () => {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error('Invalid rate batch.');
      return exclusive(async db => (await db.getAllAsync<Row>(`SELECT record_json FROM transaction_rates
        WHERE scope = ? AND pending = 1 AND next_attempt <= ? ORDER BY next_attempt, id LIMIT ?`, scope, now, limit)).map(row => decode(row)!), assertCurrent);
    },
    finish(expected: TransactionRateJob, quote: TransactionRate | null, now: number, assertCurrent: () => void = () => {}) {
      if (quote) {
        assertTransactionRate(quote);
        if (quote.asset !== expected.asset || (!expected.bitcoinTxId && quote.transactionAt !== expected.transactionAt) ||
            (expected.bitcoinTxId && quote.timeBasis !== 'block')) throw new Error('Rate transaction changed.');
      }
      return exclusive(async db => {
        const current = await read(db, expected.scope, expected.key);
        assertCurrent();
        // A late request may not overwrite a corrected transaction timestamp.
        if (!current || current.quote || current.transactionAt !== expected.transactionAt ||
            current.timeBasis !== expected.timeBasis || current.bitcoinTxId !== expected.bitcoinTxId) return;
        const attempts = current.attempts + 1;
        await save(db, { ...current, quote, attempts,
          nextAttempt: quote ? 0 : now + Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.min(attempts - 1, 10)) });
      }, assertCurrent);
    },
    clear() {
      generation += 1;
      return exclusive(async db => { await db.runAsync('DELETE FROM transaction_rates'); });
    },
  };
}
