'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';
delete process.env.EXPO_PUBLIC_ENABLE_MAINNET;
delete process.env.EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET;
delete process.env.EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE;

require('./register-typescript.cjs');

const {
  LIGHTNING_PAYMENT_JOURNAL_KEY,
  createLightningPaymentJournal: createScopedLightningPaymentJournal,
  LIGHTNING_PAYMENT_JOURNAL_V2_PREFIX,
  lightningPaymentPresentation,
} = require('../lib/lightning/payment-journal.ts');
const scope = 'REGTEST:' + 'a'.repeat(64);
const scopedKey = LIGHTNING_PAYMENT_JOURNAL_V2_PREFIX + scope;
const createLightningPaymentJournal = (storage, now) => createScopedLightningPaymentJournal(storage, scope, now);
const {
  LIGHTNING_RECEIVE_REQUEST_KEY,
  createLightningReceiveStore,
} = require('../lib/lightning/receive-store.ts');
const {
  loadSparkTransfersPaginated,
  resolveLightningPaymentFromSpark,
} = require('../lib/lightning/spark-history.ts');
const {
  createOperationalHealthStore,
} = require('../lib/operational-health.ts');

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

const paymentHash = '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925';
const preimage = '00'.repeat(32);

test('hiding one pending payment survives restart and preserves its duplicate guard and other payments', async () => {
  const storage = memoryStorage(); const journal = createLightningPaymentJournal(storage);
  const other = 'a'.repeat(64);
  await journal.recordPending(paymentHash, 20); await journal.recordPending(other, 30);
  const original = await journal.get(paymentHash); const otherOriginal = await journal.get(other);
  await journal.setHidden(paymentHash, true);
  const restarted = createLightningPaymentJournal(storage);
  const hidden = await restarted.get(paymentHash);
  assert.ok(hidden.hiddenAt);
  const { hiddenAt, ...retained } = hidden;
  assert.deepEqual(retained, original);
  assert.deepEqual(await restarted.get(other), otherOriginal);
  assert.deepEqual(lightningPaymentPresentation(await restarted.list()), { pendingCount: 1, hiddenPaymentKeys: ['ln:' + paymentHash] });
  await assert.rejects(restarted.recordPending(paymentHash, 20), /already being processed/);
  await restarted.setHidden(paymentHash, false);
  assert.deepEqual(await restarted.get(paymentHash), original);
});

test('Lightning journals isolate wallets and networks; legacy pending sends block new submissions', async () => {
  const storage = memoryStorage();
  const first = createLightningPaymentJournal(storage);
  await first.recordPending(paymentHash, 20);
  const otherWallet = createScopedLightningPaymentJournal(storage, 'REGTEST:' + 'b'.repeat(64));
  const otherNetwork = createScopedLightningPaymentJournal(storage, 'MAINNET:' + 'a'.repeat(64));
  assert.deepEqual(await otherWallet.list(), []);
  assert.deepEqual(await otherNetwork.list(), []);
  assert.equal((await first.list()).length, 1);
  storage.values.set(LIGHTNING_PAYMENT_JOURNAL_KEY, JSON.stringify({
    version: 1, records: [{ paymentHash, state: 'pending' }],
  }));
  await assert.rejects(otherWallet.recordPending('b'.repeat(64), 20), /unscoped/i);
  await assert.rejects(otherNetwork.recordPending('c'.repeat(64), 20), /unscoped/i);
  assert.ok(storage.values.has(LIGHTNING_PAYMENT_JOURNAL_KEY));
});

test('a late Lightning result from an old scope cannot change the new wallet', async () => {
  const storage = memoryStorage();
  const oldWallet = createLightningPaymentJournal(storage);
  const newWallet = createScopedLightningPaymentJournal(storage, 'REGTEST:' + 'b'.repeat(64));
  await oldWallet.recordPending(paymentHash, 20);
  await newWallet.recordPending('b'.repeat(64), 30);
  let release;
  const checking = oldWallet.reconcile(() => new Promise(resolve => { release = resolve; }));
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await oldWallet.clear();
  release({ state: 'confirmed', result: 'PREIMAGE_VERIFIED' });
  await checking;
  assert.deepEqual(await oldWallet.list(), []);
  assert.equal((await newWallet.list())[0].state, 'pending');
});

