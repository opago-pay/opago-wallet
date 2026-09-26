'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
require('./register-typescript.cjs');

const nativePath = require.resolve('../lib/bitcoin/store-native.ts');
const wipePath = require.resolve('../lib/wallet-wipe-native.ts');
const { BITCOIN_STORE_KEY } = require('../lib/bitcoin/store.ts');
const markerKey = 'synthetic-wallet-wipe-marker';
const scopeA = 'REGTEST:' + 'a'.repeat(66);
const scopeB = 'REGTEST:' + 'b'.repeat(66);

function operation(scope, id) {
  return { scope, network: 'REGTEST', id, kind: 'withdrawal',
    address: 'synthetic-test-address', amountSats: 1000, feeSats: 10,
    state: 'prepared', createdAt: '2026-09-24T00:00:00.000Z' };
}

// Load the actual native adapter and native wipe sequence. Only device APIs
// are replaced with in-memory equivalents; no workspace-specific path is used.
function fixture(t) {
  const values = new Map();
  const secureValues = new Map();
  const sql = new DatabaseSync(':memory:');
  let failSqlOnce = null;
  let failLegacyRemovalOnce = false;
  let failMarkerRemovalOnce = false;
  let legacyRemovalPause = null;
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) {
      if (key === BITCOIN_STORE_KEY && legacyRemovalPause) {
        const pause = legacyRemovalPause;
        legacyRemovalPause = null;
        pause.entered();
        await pause.wait;
      }
      if (key === BITCOIN_STORE_KEY && failLegacyRemovalOnce) {
        failLegacyRemovalOnce = false;
        throw new Error('simulated legacy cleanup interruption');
      }
      values.delete(key);
    },
  };
  const secure = {
    getSecureItem: async key => secureValues.get(key) ?? null,
    setSecureItem: async (key, value) => { secureValues.set(key, value); },
    deleteSecureItem: async key => {
      if (key === markerKey && failMarkerRemovalOnce) {
        failMarkerRemovalOnce = false;
        throw new Error('simulated marker interruption');
      }
      secureValues.delete(key);
    },
  };
  const db = {
    async execAsync(query) { sql.exec(query); },
    async getFirstAsync(query, ...params) { return sql.prepare(query).get(...params) ?? null; },
    async getAllAsync(query, ...params) { return sql.prepare(query).all(...params); },
    async runAsync(query, ...params) {
      if (failSqlOnce && query.includes(failSqlOnce)) {
        failSqlOnce = null;
        throw new Error('simulated SQLite interruption');
      }
      return sql.prepare(query).run(...params);
    },
    async withExclusiveTransactionAsync(work) {
      sql.exec('BEGIN IMMEDIATE');
      try { await work(db); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const noop = async () => {};
  const wipeMocks = {
    './storage': { ...secure, WALLET_WIPE_PENDING_KEY: markerKey,
      MNEMONIC_STORE_KEY: 'synthetic-mnemonic', WALLET_IDENTITY_KEY: 'synthetic-identity' },
    './database': { wipeTransactions: noop },
    './home-balance-preview-native': { homeBalancePreviewStore: { clear: noop } },
    './hedera/account-binding-native': { clearHederaAccountBindings: noop },
    './hedera/payment-journal-native': { clearAllHederaPaymentJournals: noop },
    './lightning/payment-journal-native': { clearAllLightningPaymentJournals: noop },
    './lightning/receive-store-native': { lightningReceiveStore: { clear: noop } },
    './bitcoin/receive-archive': { clearBitcoinReceiveArchive: noop },
    './moonpay-return-native': { clearMoonPayReturnNotice: noop },
    './operational-health-native': { operationalHealth: { clear: noop } },
    './wallet-backup': { BACKUP_STATUS_KEY: 'synthetic-backup' },
  };
  function load() {
    delete require.cache[nativePath];
    delete require.cache[wipePath];
    const originalLoad = Module._load;
    let native;
    Module._load = function(name, parent, main) {
      if (name === '@react-native-async-storage/async-storage') return storage;
      if (name === 'expo-sqlite') return { openDatabaseAsync: async () => db };
      if (parent?.filename === nativePath && name === '../storage') return secure;
      if (parent?.filename === wipePath) {
        if (name === './bitcoin/store-native') return native;
        if (Object.hasOwn(wipeMocks, name)) return wipeMocks[name];
      }
      return originalLoad.call(this, name, parent, main);
    };
    try {
      native = require('../lib/bitcoin/store-native.ts');
      return { native, wiper: require('../lib/wallet-wipe-native.ts') };
    } finally { Module._load = originalLoad; }
  }
  t.after(() => {
    delete require.cache[nativePath];
    delete require.cache[wipePath];
    sql.close();
  });
  return {
    load, values, secureValues, sql,
    markForWipe() { secureValues.set(markerKey, 'true'); },
    marker() { return secureValues.get(markerKey) ?? null; },
    failSqlOn(query) { failSqlOnce = query; },
    failLegacyRemoval() { failLegacyRemovalOnce = true; },
    failMarkerRemoval() { failMarkerRemovalOnce = true; },
    pauseLegacyRemoval() {
      let entered, release;
      const started = new Promise(resolve => { entered = resolve; });
      const wait = new Promise(resolve => { release = resolve; });
      legacyRemovalPause = { entered, wait };
      return { started, release };
    },
  };
}

test('native adapter moves from wallet A to wallet B in one process; stale reads, writes and clears fail', async t => {
  const f = fixture(t);
  const { native, wiper } = f.load();
  const oldStore = native.bitcoinStore;
  await oldStore.begin(operation(scopeA, 'wallet-a'), () => {});
  f.markForWipe();
  assert.equal(await wiper.resumePendingWalletWipe(), true);
  assert.equal(f.marker(), null);
  assert.notEqual(native.bitcoinStore, oldStore);
  assert.equal(require('../lib/bitcoin/store-native.ts').bitcoinStore, native.bitcoinStore);
  assert.deepEqual(await native.bitcoinStore.listActive(scopeB), []);
  await native.bitcoinStore.begin(operation(scopeB, 'wallet-b'), () => {});
  assert.deepEqual((await native.bitcoinStore.list(scopeB)).map(item => item.id), ['wallet-b']);
  await assert.rejects(oldStore.list(scopeA), /Wallet changed/);
  await assert.rejects(oldStore.begin(operation(scopeA, 'late-wallet-a'), () => {}), /Wallet changed/);
  await assert.rejects(oldStore.clear(), /Wallet changed/);
  assert.deepEqual((await native.bitcoinStore.list(scopeB)).map(item => item.id), ['wallet-b']);
});

test('restoring the same wallet after deletion receives a fresh native store and no old operations', async t => {
  const f = fixture(t);
  const { native, wiper } = f.load();
  const oldStore = native.bitcoinStore;
  await oldStore.begin(operation(scopeA, 'before-wipe'), () => {});
  f.markForWipe();
  await wiper.resumePendingWalletWipe();
  assert.deepEqual(await native.bitcoinStore.list(scopeA), []);
  await native.bitcoinStore.begin(operation(scopeA, 'restored-wallet'), () => {});
  await assert.rejects(oldStore.update(scopeA, 'restored-wallet', previous => previous, () => {}), /Wallet changed/);
  assert.deepEqual((await native.bitcoinStore.list(scopeA)).map(item => item.id), ['restored-wallet']);
});

test('a late clear queued during deletion finishes or is rejected before the next store becomes active', async t => {
  const f = fixture(t);
  const { native, wiper } = f.load();
  const oldStore = native.bitcoinStore;
  await oldStore.begin(operation(scopeA, 'old-payment'), () => {});
  const pause = f.pauseLegacyRemoval();
  f.markForWipe();
  const wipe = wiper.resumePendingWalletWipe();
  await pause.started;
  const lateClear = oldStore.clear();
  const lateWrite = oldStore.begin(operation(scopeA, 'late-payment'), () => {});
  pause.release();
  await wipe;
  await Promise.allSettled([lateClear, lateWrite]);
  await assert.rejects(lateWrite, /Wallet changed/);
  await native.bitcoinStore.begin(operation(scopeB, 'new-payment'), () => {});
  await assert.rejects(oldStore.clear(), /Wallet changed/);
  assert.deepEqual((await native.bitcoinStore.list(scopeB)).map(item => item.id), ['new-payment']);
});

test('parallel startup callers wait for store activation after the wipe marker is removed', async t => {
  const f = fixture(t);
  const { native, wiper } = f.load();
  const oldStore = native.bitcoinStore;
  const retire = oldStore.retireAfterWipe.bind(oldStore);
  let entered, release;
  const retiring = new Promise(resolve => { entered = resolve; });
  const proceed = new Promise(resolve => { release = resolve; });
  oldStore.retireAfterWipe = async () => { entered(); await proceed; await retire(); };
  f.markForWipe();
  const first = wiper.resumePendingWalletWipe();
  await retiring;
  assert.equal(f.marker(), null);
  let secondSettled = false;
  const second = wiper.resumePendingWalletWipe().finally(() => { secondSettled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(secondSettled, false);
  release();
  assert.deepEqual(await Promise.all([first, second]), [true, false]);
  await native.bitcoinStore.begin(operation(scopeB, 'after-parallel-startup'), () => {});
  assert.equal((await native.bitcoinStore.list(scopeB)).length, 1);
});

test('an interrupted post-marker activation is retried without exposing the wiped instance', async t => {
  const f = fixture(t);
  const { native, wiper } = f.load();
  const oldStore = native.bitcoinStore;
  const retire = oldStore.retireAfterWipe.bind(oldStore);
  let fail = true;
  oldStore.retireAfterWipe = async () => {
    if (fail) { fail = false; throw new Error('simulated activation interruption'); }
    await retire();
  };
  f.markForWipe();
  await assert.rejects(wiper.resumePendingWalletWipe(), /simulated activation interruption/);
  assert.equal(f.marker(), null);
  assert.equal(native.bitcoinStore, oldStore);
  await assert.rejects(oldStore.list(scopeA), /Wallet changed/);
  assert.equal(await wiper.resumePendingWalletWipe(), true);
  assert.notEqual(native.bitcoinStore, oldStore);
  await native.bitcoinStore.begin(operation(scopeB, 'after-activation-retry'), () => {});
  await assert.rejects(oldStore.clear(), /Wallet changed/);
  assert.equal((await native.bitcoinStore.list(scopeB)).length, 1);
});

test('startup completes a previously interrupted native wipe before creating a wallet', async t => {
  const f = fixture(t);
  let { native } = f.load();
  await native.bitcoinStore.begin(operation(scopeA, 'old-payment'), () => {});
  f.markForWipe();
  // A new module lifetime models the next app process with a durable marker.
  ({ native } = f.load());
  const wiper = require('../lib/wallet-wipe-native.ts');
  assert.equal(await wiper.resumePendingWalletWipe(), true);
  assert.equal(f.marker(), null);
  assert.deepEqual(await native.bitcoinStore.list(scopeA), []);
  await native.bitcoinStore.begin(operation(scopeB, 'created-after-startup'), () => {});
  assert.equal((await native.bitcoinStore.list(scopeB)).length, 1);
});

test('corrupt legacy JSON can be wiped; its late return is never reimported', async t => {
  const f = fixture(t);
  f.values.set(BITCOIN_STORE_KEY, '{corrupt');
  const { native, wiper } = f.load();
  const oldStore = native.bitcoinStore;
  await assert.rejects(oldStore.list(scopeA));
  f.markForWipe();
  await wiper.resumePendingWalletWipe();
  f.values.set(BITCOIN_STORE_KEY, JSON.stringify({ version: 1, records: [operation(scopeA, 'must-not-return')] }));
  assert.deepEqual(await native.bitcoinStore.list(scopeA), []);
  assert.equal(f.values.has(BITCOIN_STORE_KEY), false);
  await native.bitcoinStore.begin(operation(scopeB, 'new-payment'), () => {});
  await assert.rejects(oldStore.clear(), /Wallet changed/);
  assert.equal((await native.bitcoinStore.list(scopeB)).length, 1);
});

test('failed SQLite deletion, post-commit cleanup and marker removal retry without exposing the next wallet', async t => {
  for (const failure of ['DELETE FROM bitcoin_operations', 'legacy', 'marker']) {
    await t.test(failure, async subtest => {
      const f = fixture(subtest);
      const { native, wiper } = f.load();
      const oldStore = native.bitcoinStore;
      await oldStore.begin(operation(scopeA, 'old-payment'), () => {});
      f.markForWipe();
      if (failure === 'legacy') f.failLegacyRemoval();
      else if (failure === 'marker') f.failMarkerRemoval();
      else f.failSqlOn(failure);
      await assert.rejects(wiper.resumePendingWalletWipe(), /simulated/);
      assert.equal(f.marker(), 'true');
      assert.equal(native.bitcoinStore, oldStore);
      await assert.rejects(oldStore.list(scopeA), /Wallet changed/);
      if (failure === 'DELETE FROM bitcoin_operations') {
        assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM bitcoin_operations').get().count, 1);
      } else {
        assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM bitcoin_operations').get().count, 0);
      }
      assert.equal(await wiper.resumePendingWalletWipe(), true);
      assert.notEqual(native.bitcoinStore, oldStore);
      await native.bitcoinStore.begin(operation(scopeB, 'after-retry'), () => {});
      await assert.rejects(oldStore.clear(), /Wallet changed/);
      assert.equal((await native.bitcoinStore.list(scopeB)).length, 1);
    });
  }
});
