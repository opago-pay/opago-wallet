import * as SQLite from 'expo-sqlite';
import { currentBitcoinRateSnapshot } from './exchange-rate-snapshot';

export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'action_required';

export interface Transaction {
  id: number;
  type: 'incoming' | 'outgoing';
  amount: number;
  asset: string;
  status: TransactionStatus;
  timestamp: string;
  txId: string | null;
  reference: string | null;
  btcEurRate: number | null;
  btcEurRateAt: string | null;
}

export interface AddTransactionOptions {
  status?: TransactionStatus;
  txId?: string;
  reference?: string;
  /** Set false when delayed reconciliation cannot establish the payment time. */
  captureFiatRate?: boolean;
}

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;
let writeGeneration = 0;
let writeQueue: Promise<unknown> = Promise.resolve();
function serializeWrite<T>(work: () => Promise<T>): Promise<T> {
  const operation = writeQueue.then(work, work);
  writeQueue = operation.catch(() => undefined);
  return operation;
}

async function addColumnIfMissing(
  database: SQLite.SQLiteDatabase,
  columns: { name: string }[],
  name: string,
  definition: string,
): Promise<void> {
  if (!columns.some(column => column.name === name)) {
    await database.execAsync('ALTER TABLE transactions ADD COLUMN ' + name + ' ' + definition);
  }
}

export async function initDatabase(): Promise<void> {
  if (db) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const database = await SQLite.openDatabaseAsync('opago.db');
    try {
      await database.execAsync(
        'CREATE TABLE IF NOT EXISTS transactions (' +
          'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
          'type TEXT NOT NULL,' +
          'amount REAL NOT NULL,' +
          'asset TEXT NOT NULL,' +
          'status TEXT NOT NULL,' +
          'timestamp TEXT NOT NULL,' +
          'tx_id TEXT,' +
          'reference TEXT,' +
          'btc_eur_rate REAL,' +
          'btc_eur_rate_at TEXT' +
        ')',
      );
      const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
      await addColumnIfMissing(database, columns, 'tx_id', 'TEXT');
      await addColumnIfMissing(database, columns, 'reference', 'TEXT');
      await addColumnIfMissing(database, columns, 'btc_eur_rate', 'REAL');
      await addColumnIfMissing(database, columns, 'btc_eur_rate_at', 'TEXT');
      await database.execAsync(
        'CREATE UNIQUE INDEX IF NOT EXISTS transactions_tx_id_unique_v2 ON transactions(tx_id)',
      );
      db = database;
    } catch (error) {
      await database.closeAsync();
      throw error;
    }
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  await initDatabase();
  if (!db) throw new Error('Transaction database is unavailable.');
  return db;
}

export async function wipeTransactions(): Promise<void> {
  writeGeneration += 1;
  await serializeWrite(async () => {
    const database = await getDatabase();
    await database.execAsync('DELETE FROM transactions');
  });
}

export async function addTransaction(
  type: 'incoming' | 'outgoing',
  amount: number,
  asset: string,
  options: AddTransactionOptions = {},
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Transaction amount must be positive.');
  const generation = writeGeneration;
  const rate = asset === 'SAT' && options.captureFiatRate !== false ? currentBitcoinRateSnapshot() : null;
  return serializeWrite(async () => {
  const database = await getDatabase();
  if (generation !== writeGeneration) return;
  await database.runAsync(
    'INSERT INTO transactions (type, amount, asset, status, timestamp, tx_id, reference, btc_eur_rate, btc_eur_rate_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(tx_id) DO UPDATE SET status = excluded.status, amount = excluded.amount, asset = excluded.asset, ' +
      'btc_eur_rate = COALESCE(transactions.btc_eur_rate, excluded.btc_eur_rate), ' +
      'btc_eur_rate_at = COALESCE(transactions.btc_eur_rate_at, excluded.btc_eur_rate_at)',
    [
      type,
      amount,
      asset,
      options.status || 'confirmed',
      new Date().toISOString(),
      options.txId || null,
      options.reference || null,
      rate?.btcEur ?? null,
      rate ? new Date(rate.fetchedAt).toISOString() : null,
    ],
  );
  });
}

export async function updateTransactionStatus(
  txId: string,
  status: TransactionStatus,
): Promise<void> {
  const generation = writeGeneration;
  return serializeWrite(async () => {
  const database = await getDatabase();
  if (generation !== writeGeneration) return;
  await database.runAsync('UPDATE transactions SET status = ? WHERE tx_id = ?', [status, txId]);
  });
}

export async function getTransactions(): Promise<Transaction[]> {
  const database = await getDatabase();
  return database.getAllAsync<Transaction>(
    'SELECT id, type, amount, asset, status, timestamp, tx_id AS txId, reference, btc_eur_rate AS btcEurRate, btc_eur_rate_at AS btcEurRateAt ' +
      'FROM transactions ORDER BY id DESC LIMIT 50',
  );
}

export async function getTransactionPage(limit = 10, beforeId?: number): Promise<Transaction[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      (beforeId !== undefined && (!Number.isSafeInteger(beforeId) || beforeId < 1))) throw new Error('Invalid history page.');
  const database = await getDatabase();
  return database.getAllAsync<Transaction>(
    'SELECT id, type, amount, asset, status, timestamp, tx_id AS txId, reference, btc_eur_rate AS btcEurRate, btc_eur_rate_at AS btcEurRateAt ' +
      "FROM transactions WHERE asset IN ('SAT', 'HBAR') " + (beforeId === undefined ? '' : 'AND id < ? ') +
      'ORDER BY id DESC LIMIT ?',
    beforeId === undefined ? [limit] : [beforeId, limit],
  );
}
