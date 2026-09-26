import type { SQLiteDatabase } from 'expo-sqlite';
import {
  BITCOIN_STORE_KEY,
  assertBitcoinOperation,
  parseBitcoinStoreDocument,
  type BitcoinOperation,
  type ProviderWithdrawalMerge,
} from './store';

interface LegacyStorage {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
}
type Database = Pick<SQLiteDatabase, 'execAsync' | 'getFirstAsync' | 'getAllAsync' | 'withExclusiveTransactionAsync'>;
type Writer = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;
type SavedRow = { record_json: string };

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS bitcoin_operations (
    scope TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
    created_ms INTEGER NOT NULL, id_sort TEXT NOT NULL, request_id TEXT, quote_id TEXT, record_json TEXT NOT NULL,
    PRIMARY KEY (scope, id)
  );
  CREATE INDEX IF NOT EXISTS bitcoin_operations_history
    ON bitcoin_operations (scope, created_ms DESC, id_sort ASC);
  CREATE INDEX IF NOT EXISTS bitcoin_operations_request
    ON bitcoin_operations (scope, request_id);
  CREATE INDEX IF NOT EXISTS bitcoin_operations_quote
    ON bitcoin_operations (scope, quote_id);
  CREATE TABLE IF NOT EXISTS bitcoin_store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
const MIGRATION_KEY = 'legacy-async-storage-v1';

// SQLite compares UTF-8 text while JavaScript's < compares UTF-16 code units.
// A fixed-width hex key keeps native and legacy keyset ordering identical,
// including mixed case and supplementary Unicode IDs from opaque providers.
function idSortKey(id: string): string {
  let result = '';
  for (let index = 0; index < id.length; index++) result += id.charCodeAt(index).toString(16).padStart(4, '0');
  return result;
}

function decode(row: SavedRow | null): BitcoinOperation | undefined {
  if (!row) return undefined;
  let operation: BitcoinOperation;
  try { operation = JSON.parse(row.record_json); }
  catch { throw new Error('Bitcoin payment storage is unavailable.'); }
  assertBitcoinOperation(operation);
  return operation;
}

async function save(db: Writer, record: BitcoinOperation): Promise<void> {
  assertBitcoinOperation(record);
  await db.runAsync(`INSERT INTO bitcoin_operations
    (scope, id, kind, state, created_ms, id_sort, request_id, quote_id, record_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope, id) DO UPDATE SET kind=excluded.kind, state=excluded.state,
    created_ms=excluded.created_ms, id_sort=excluded.id_sort, request_id=excluded.request_id,
    quote_id=excluded.quote_id, record_json=excluded.record_json`,
    record.scope, record.id, record.kind, record.state, Date.parse(record.createdAt), idSortKey(record.id),
    record.requestId ?? null, record.quoteId ?? null, JSON.stringify(record));
}

/** Native operation store. The legacy JSON is imported in one SQLite transaction;
 * its migration marker commits with the rows, so a process death cannot make a
 * partial import look complete or replay an old payment after a wallet wipe. */
