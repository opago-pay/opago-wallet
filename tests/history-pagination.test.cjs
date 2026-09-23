'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
/* global __dirname */
require('./register-typescript.cjs');
const { HistoryPager } = require('../lib/history-pagination.ts');
const { loadSparkTransferPage } = require('../lib/lightning/spark-history.ts');
const item = (n, status = 'confirmed') => ({ key: String(n), timestamp: new Date(1800000000000 - n * 1000).toISOString(), status });

test('recent rows appear while an optional history source is still loading', async () => {
  let finishSlow;
  const snapshots = [];
  const pager = new HistoryPager([
    { id: 'bitcoin', label: 'Bitcoin', load: async () => ({ items: [item(1)], next: null }) },
    { id: 'hedera', label: 'HBAR', load: () => new Promise(resolve => { finishSlow = resolve; }) },
  ]);
  const loading = pager.load('initial', () => snapshots.push(pager.snapshot().items.map(row => row.key)));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(snapshots, [['1']]);
  finishSlow({ items: [item(0)], next: null });
  await loading;
  assert.deepEqual(pager.snapshot().items.map(row => row.key), ['0', '1']);
});

test('mixed history shows ten, preserves ordering/deduplication and fetches continuations only on demand', async () => {
  const requests = [];
  const remote = Array.from({ length: 25 }, (_, i) => item(i * 2 + 1));
  const pager = new HistoryPager([
    { id: 'saved', label: 'Saved', load: async () => ({ items: [item(1, 'pending'), ...Array.from({ length: 25 }, (_, i) => item(i * 2 + 2))], next: null }) },
    { id: 'remote', label: 'Bitcoin', load: async (cursor = 0, limit) => {
      requests.push([cursor, limit]);
      const items = remote.slice(cursor, cursor + limit);
      return { items, next: cursor + limit < remote.length ? cursor + limit : null, through: Date.parse(items.at(-1).timestamp) };
    } },
  ]);
  await pager.load();
  assert.deepEqual(pager.snapshot().items.map(x => x.key), Array.from({ length: 10 }, (_, i) => String(i + 1)));
  assert.equal(pager.snapshot().items[0].status, 'confirmed');
  assert.deepEqual(requests, [[0, 10]]);
  await pager.load('more');
  assert.equal(pager.snapshot().items.length, 20);
  assert.deepEqual(requests, [[0, 10], [10, 10]]);
  await pager.load('more'); await pager.load('more'); await pager.load('more');
  assert.equal(pager.snapshot().items.length, 50);
  assert.equal(new Set(pager.snapshot().items.map(x => x.key)).size, 50);
  assert.equal(pager.snapshot().hasMore, false);
  assert.deepEqual(requests, [[0, 10], [10, 10], [20, 10]]);
});

test('filtered non-payment records advance the frontier without scanning more pages automatically', async () => {
  let reads = 0;
  const pager = new HistoryPager([
    { id: 'local', label: 'Saved', load: async () => ({ items: [item(100)], next: null }) },
    { id: 'spark', label: 'Bitcoin', load: async cursor => {
      reads++;
      return cursor === undefined ? { items: [], next: 10, through: Date.parse(item(10).timestamp) }
        : { items: [item(11)], next: null };
    } },
  ]);
  await pager.load();
  assert.equal(reads, 1);
  assert.deepEqual(pager.snapshot().items, []);
  assert.equal(pager.snapshot().hasMore, true);
  await pager.load('more');
  assert.deepEqual(pager.snapshot().items.map(x => x.key), ['11', '100']);
});

test('failed pages retain visible rows and retry the same cursor without refetching successful sources', async () => {
  let fail = false;
  let localReads = 0;
  const cursors = [];
  const pager = new HistoryPager([
    { id: 'local', label: 'Saved', load: async () => { localReads++; return { items: [], next: null }; } },
    { id: 'spark', label: 'Bitcoin', load: async (cursor = 0) => {
      cursors.push(cursor);
      if (fail) throw new Error('offline');
      return { items: Array.from({ length: 10 }, (_, i) => item(cursor + i)), next: cursor === 0 ? 10 : null };
    } },
  ]);
  await pager.load(); fail = true; await pager.load('more');
  assert.equal(pager.snapshot().items.length, 10);
  assert.deepEqual(pager.snapshot().errors, ['Bitcoin']);
  fail = false; await pager.load('retry');
  assert.equal(pager.snapshot().items.length, 20);
  assert.deepEqual(pager.snapshot().errors, []);
  assert.deepEqual(cursors, [0, 10, 10]);
  assert.equal(localReads, 1);
});