test('a concurrent hide does not discard a terminal result and confirmed payments reappear automatically', async () => {
  const journal = createLightningPaymentJournal(memoryStorage());
  await journal.recordPending(paymentHash, 20);
  let resolve; const pending = new Promise(done => { resolve = done; });
  const checking = journal.reconcile(() => pending);
  await new Promise(done => setImmediate(done));
  await journal.setHidden(paymentHash, true);
  resolve({ state: 'confirmed', result: 'PREIMAGE_VERIFIED' });
  await checking;
  assert.equal((await journal.get(paymentHash)).state, 'confirmed');
  assert.deepEqual(lightningPaymentPresentation(await journal.list()), { pendingCount: 0, hiddenPaymentKeys: [] });
  await assert.rejects(journal.recordPending(paymentHash, 20), /already been paid/);
});

test('old journals default to visible and malformed hiding metadata fails closed', async () => {
  const storage = memoryStorage(); const journal = createLightningPaymentJournal(storage);
  await journal.recordPending(paymentHash, 20);
  assert.equal(lightningPaymentPresentation(await journal.list()).pendingCount, 1);
  const saved = JSON.parse(storage.values.get(scopedKey));
  saved.records[0].hiddenAt = 'invalid';
  storage.values.set(scopedKey, JSON.stringify(saved));
  await assert.rejects(journal.recordPending(paymentHash, 20), /invalid record/);
});

test('persists an unresolved Lightning payment without invoice or preimage material', async () => {
  const storage = memoryStorage();
  const journal = createLightningPaymentJournal(storage, () => new Date('2026-09-16T10:00:00Z'));
  await journal.recordPending(paymentHash, 125);
  await journal.recordRequestId(paymentHash, 'spark/request+=1');

  const [record] = await journal.list();
  assert.equal(record.state, 'pending');
  assert.equal(record.requestId, 'spark/request+=1');
  assert.equal(record.amountSats, 125);
  const persisted = storage.values.get(scopedKey);
  assert.doesNotMatch(persisted, /lnbc|lnbcrt|preimage|mnemonic|private.?key/i);
  await assert.rejects(journal.recordPending(paymentHash, 125), /already being processed/i);
});

test('keeps network failures pending and only promotes a proof-backed Spark success', async () => {
  const storage = memoryStorage();
  const journal = createLightningPaymentJournal(storage);
  await journal.recordPending(paymentHash, 50);
  await journal.recordRequestId(paymentHash, 'request-2');

  const afterFailure = await journal.reconcile(async () => {
    throw new Error('offline');
  });
  assert.equal(afterFailure[0].state, 'pending');

  const confirmed = await journal.reconcile(record => resolveLightningPaymentFromSpark({
    async getTransfers() { return { transfers: [], offset: 0 }; },
    async getLightningSendRequest(id) {
      assert.equal(id, 'request-2');
      return {
        id,
        status: 'TRANSFER_COMPLETED',
        idempotencyKey: 'opago-' + paymentHash,
        paymentPreimage: preimage,
      };
    },
  }, record));
  assert.equal(confirmed[0].state, 'confirmed');
  assert.equal(confirmed[0].result, 'TRANSFER_COMPLETED');
  await assert.rejects(journal.recordPending(paymentHash, 50), /already been paid/i);
});

test('never evicts unresolved Lightning payments to make room for a new send', async () => {
  const storage = memoryStorage();
  const createdAt = new Date('2026-09-16T10:00:00Z').toISOString();
  const records = Array.from({ length: 100 }, (_, index) => ({
    scope,
    paymentHash: index.toString(16).padStart(64, '0'),
    amountSats: 1,
    requestId: null,
    state: 'pending',
    result: null,
    createdAt,
    updatedAt: createdAt,
  }));
  storage.values.set(
    scopedKey,
    JSON.stringify({ version: 2, scope, records }),
  );
  const journal = createLightningPaymentJournal(storage);

  await assert.rejects(
    journal.recordPending('f'.repeat(64), 1),
    /too many Lightning payments/i,
  );
  assert.equal((await journal.list()).filter(record => record.state === 'pending').length, 100);
});