export function createBitcoinSqliteStore(open: () => Promise<Database>, legacy: LegacyStorage) {
  let database: Promise<Database> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let generation = 0;
  let wiped = false;
  let retired = false;

  function exclusive<T>(work: () => Promise<T>, allowWipe = false): Promise<T> {
    const guarded = () => {
      if (retired || (wiped && !allowWipe)) throw new Error('Wallet changed.');
      return work();
    };
    const result = queue.then(guarded, guarded);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function db(): Promise<Database> {
    if (!database) database = (async () => {
      const connection = await open();
      await connection.execAsync(SCHEMA);
      const marker = await connection.getFirstAsync<{ value: string }>(
        'SELECT value FROM bitcoin_store_meta WHERE key = ?', MIGRATION_KEY);
      if (!marker) {
        const records = parseBitcoinStoreDocument(await legacy.getItem(BITCOIN_STORE_KEY));
        const ids = new Set<string>();
        for (const record of records) {
          const key = `${record.scope}\u0000${record.id}`;
          if (ids.has(key)) throw new Error('Bitcoin payment storage contains duplicate operations.');
          ids.add(key);
        }
        await connection.withExclusiveTransactionAsync(async transaction => {
          const completed = await transaction.getFirstAsync<{ value: string }>(
            'SELECT value FROM bitcoin_store_meta WHERE key = ?', MIGRATION_KEY);
          if (completed) return;
          for (const record of records) await save(transaction, record);
          await transaction.runAsync('INSERT INTO bitcoin_store_meta (key, value) VALUES (?, ?)', MIGRATION_KEY, '2');
        });
      }
      // The marker makes cleanup retryable if the process stopped after commit.
      await legacy.removeItem(BITCOIN_STORE_KEY).catch(() => undefined);
      return connection;
    })().catch(cause => { database = null; throw cause; });
    return database;
  }

  async function dbForWipe(): Promise<Database> {
    // An explicitly authorized wipe must not parse or import possibly corrupt
    // legacy data. The migration promise may already have failed; open the
    // same database directly and create only the schema required for deletion.
    if (database) {
      try { return await database; }
      catch { database = null; }
    }
    const connection = await open();
    await connection.execAsync(SCHEMA);
    return connection;
  }

  async function list(scope: string): Promise<BitcoinOperation[]> {
    const rows = await (await db()).getAllAsync<SavedRow>(
      'SELECT record_json FROM bitcoin_operations WHERE scope = ? ORDER BY created_ms, id_sort', scope);
    return rows.map(row => decode(row)!);
  }

  return {
    list(scope: string) { return exclusive(() => list(scope)); },
    listActive(scope: string) { return exclusive(async () => {
      const rows = await (await db()).getAllAsync<SavedRow>(`SELECT record_json FROM bitcoin_operations
        WHERE scope = ? AND state NOT IN ('confirmed', 'failed', 'aborted') ORDER BY created_ms, id_sort`, scope);
      return rows.map(row => decode(row)!);
    }); },
    listWithdrawalRequestIds(scope: string) { return exclusive(async () => {
      const rows = await (await db()).getAllAsync<{ request_id: string }>(`SELECT request_id FROM bitcoin_operations
        WHERE scope = ? AND kind = 'withdrawal' AND request_id IS NOT NULL`, scope);
      return rows.map(row => row.request_id);
    }); },
    existingIds(scope: string, ids: string[]) { return exclusive(async () => {
      const found: string[] = [];
      for (let offset = 0; offset < ids.length; offset += 500) {
        const chunk = ids.slice(offset, offset + 500);
        const rows = await (await db()).getAllAsync<{ id: string }>(
          `SELECT id FROM bitcoin_operations WHERE scope = ? AND id IN (${chunk.map(() => '?').join(',')})`,
          scope, ...chunk);
        found.push(...rows.map(row => row.id));
      }
      return found;
    }); },
    listHistoryPage(scope: string, limit: number, before?: string) {
      return exclusive(async () => {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid Bitcoin history page.');
        let cursor: { time: number; id: string } | null = null;
        if (before !== undefined) {
          if (before.length > 2048) throw new Error('Invalid Bitcoin history cursor.');
          try { cursor = JSON.parse(before); }
          catch { throw new Error('Invalid Bitcoin history cursor.'); }
          if (!cursor || !Number.isSafeInteger(cursor.time) || typeof cursor.id !== 'string' || !cursor.id) {
            throw new Error('Invalid Bitcoin history cursor.');
          }
        }
        const rows = cursor
          ? await (await db()).getAllAsync<SavedRow>(`SELECT record_json FROM bitcoin_operations
              WHERE scope = ? AND state != 'aborted' AND
                (created_ms < ? OR (created_ms = ? AND id_sort > ?))
              ORDER BY created_ms DESC, id_sort ASC LIMIT ?`, scope, cursor.time, cursor.time, idSortKey(cursor.id), limit + 1)
          : await (await db()).getAllAsync<SavedRow>(`SELECT record_json FROM bitcoin_operations
              WHERE scope = ? AND state != 'aborted'
              ORDER BY created_ms DESC, id_sort ASC LIMIT ?`, scope, limit + 1);
        const items = rows.slice(0, limit).map(row => decode(row)!);
        const last = items.at(-1);
        return { items, next: rows.length > limit && last ?
          JSON.stringify({ time: Date.parse(last.createdAt), id: last.id }) : null,
          through: last ? Date.parse(last.createdAt) : undefined };
      });
    },
    upsertDiscoveredDeposits(scope: string, candidates: BitcoinOperation[], assertCurrent: () => void): Promise<void> {
      const expected = generation;
      return exclusive(async () => {
        assertCurrent();
        if (expected !== generation) throw new Error('Wallet changed.');
        if (!candidates.length) return;
        const connection = await db();
        await connection.withExclusiveTransactionAsync(async transaction => {
          for (const candidate of candidates) {
            assertCurrent();
            if (expected !== generation) throw new Error('Wallet changed.');
            assertBitcoinOperation(candidate);
            if (candidate.scope !== scope || candidate.kind !== 'deposit' || candidate.state !== 'action_required' ||
                candidate.amountSats !== 0 || candidate.feeSats !== null ||
                !candidate.txid || !/^[0-9a-f]{64}$/.test(candidate.txid) ||
                !Number.isSafeInteger(candidate.vout) || candidate.vout! < 0 ||
                candidate.id !== `deposit:${candidate.network}:${candidate.txid}:${candidate.vout}`) {
              throw new Error('Invalid Bitcoin deposit record.');
            }
            const existing = await transaction.getFirstAsync<{ id: string }>(
              'SELECT id FROM bitcoin_operations WHERE scope = ? AND id = ?', scope, candidate.id);
            if (!existing) await save(transaction, candidate);
          }
        });
      });
    },
    begin(operation: BitcoinOperation, assertCurrent: () => void): Promise<void> {
      const expected = generation;
      return exclusive(async () => {
        assertCurrent();
        if (expected !== generation) throw new Error('Wallet changed.');
        assertBitcoinOperation(operation);
        const connection = await db();
        await connection.withExclusiveTransactionAsync(async transaction => {
          assertCurrent();
          const duplicate = await transaction.getFirstAsync<{ id: string }>(
            `SELECT id FROM bitcoin_operations WHERE scope = ? AND
              (id = ? OR (? = 'withdrawal' AND kind = 'withdrawal' AND
              state NOT IN ('confirmed', 'failed', 'aborted'))) LIMIT 1`,
            operation.scope, operation.id, operation.kind);
          if (duplicate) throw new Error('A Bitcoin payment is still being checked. Do not send it again.');
          await save(transaction, operation);
        });
      });
    },
    update(scope: string, id: string,
      transform: (previous: BitcoinOperation | undefined) => BitcoinOperation, assertCurrent: () => void) {
      const expected = generation;
      return exclusive(async () => {
        assertCurrent();
        if (expected !== generation) throw new Error('Wallet changed.');
        const connection = await db();
        let outcome: BitcoinOperation | undefined;
        await connection.withExclusiveTransactionAsync(async transaction => {
          const previous = decode(await transaction.getFirstAsync<SavedRow>(
            'SELECT record_json FROM bitcoin_operations WHERE scope = ? AND id = ?', scope, id));
          assertCurrent();
          if (expected !== generation) throw new Error('Wallet changed.');
          const next = transform(previous);
          if (next.scope !== scope || next.id !== id) throw new Error('Invalid Bitcoin payment record.');
          if (previous?.state === 'confirmed' && next.state !== 'confirmed') { outcome = previous; return; }
          if (!previous || JSON.stringify(previous) !== JSON.stringify(next)) await save(transaction, next);
          outcome = next;
        });
        return outcome!;
      });
    },
    mergeProviderWithdrawals(scope: string, updates: ProviderWithdrawalMerge[], assertCurrent: () => void): Promise<void> {
      const expected = generation;
      return exclusive(async () => {
        assertCurrent();
        if (expected !== generation) throw new Error('Wallet changed.');
        if (!updates.length) return;
        await (await db()).withExclusiveTransactionAsync(async transaction => {
          for (const update of updates) {
            assertCurrent();
            if (expected !== generation) throw new Error('Wallet changed.');
            const previous = decode(await transaction.getFirstAsync<SavedRow>(
              `SELECT record_json FROM bitcoin_operations WHERE scope = ? AND kind = 'withdrawal' AND
                (request_id = ? OR (? IS NOT NULL AND quote_id = ?)) LIMIT 1`,
              scope, update.requestId, update.quoteId ?? null, update.quoteId ?? null));
            if (previous?.requestId && previous.requestId !== update.requestId) {
              throw new Error('Bitcoin provider returned conflicting withdrawal requests.');
            }
            const next = update.transform(previous);
            if (next.scope !== scope || next.kind !== 'withdrawal' || next.requestId !== update.requestId ||
                (previous && previous.id !== next.id)) throw new Error('Invalid Bitcoin provider payment record.');
            if (!previous) {
              const collision = await transaction.getFirstAsync<{ id: string }>(
                'SELECT id FROM bitcoin_operations WHERE scope = ? AND id = ?', scope, next.id);
              if (collision) throw new Error('Invalid Bitcoin provider payment record.');
            }
            if (previous?.state === 'confirmed' && next.state !== 'confirmed') continue;
            if (!previous || JSON.stringify(previous) !== JSON.stringify(next)) await save(transaction, next);
          }
        });
      });
    },
    abortBeforeSubmission(scope: string, id: string, expectedState: 'prepared' | 'checking') {
      return exclusive(async () => {
        await (await db()).withExclusiveTransactionAsync(async transaction => {
          const previous = decode(await transaction.getFirstAsync<SavedRow>(
            'SELECT record_json FROM bitcoin_operations WHERE scope = ? AND id = ?', scope, id));
          if (!previous || previous.state !== expectedState) return;
          await save(transaction, previous.kind === 'deposit'
            ? { ...previous, state: 'action_required', amountSats: 0, feeSats: null }
            : { ...previous, state: 'aborted' });
        });
      });
    },
    clear() {
      if (retired) return Promise.reject(new Error('Wallet changed.'));
      generation += 1;
      wiped = true;
      return exclusive(async () => {
        await (await dbForWipe()).withExclusiveTransactionAsync(async transaction => {
          await transaction.runAsync('DELETE FROM bitcoin_operations');
          // Commit the empty data set and tombstone together. If cleanup is
          // interrupted, stale legacy JSON can never be imported on restart.
          await transaction.runAsync(
            'INSERT OR REPLACE INTO bitcoin_store_meta (key, value) VALUES (?, ?)', MIGRATION_KEY, '2');
        });
        await legacy.removeItem(BITCOIN_STORE_KEY);
      }, true);
    },
    // Only the completed native wipe may retire this instance. Once retired,
    // even a delayed clear() cannot erase the next wallet's shared database.
    async retireAfterWipe(): Promise<void> {
      if (!wiped) throw new Error('Bitcoin store has not been wiped.');
      retired = true;
      generation += 1;
      await queue.catch(() => undefined);
    },
  };
}