test('a timeout ends the page and a late response cannot silently replace its error or start another page', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release;
  let reads = 0;
  const pager = new HistoryPager([{ id: 'spark', label: 'Bitcoin', load: () => {
    reads++; return new Promise(resolve => { release = resolve; });
  } }], 8000, [item(1)]);
  const load = pager.load(); t.mock.timers.tick(8000); await load;
  assert.equal(pager.snapshot().items.length, 1);
  assert.deepEqual(pager.snapshot().errors, ['Bitcoin']);
  release({ items: [item(2)], next: 10 }); await Promise.resolve();
  assert.equal(reads, 1);
  assert.deepEqual(pager.snapshot().items.map(x => x.key), ['1']);
});

test('duplicate next-page taps share a request and only advance the display by ten once', async () => {
  let release;
  const pager = new HistoryPager([{ id: 'spark', label: 'Bitcoin', load: async cursor => cursor === undefined
    ? { items: Array.from({ length: 10 }, (_, i) => item(i)), next: 10 }
    : new Promise(resolve => { release = resolve; }) }]);
  await pager.load();
  const first = pager.load('more'); const second = pager.load('more');
  assert.equal(first, second);
  release({ items: Array.from({ length: 10 }, (_, i) => item(i + 10)), next: null });
  await first;
  assert.equal(pager.snapshot().items.length, 20);
});

test('Spark display loader requests one bounded page and respects the provider continuation/end marker', async () => {
  const calls = [];
  const wallet = { getTransfers: async (limit, offset) => {
    calls.push([limit, offset]);
    return { transfers: Array.from({ length: limit }, (_, i) => ({ id: String(offset + i) })), offset: offset === 0 ? 37 : -1 };
  } };
  const first = await loadSparkTransferPage(wallet);
  assert.equal(first.next, 37);
  assert.deepEqual(calls, [[10, 0]]);
  const last = await loadSparkTransferPage(wallet, 10, first.next);
  assert.equal(last.next, null);
  assert.deepEqual(calls, [[10, 0], [10, 37]]);
});

test('HBAR pages use the last inspected timestamp and never hide a failed transaction-type query', async t => {
  const { loadHederaHistoryPage } = require('../lib/hedera/account.ts');
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const calls = [];
  let failType = false;
  const records = Array.from({ length: 24 }, (_, i) => ({
    transaction_id: '0.0.456-' + (1800000000 - i) + '-000000001',
    consensus_timestamp: (1800000000 - i) + '.000000001',
    name: i % 2 ? 'ETHEREUMTRANSACTION' : 'CRYPTOTRANSFER',
    result: 'SUCCESS', charged_tx_fee: '0', transfers: [{ account: '0.0.123', amount: '100' }],
  }));
  global.fetch = async raw => {
    const url = new URL(raw); calls.push(url);
    const type = url.searchParams.get('transactiontype');
    const before = url.searchParams.get('timestamp')?.slice(3);
    const body = JSON.stringify({ transactions: records.filter(r => r.name === type && (!before || r.consensus_timestamp < before)).slice(0, 10) });
    return { ok: !(failType && type === 'ETHEREUMTRANSACTION'), status: 400, redirected: false,
      headers: { get: () => 'application/json' }, text: async () => body };
  };
  const first = await loadHederaHistoryPage('0.0.123');
  assert.equal(first.items.length, 10);
  assert.equal(first.next, records[9].consensus_timestamp);
  assert.equal(calls.length, 2);
  const second = await loadHederaHistoryPage('0.0.123', 10, first.next);
  assert.equal(second.items[0].consensusTimestamp, records[10].consensus_timestamp);
  assert.equal(new Set([...first.items, ...second.items].map(x => x.transactionId)).size, 20);
  assert.ok(calls.slice(2).every(url => url.searchParams.get('timestamp') === 'lt:' + first.next));
  assert.ok(calls.every(url => url.searchParams.get('limit') === '10'));
  failType = true;
  await assert.rejects(loadHederaHistoryPage('0.0.123'), /history.*HTTP 400/);
});

test('local history uses a bounded keyset query instead of loading the whole database', async () => {
  const queries = [];
  const database = { execAsync: async () => {}, getAllAsync: async (sql, args) => {
    if (sql.startsWith('PRAGMA')) return [];
    queries.push([sql, args]); return [];
  } };
  const source = fs.readFileSync(path.join(__dirname, '../lib/database.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported = {};
  new Function('require', 'exports', code)(() => ({ openDatabaseAsync: async () => database }), exported);
  await exported.getTransactionPage(); await exported.getTransactionPage(10, 71);
  assert.match(queries[0][0], /ORDER BY id DESC LIMIT \?/);
  assert.deepEqual(queries[0][1], [10]);
  assert.match(queries[1][0], /AND id < \?/);
  assert.deepEqual(queries[1][1], [71, 10]);
  await assert.rejects(exported.getTransactionPage(0), /Invalid/);
});
