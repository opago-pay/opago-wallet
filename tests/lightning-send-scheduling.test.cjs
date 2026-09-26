'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('./register-typescript.cjs');
const { payPreparedSparkPayment, prepareDecodedSparkPayment, LightningPaymentPendingError } = require('../lib/payments.ts');
const { createLightningPaymentJournal: createScopedLightningPaymentJournal } = require('../lib/lightning/payment-journal.ts');
const createLightningPaymentJournal = storage => createScopedLightningPaymentJournal(storage, 'REGTEST:' + 'a'.repeat(64));
const paymentHash = '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925';
const preimage = '00'.repeat(32);
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function storage(beforeWrite = async () => {}) {
  const data = new Map();
  return {
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => { await beforeWrite(JSON.parse(value)); data.set(key, value); },
    removeItem: async key => { data.delete(key); },
  };
}
function nativeLifecycle(journal, addTransaction, assertSession = () => {}) {
  const source = fs.readFileSync(path.join(__dirname, '../lib/lightning/reconcile-native.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies = {
    '../database': { addTransaction },
    '../lightning': { createPaymentReference: hash => 'ln:' + hash },
    '../promise-timeout': {},
    '../wallet-session': { walletSession: { captureRuntime: () => assertSession } },
    './payment-journal-native': { lightningPaymentJournalFor: () => journal },
    './spark-history': {},
  };
  const exports = {};
  new Function('require', 'exports', code)(name => {
    assert.ok(name in dependencies, 'Unexpected dependency: ' + name);
    return dependencies[name];
  }, exports);
  return exports.lightningPaymentLifecycle({ network: 'REGTEST', publicKey: 'a'.repeat(64) });
}
function wallet(result = { id: 'request-1', preimage }) {
  return {
    getBalance: async () => ({ balance: 100 }),
    getLightningSendFeeEstimate: async () => 2,
    payLightningInvoice: async () => result,
  };
}
const prepare = client => prepareDecodedSparkPayment(client, {
  invoice: 'synthetic-validated-invoice', paymentHash, amountSats: 20, expiresAt: Date.now() + 60_000,
});

test('slow history writes do not delay submission or verified success, but the pending journal does', async () => {
  const pendingWrite = deferred();
  const historyWrite = deferred();
  let submitted = false;
  const disk = storage(async document => {
    if (document.records[0].state === 'pending') await pendingWrite.promise;
  });
  const journal = createLightningPaymentJournal(disk);
  const history = [];
  const lifecycle = nativeLifecycle(journal, (...args) => {
    history.push(args[3].status);
    return historyWrite.promise;
  });
  const client = wallet();
  client.payLightningInvoice = async () => {
    assert.equal((await journal.get(paymentHash)).state, 'pending');
    submitted = true;
    return { id: 'request-1', preimage };
  };
  let result;
  const sending = payPreparedSparkPayment(client, await prepare(client), lifecycle).then(value => { result = value; });
  await flush();
  assert.equal(submitted, false);
  assert.deepEqual(history, []);
  pendingWrite.resolve();
  await flush();
  try {
    assert.equal(submitted, true);
    assert.equal(result?.proof, preimage);
    assert.deepEqual(history, ['pending', 'confirmed']);
    const restarted = createLightningPaymentJournal(disk);
    const saved = await restarted.get(paymentHash);
    assert.equal(saved.state, 'confirmed');
    assert.equal(saved.requestId, 'request-1');
    await assert.rejects(restarted.recordPending(paymentHash, 20), /already been paid/);
  } finally { historyWrite.resolve(); await sending; }
});

test('failed background history indexing never turns a proof-backed payment into an error', async () => {
  const journal = createLightningPaymentJournal(storage());
  const lifecycle = nativeLifecycle(journal, async () => { throw new Error('SQLite unavailable'); });
  const client = wallet();
  const result = await payPreparedSparkPayment(client, await prepare(client), lifecycle);
  assert.equal(result.proof, preimage);
  assert.equal((await journal.get(paymentHash)).state, 'confirmed');
  await flush();
});

test('a failed combined terminal write retains the request ID for recovery without changing verified success', async () => {
  const disk = storage(async document => {
    if (document.records[0].state === 'confirmed') throw new Error('Terminal write failed');
  });
  const journal = createLightningPaymentJournal(disk);
  const lifecycle = nativeLifecycle(journal, async () => {});
  const client = wallet();
  const result = await payPreparedSparkPayment(client, await prepare(client), lifecycle);
  assert.equal(result.proof, preimage);
  const restarted = createLightningPaymentJournal(disk);
  const saved = await restarted.get(paymentHash);
  assert.equal(saved.state, 'pending');
  assert.equal(saved.requestId, 'request-1');
  await assert.rejects(restarted.recordPending(paymentHash, 20), /already being processed/);
});

test('an unresolved result persists its request ID and stays protected across restart', async () => {
  const disk = storage();
  const journal = createLightningPaymentJournal(disk);
  const lifecycle = nativeLifecycle(journal, async () => {});
  const client = wallet({ id: 'request-1', status: 'PENDING' });
  await assert.rejects(payPreparedSparkPayment(client, await prepare(client), lifecycle), LightningPaymentPendingError);
  const restarted = createLightningPaymentJournal(disk);
  assert.equal((await restarted.get(paymentHash)).requestId, 'request-1');
  await assert.rejects(restarted.recordPending(paymentHash, 20), /already being processed/);
});

test('an authoritative unpaid result stores its request ID together with the failed state', async () => {
  const journal = createLightningPaymentJournal(storage());
  const client = wallet({ id: 'request-1', status: 'LIGHTNING_PAYMENT_FAILED' });
  await assert.rejects(payPreparedSparkPayment(client, await prepare(client), nativeLifecycle(journal, async () => {})), /network reported.*failed/);
  const saved = await journal.get(paymentHash);
  assert.equal(saved.state, 'failed');
  assert.equal(saved.requestId, 'request-1');
});

test('a late old-session Lightning result updates only its scoped journal, not new local activity', async () => {
  const journal = createLightningPaymentJournal(storage());
  const indexed = [];
  let current = true;
  const lifecycle = nativeLifecycle(journal, async (...args) => { indexed.push(args[3].status); },
    () => { if (!current) throw new Error('Wallet changed.'); });
  await lifecycle.onPending({ invoice: { paymentHash }, amountSats: 20 });
  await flush();
  current = false;
  await lifecycle.onResolved(paymentHash, 'confirmed', 'PREIMAGE_VERIFIED', 'request-1');
  assert.equal((await journal.get(paymentHash)).state, 'confirmed');
  assert.deepEqual(indexed, ['pending']);
});
