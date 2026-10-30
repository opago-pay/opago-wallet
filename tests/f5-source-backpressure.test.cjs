'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const existingModules = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { TransactionSync, syncKey } = require('../lib/opago/tx-sync.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { TransactionContractTestAdapter } = require('../lib/opago/tx-test-adapter.ts');
const { localSourcePage } = require('../lib/opago/tx-local-source.ts');
for (const name of Object.keys(require.cache)) if (name.endsWith('.ts') && !existingModules.has(name)) delete require.cache[name];
const candidate = (i, status = 'pending') => ({ localId: 'request:' + String(i).padStart(4, '0'), report: {
  asset: 'BTC', rail: 'lightning', id_source: 'SPARK_LIGHTNING_REQUEST_ID', source_payment_id: 'request-' + i,
  direction: 'incoming', sdk_status: status, status, amount_msat: 1000,
} });
function fixture(items, paged = true) {
  const store = new MemoryPrivateStore();
  const owner = { localWalletId: 'local', source: 'spark', sourceWalletId: 'key', network: 'regtest', subject: 'user', installationId: randomUUID(), generation: 0 };
  const backend = new TransactionContractTestAdapter(store, owner, randomUUID);
  const rows = { items };
  const sources = [{ id: 'archive', async read(cursor) { return paged ? localSourcePage(rows.items, cursor) : { items: rows.items, next: null }; } }];
  const reopen = () => new TransactionSync(store, owner, sources, backend, randomUUID, () => {});
  return { store, owner, backend, rows, sources, reopen, sync: reopen() };
}
async function drain(f, count) {
  for (let i = 0; i < 40 && f.backend.writes.length < count; i++) { await f.reopen().collect(50); await f.reopen().flush(100); }
  assert.equal(f.backend.writes.length, count);
  assert.equal(new Set(f.backend.writes.map(row => row.key)).size, count);
}
test('F5 unpaged 501-item history admits a bounded prefix, survives restart and drains without losing its final item', async () => {
  const f = fixture(Array.from({ length: 501 }, (_, i) => candidate(i)), false);
  await f.sync.collect();
  assert.equal((await f.sync.snapshot()).queued, 500);
  assert.deepEqual((await f.sync.snapshot()).sources, {});
  const before = await f.store.read(syncKey(f.owner));
  await f.reopen().collect();
  assert.deepEqual((await f.store.read(syncKey(f.owner))).entries, before.entries);
  await drain(f, 501);
  await f.sync.collect(); await f.sync.flush(100);
  assert.equal(f.backend.writes.length, 501);
  assert.equal((await f.sync.snapshot()).sources.archive.cycles > 0, true);
});
test('F5 partial pages keep their previous checkpoint and stable keys until capacity is freed', async () => {
  const f = fixture(Array.from({ length: 103 }, (_, i) => candidate(i)));
  await f.sync.migrate('seed', Array.from({ length: 477 }, (_, i) => candidate(1000 + i)));
  await f.sync.collect(1);
  let doc = await f.store.read(syncKey(f.owner));
  assert.equal(doc.entries.length, 500); assert.deepEqual(doc.sources, {});
  const firstKeys = doc.entries.map(row => row.id);
  await f.reopen().collect(1); doc = await f.store.read(syncKey(f.owner));
  assert.deepEqual(doc.entries.map(row => row.id), firstKeys);
  await drain(f, 580);
  assert.equal((await f.sync.snapshot()).queued, 0);
});
test('F5 keyset pages tolerate reordering and pruning of already-read rows; inserts and updates behind cursor return next cycle', async () => {
  const original = Array.from({ length: 120 }, (_, i) => candidate(i));
  const f = fixture([...original]);
  await f.sync.collect(1);
  const cursor = (await f.sync.snapshot()).sources.archive.cursor;
  assert.ok(cursor);
  // Remove only acknowledged-to-outbox source rows, reorder the rest, and change a prior observation.
  f.rows.items = [...original.slice(50).reverse(), candidate(0, 'settled'), candidate(-1)];
  await f.reopen().collect(50);
  assert.equal((await f.sync.snapshot()).queued, 120);
  await f.reopen().collect(50);
  assert.equal((await f.sync.snapshot()).queued, 122);
  await drain(f, 122);
  assert.equal(original.length, 120); // Sync never modifies the source journal.
});
test('F5 local pages preserve distinct facts sharing an identity and suppress only exact duplicate facts', () => {
  const rows = Array.from({ length: 49 }, (_, i) => candidate(i));
  rows.push(candidate(49, 'pending'), candidate(49, 'settled'), candidate(49, 'settled'));
  const first = localSourcePage(rows, null, 3);
  assert.equal(first.items.length, 50); assert.equal(first.skipped, 3); assert.ok(first.next);
  const second = localSourcePage([...rows].reverse(), first.next, 3);
  assert.equal(second.items.length, 1); assert.equal(second.skipped, 0); assert.equal(second.next, null);
  assert.equal(new Set([...first.items, ...second.items].map(row => JSON.stringify(row))).size, 51);
  for (const cursor of ['50', '{}', 'null', '["x"]', '["x","bad"]']) assert.throws(() => localSourcePage(rows, cursor), /sync_invalid_contract/);
});
test('F5 failed partial writes preserve the old outbox and source checkpoint', async () => {
  const f = fixture(Array.from({ length: 501 }, (_, i) => candidate(i)), false);
  const write = f.store.write.bind(f.store);
  f.store.write = async () => { throw Error('disk'); };
  await assert.rejects(f.sync.collect(), /disk/);
  assert.equal((await f.sync.snapshot()).queued, 0); assert.deepEqual((await f.sync.snapshot()).sources, {});
  f.store.write = write; await f.reopen().collect();
  assert.equal((await f.sync.snapshot()).queued, 500);
});
test('F5 storage and migration hard limits remain errors, not truncation or cursor advancement', async () => {
  const f = fixture([]);
  await assert.rejects(f.sync.migrate('too-large', Array.from({ length: 501 }, (_, i) => candidate(i))), /sync_storage_full/);
  assert.equal((await f.sync.snapshot()).queued, 0);
  await f.sync.migrate('seed', [candidate(0)]);
  const doc = await f.store.read(syncKey(f.owner));
  doc.migrated.push('x'.repeat(1_500_000));
  await f.store.write(syncKey(f.owner), doc);
  f.rows.items = [candidate(1)];
  await assert.rejects(f.sync.collect(), /sync_storage_full/);
  assert.deepEqual((await f.sync.snapshot()).sources, {});
  assert.equal((await f.sync.snapshot()).queued, 1);
});
test('F5 paused non-head page retains cursor across mutations and retries all remaining facts next cycle', async () => {
  const original = Array.from({ length: 103 }, (_, i) => candidate(i));
  const f = fixture([...original]);
  await f.sync.collect(1);
  const progress = (await f.sync.snapshot()).sources.archive;
  assert.ok(progress.cursor);
  await f.sync.migrate('seed', Array.from({ length: 427 }, (_, i) => candidate(1000 + i)));
  await f.sync.collect(1);
  assert.equal((await f.sync.snapshot()).queued, 500);
  assert.deepEqual((await f.sync.snapshot()).sources.archive, progress);
  const before = await f.store.read(syncKey(f.owner));
  // Only prune already-admitted rows. New observations both before and after the
  // saved key must survive, including a changed status in the partially read page.
  f.rows.items = [...original.slice(73).reverse(), candidate(60, 'settled'), candidate(1, 'settled'), candidate(200)];
  await f.reopen().collect(1);
  assert.deepEqual((await f.store.read(syncKey(f.owner))).entries, before.entries);
  assert.deepEqual((await f.sync.snapshot()).sources.archive, progress);
  await drain(f, 533);
  await f.reopen().collect(50); await f.sync.flush(100);
  assert.equal(f.backend.writes.length, 533);
  assert.equal((await f.sync.snapshot()).queued, 0);
});