test('reconciles an ambiguous submission from paginated outgoing history', async () => {
  const record = {
    paymentHash,
    amountSats: 50,
    requestId: null,
    state: 'pending',
    result: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const resolution = await resolveLightningPaymentFromSpark({
    async getTransfers(limit, offset) {
      if (offset === 0) {
        return {
          offset: 1,
          transfers: [{
            id: 'transfer-1',
            status: 'COMPLETED',
            transferDirection: 'OUTGOING',
            userRequest: {
              id: 'request-3',
              idempotencyKey: 'opago-' + paymentHash,
              status: 'PREIMAGE_PROVIDED',
              paymentPreimage: preimage,
            },
          }],
        };
      }
      return { offset, transfers: [] };
    },
  }, record);
  assert.deepEqual(resolution, {
    state: 'confirmed',
    result: 'PREIMAGE_PROVIDED',
    requestId: 'request-3',
  });
});

test('falls back to Spark history when a saved request ID cannot be loaded directly', async () => {
  const record = {
    paymentHash,
    amountSats: 50,
    requestId: 'stale-request-id',
    state: 'pending',
    result: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const resolution = await resolveLightningPaymentFromSpark({
    async getLightningSendRequest() { throw new Error('request lookup unavailable'); },
    async getTransfers() {
      return {
        transfers: [{
          id: 'transfer-2',
          status: 'COMPLETED',
          transferDirection: 'OUTGOING',
          userRequest: {
            id: 'replacement-request-id',
            idempotencyKey: 'opago-' + paymentHash,
            status: 'PREIMAGE_PROVIDED',
            paymentPreimage: preimage,
          },
        }],
        offset: 1,
      };
    },
  }, record);

  assert.deepEqual(resolution, {
    state: 'confirmed',
    result: 'PREIMAGE_PROVIDED',
    requestId: 'replacement-request-id',
  });
});

test('loads Spark history page by page without repeating an offset', async () => {
  const calls = [];
  const transfers = await loadSparkTransfersPaginated({
    async getTransfers(limit, offset) {
      calls.push([limit, offset]);
      if (offset === 0) return { transfers: [{ id: '1' }, { id: '2' }], offset: 2 };
      return { transfers: [{ id: '3' }], offset: 3 };
    },
  }, 5, 2);
  assert.deepEqual(transfers.map(item => item.id), ['1', '2', '3']);
  assert.deepEqual(calls, [[2, 0], [2, 2]]);
});

test('restores receive requests even after expiry for reconciliation, and removes corrupt data', async () => {
  const storage = memoryStorage();
  const store = createLightningReceiveStore(storage);
  const request = {
    requestId: 'receive-1',
    invoice: 'lightning:lnbcrt1' + 'q'.repeat(32),
    paymentHash,
    amountSats: 75,
    expiresAt: Date.now() + 60_000,
    createdAt: new Date().toISOString(),
  };
  await store.save(request);
  assert.deepEqual(await store.load(), request);

  storage.values.set(LIGHTNING_RECEIVE_REQUEST_KEY, '{broken');
  assert.equal(await store.load(), null);
  assert.equal(storage.values.has(LIGHTNING_RECEIVE_REQUEST_KEY), false);

  const expired = { ...request, expiresAt: Date.now() - 1 };
  await store.save(expired);
  assert.deepEqual(await store.load(), expired);
});

test('stores only aggregate local Lightning health without payment identifiers', async () => {
  const storage = memoryStorage();
  const health = createOperationalHealthStore(
    storage,
    () => new Date('2026-09-16T12:00:00Z'),
  );
  await health.recordFailure('lightning', new Error('network timeout for invoice secret-value'));
  const failed = await health.get('lightning');
  assert.equal(failed.consecutiveFailures, 1);
  assert.equal(failed.lastErrorCategory, 'timeout');
  assert.doesNotMatch([...storage.values.values()].join(''), /secret-value|invoice/i);

  await health.recordSuccess('lightning');
  const healthy = await health.get('lightning');
  assert.equal(healthy.consecutiveFailures, 0);
  assert.equal(healthy.lastErrorCategory, null);
});
