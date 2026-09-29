'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
require('./register-typescript.cjs');
const { BITCOIN_STORE_KEY } = require('../lib/bitcoin/store.ts');
const { createBitcoinSqliteStore } = require('../lib/bitcoin/store-sqlite.ts');

const scope = 'REGTEST:' + 'a'.repeat(64);
const network = 'REGTEST';
function operation(index, state = 'confirmed') {
  return { id: `withdraw:${String(index).padStart(6, '0')}`, scope, network,
    kind: 'withdrawal', address: 'bcrt1synthetic', amountSats: 20, feeSats: 2,
    state, createdAt: new Date(Date.UTC(2026, 8, 24) + index).toISOString() };
}
function storage(raw = null) {
  const values = new Map();
  if (raw !== null) values.set(BITCOIN_STORE_KEY, raw);
  return { values, async getItem(key) { return values.get(key) ?? null; },
    async removeItem(key) { values.delete(key); } };
}
function database(failAfterWrites = Infinity) {
  const native = new DatabaseSync(':memory:');
  let writes = 0;
  let historyQueries = 0;
  const access = {
    async execAsync(sql) { native.exec(sql); },
    async getFirstAsync(sql, ...args) { return native.prepare(sql).get(...args) ?? null; },
    async getAllAsync(sql, ...args) {
      if (sql.includes('ORDER BY created_ms DESC')) historyQueries++;
      return native.prepare(sql).all(...args);
    },
    async runAsync(sql, ...args) {
      if (++writes === failAfterWrites) throw new Error('simulated process interruption');
      return native.prepare(sql).run(...args);
    },
    async withExclusiveTransactionAsync(task) {
      native.exec('BEGIN IMMEDIATE');
      try { await task(access); native.exec('COMMIT'); }
      catch (cause) { native.exec('ROLLBACK'); throw cause; }
    },
  };
  return { access, native, get historyQueries() { return historyQueries; },
    get writes() { return writes; },
    resetFailure() { failAfterWrites = Infinity; } };
}

test('migrates more than ten thousand settled operations atomically and pages them from SQLite', async () => {
  const records = Array.from({ length: 10_025 }, (_, index) => operation(index));
  const legacy = storage(JSON.stringify({ version: 1, records }));
  const fixture = database();
  const store = createBitcoinSqliteStore(async () => fixture.access, legacy);
  const ids = [];
  let cursor;
  do {
    const page = await store.listHistoryPage(scope, 100, cursor);
    ids.push(...page.items.map(item => item.id));
    cursor = page.next;
  } while (cursor);
  assert.equal(ids.length, records.length);
  assert.equal(new Set(ids).size, records.length);
  assert.equal(ids[0], records.at(-1).id);
  assert.equal(ids.at(-1), records[0].id);
  assert.equal(fixture.historyQueries, 101);
  assert.equal(legacy.values.has(BITCOIN_STORE_KEY), false);
  const restarted = createBitcoinSqliteStore(async () => fixture.access, legacy);
  assert.equal((await restarted.listHistoryPage(scope, 2)).items.length, 2);
  await restarted.clear();
  legacy.values.set(BITCOIN_STORE_KEY, JSON.stringify({ version: 1, records: [records[0]] }));
  const afterWipe = createBitcoinSqliteStore(async () => fixture.access, legacy);
  assert.deepEqual((await afterWipe.listHistoryPage(scope, 2)).items, []);
  fixture.native.close();
});

test('interrupted migration rolls back every row and retries without duplicates', async () => {
  const records = [operation(1), operation(2), operation(3)];
  const legacy = storage(JSON.stringify({ version: 1, records }));
  const fixture = database(3);
  const store = createBitcoinSqliteStore(async () => fixture.access, legacy);
  await assert.rejects(store.list(scope), /simulated process interruption/);
  assert.equal(fixture.native.prepare('SELECT COUNT(*) AS count FROM bitcoin_operations').get().count, 0);
  assert.ok(legacy.values.has(BITCOIN_STORE_KEY));
  fixture.resetFailure();
  assert.deepEqual((await store.list(scope)).map(item => item.id), records.map(item => item.id));
  assert.equal(fixture.native.prepare('SELECT COUNT(*) AS count FROM bitcoin_operations').get().count, 3);
  fixture.native.close();
});

test('SQLite history cursor preserves ID tie order and new sends still block unresolved withdrawals', async () => {
  const legacy = storage();
  const fixture = database();
  const store = createBitcoinSqliteStore(async () => fixture.access, legacy);
  const ids = ['withdraw:a', 'withdraw:B', 'withdraw:z', 'withdraw:A', 'withdraw:𝄞', 'withdraw:中'];
  for (const id of ids) await store.update(scope, id,
    () => ({ ...operation(1), id }), () => {});
  const observed = [];
  let cursor;
  do {
    const page = await store.listHistoryPage(scope, 2, cursor);
    observed.push(...page.items.map(item => item.id));
    cursor = page.next;
  } while (cursor);
  assert.deepEqual(observed, [...ids].sort());
  await store.begin(operation(2, 'pending'), () => {});
  await assert.rejects(store.begin(operation(3, 'prepared'), () => {}), /still being checked/);
  fixture.native.close();
});

test('batch deposit discovery and no-op updates preserve pending records without extra writes', async () => {
  const fixture = database();
  const store = createBitcoinSqliteStore(async () => fixture.access, storage());
  const pending = operation(10, 'pending');
  await store.begin(pending, () => {});
  const deposits = Array.from({ length: 100 }, (_, index) => {
    const txid = index.toString(16).padStart(64, '0');
    return { ...operation(index), id: `deposit:${network}:${txid}:0`, kind: 'deposit',
      state: 'action_required', amountSats: 0, feeSats: null, txid, vout: 0 };
  });
  await store.upsertDiscoveredDeposits(scope, deposits, () => {});
  const written = fixture.writes;
  await store.upsertDiscoveredDeposits(scope, deposits, () => {});
  await store.update(scope, pending.id, previous => previous, () => {});
  assert.equal(fixture.writes, written);
  assert.equal((await store.list(scope)).length, 101);
  assert.equal((await store.listHistoryPage(scope, 100)).next !== null, true);
  assert.equal((await store.list(scope)).find(item => item.id === pending.id)?.state, 'pending');
  fixture.native.close();
});
