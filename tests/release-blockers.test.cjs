'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
require('./register-typescript.cjs');
const { BITCOIN_STORE_KEY } = require('../lib/bitcoin/store.ts');
const { createBitcoinSqliteStore } = require('../lib/bitcoin/store-sqlite.ts');
const { createBitcoinRequestCursor } = require('../lib/bitcoin/request-cursor.ts');
const { recoverBitcoinProviderWithdrawals, prepareBitcoinWithdrawal, submitBitcoinWithdrawal } =
  require('../lib/bitcoin/onchain.ts');
const { createWalletWiper } = require('../lib/wallet-wipe.ts');
const { p2wpkh } = require('@scure/btc-signer/payment');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { bitcoinNetwork } = require('../lib/bitcoin/destination.ts');

function storage() {
  const values = new Map();
  return { values, async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); } };
}
function sqlFixture() {
  const sql = new DatabaseSync(':memory:');
  let failCommit = false;
  const db = {
    async execAsync(query) { sql.exec(query); },
    async getFirstAsync(query, ...params) { return sql.prepare(query).get(...params) ?? null; },
    async getAllAsync(query, ...params) { return sql.prepare(query).all(...params); },
    async runAsync(query, ...params) {
      if (failCommit && query.includes('bitcoin_store_meta')) {
        failCommit = false;
        throw new Error('interrupted before commit');
      }
      return sql.prepare(query).run(...params);
    },
    async withExclusiveTransactionAsync(work) {
      sql.exec('BEGIN IMMEDIATE');
      try { await work(db); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return { sql, db, interruptBeforeCommit() { failCommit = true; } };
}

test('B09: an unverified first page cannot hide a pending request on page two after retry', async t => {
  const mem = storage();
  const fixture = sqlFixture();
  t.after(() => fixture.sql.close());
  const store = createBitcoinSqliteStore(async () => fixture.db, mem);
  const cursor = createBitcoinRequestCursor(mem);
  const key = secp256k1.getPublicKey(new Uint8Array(32).fill(17));
  const identity = Buffer.from(key).toString('hex');
  const scope = 'REGTEST:' + identity;
  const address = p2wpkh(key, bitcoinNetwork('REGTEST')).address;
  const request = (id, status = 'SUCCEEDED') => ({ id, status, network: 'REGTEST',
    typename: 'CoopExitRequest', feeQuoteId: 'q-' + id,
    createdAt: '2026-09-24T00:00:00.000Z' });
  let remote = [request('old-anchor')];
  let injectAfterNextSnapshot = false;
  let quotes = 0;
  let withdrawals = 0;
  const wallet = {
    getIdentityPublicKey: async () => identity,
    getBalance: async () => ({ satsBalance: { available: 5000n } }),
    getUserRequests: async ({ after }) => {
      const start = after ? remote.findIndex(item => item.id === after) + 1 : 0;
      const entities = remote.slice(start, start + 50);
      const response = { entities, pageInfo: { hasNextPage: start + 50 < remote.length,
        endCursor: entities.at(-1)?.id } };
      if (injectAfterNextSnapshot) {
        injectAfterNextSnapshot = false;
        remote = [...Array.from({ length: 100 }, (_, index) =>
          request('new-' + index, index === 75 ? 'INITIATED' : 'SUCCEEDED')), ...remote];
      }
      return response;
    },
    getWithdrawalFeeQuote: async () => {
      quotes++;
      const amount = value => ({ originalUnit: 'SATOSHI', originalValue: value });
      return { id: 'test-quote', network: 'REGTEST', totalAmount: amount(1000),
        expiresAt: new Date(Date.now() + 120000).toISOString(),
        l1BroadcastFeeMedium: amount(100), userFeeMedium: amount(20) };
    },
    withdraw: async () => {
      withdrawals++;
      return { ...request('synthetic-new-payment', 'INITIATED'), feeQuoteId: 'test-quote' };
    },
  };
  assert.equal(await recoverBitcoinProviderWithdrawals(wallet, store, scope, cursor, () => {}), true);
  injectAfterNextSnapshot = true;
  assert.equal(await recoverBitcoinProviderWithdrawals(wallet, store, scope, cursor, () => {}), false);
  const restartedStore = createBitcoinSqliteStore(async () => fixture.db, mem);
  const restartedCursor = createBitcoinRequestCursor(mem);
  const observed = await restartedStore.listActive(scope);
  assert.equal(observed.some(item => item.requestId === 'new-75'), false);
  await assert.rejects(prepareBitcoinWithdrawal(wallet, 'REGTEST', address, 1000,
    () => {}, restartedStore, restartedCursor), /still being checked/);
  assert.equal((await restartedStore.listActive(scope)).some(item => item.requestId === 'new-75'), true);
  await assert.rejects(submitBitcoinWithdrawal(wallet, restartedStore, {
    asset: 'bitcoin', route: 'onchain', network: 'REGTEST', scope, address,
    amountSats: 1000, feeSats: 120, networkFeeSats: 100, serviceFeeSats: 20,
    totalSats: 1120, quoteId: 'test-quote', expiresAt: Date.now() + 120_000,
  }, () => {}, restartedCursor), /still being checked/);
  assert.equal(quotes, 0);
  assert.equal(withdrawals, 0);
});

test('B09: a malformed ready checkpoint cannot be treated as verified history', async () => {
  const mem = storage();
  const scope = 'REGTEST:' + 'a'.repeat(66);
  mem.values.set('opago.bitcoin.request-cursors.v1', JSON.stringify({
    version: 1, cursors: {}, withdrawalScans: { [scope]: { phase: 'ready' } },
  }));
  const cursor = createBitcoinRequestCursor(mem);
  await assert.rejects(cursor.hasPending(scope, 'withdrawal'), /invalid/);
});

test('B18/B22: authorized wipe bypasses corrupt legacy JSON and blocks later writes', async t => {
  const mem = storage();
  mem.values.set(BITCOIN_STORE_KEY, '{invalid JSON');
  const fixture = sqlFixture();
  t.after(() => fixture.sql.close());
  const store = createBitcoinSqliteStore(async () => fixture.db, mem);
  await assert.rejects(store.list('REGTEST:' + 'a'.repeat(66)), /Bitcoin payment storage/);
  let marker = 'true';
  const wiper = createWalletWiper({ get: async () => marker,
    remove: async () => { marker = null; } }, [() => store.clear()]);
  assert.equal(await wiper.resumeIfPending(), true);
  assert.equal(await wiper.resumeIfPending(), false);
  assert.equal(marker, null);
  assert.equal(mem.values.has(BITCOIN_STORE_KEY), false);
  await assert.rejects(store.list('REGTEST:' + 'a'.repeat(66)), /Wallet changed/);
  await assert.rejects(store.update('REGTEST:' + 'a'.repeat(66), 'late',
    () => { throw new Error('late write'); }, () => {}), /Wallet changed/);
  const fresh = createBitcoinSqliteStore(async () => fixture.db, mem);
  assert.deepEqual(await fresh.list('REGTEST:' + 'a'.repeat(66)), []);
});

test('B18/B22: interrupted wipe retries before and after the SQLite tombstone commit', async t => {
  const mem = storage();
  mem.values.set(BITCOIN_STORE_KEY, '{invalid JSON');
  const fixture = sqlFixture();
  t.after(() => fixture.sql.close());
  const store = createBitcoinSqliteStore(async () => fixture.db, mem);
  let marker = 'true';
  const originalRemove = mem.removeItem;
  let interruptCleanup = true;
  mem.removeItem = async key => {
    if (interruptCleanup) { interruptCleanup = false; throw new Error('interrupted after commit'); }
    return originalRemove(key);
  };
  fixture.interruptBeforeCommit();
  const wiper = createWalletWiper({ get: async () => marker,
    remove: async () => { marker = null; } }, [() => store.clear()]);
  await assert.rejects(wiper.resumeIfPending(), /interrupted before commit/);
  assert.equal(marker, 'true');
  assert.equal(fixture.sql.prepare('SELECT value FROM bitcoin_store_meta WHERE key = ?').get(
    'legacy-async-storage-v1'), undefined);
  await assert.rejects(wiper.resumeIfPending(), /interrupted after commit/);
  assert.equal(marker, 'true');
  assert.equal(fixture.sql.prepare('SELECT value FROM bitcoin_store_meta WHERE key = ?').get(
    'legacy-async-storage-v1').value, '2');
  const freshBeforeCleanup = createBitcoinSqliteStore(async () => fixture.db, mem);
  assert.deepEqual(await freshBeforeCleanup.list('REGTEST:' + 'a'.repeat(66)), []);
  assert.equal(await wiper.resumeIfPending(), true);
  assert.equal(marker, null);
  assert.equal(mem.values.has(BITCOIN_STORE_KEY), false);
});
