'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { bech32 } = require('bech32');
require('./register-typescript.cjs');
const { invoice } = require('./lightning-invoice-fixture.cjs');
const { decodeLightningInvoice } = require('../lib/lightning.ts');
const { assertInvoiceSignature } = require('../lib/lightning/invoice-validation.ts');
const { payPreparedSparkPayment, prepareSparkPayment, LightningPaymentPendingError, LightningFeeChangedError, sparkTransferMatchesInvoice } = require('../lib/payments.ts');
const { createLightningPaymentJournal: createScopedLightningPaymentJournal } = require('../lib/lightning/payment-journal.ts');
const createLightningPaymentJournal = storage => createScopedLightningPaymentJournal(storage, 'REGTEST:' + 'a'.repeat(64));
const { createLightningReceiveStore } = require('../lib/lightning/receive-store.ts');
const { resolveLightningReceive } = require('../lib/lightning/receive-status.ts');
const { resolveLightningPaymentFromSpark } = require('../lib/lightning/spark-history.ts');
const paymentHash = '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925';
const preimage = '00'.repeat(32);
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function storage() {
  const values = new Map();
  return { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
}
function lifecycle(journal) {
  return {
    onPending: payment => journal.recordPending(payment.invoice.paymentHash, payment.amountSats),
    onRequestIdentified: (...args) => journal.recordRequestId(...args),
    onResolved: (...args) => journal.recordResolved(...args),
  };
}
function wallet(overrides = {}) {
  return { getBalance: async () => ({ balance: 100 }), getLightningSendFeeEstimate: async () => 2,
    payLightningInvoice: async () => ({ id: 'request-1', status: 'PREIMAGE_PROVIDED', paymentPreimage: preimage }), ...overrides };
}
const prepared = client => prepareSparkPayment(client, invoice(20, undefined, { paymentHash }));
const savedRequest = () => ({ requestId: 'request-1', paymentHash, amountSats: 20,
  invoice: invoice(20, undefined, { paymentHash }), expiresAt: Date.now() - 1, createdAt: new Date().toISOString() });

test('Mainnet and regtest invoice guards use the complete network prefix, including amountless invoices', () => {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/lightning.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const isMainnet of [false, true]) {
    const exports = {};
    new Function('require', 'exports', code)(name => name === './config' ? { appConfig: { isMainnet } } :
      name.startsWith('.') ? require(path.join(__dirname, '../lib', name + '.ts')) : require(name), exports);
    for (const amount of [null, 20]) {
      for (const network of ['bc', 'bcrt', 'tb', 'tbs']) {
        const encoded = invoice(amount, undefined, { network });
        if (network === (isMainnet ? 'bc' : 'bcrt')) assert.equal(exports.decodeLightningInvoice(encoded.toUpperCase()).amountSats, amount);
        else assert.throws(() => exports.decodeLightningInvoice(encoded), /only accepts/);
      }
    }
  }
});

test('BOLT11 default expiry is one hour, including invoices with no explicit x-tag', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  assert.equal(decodeLightningInvoice(invoice(20, timestamp, { expiry: false })).expiresAt, (timestamp + 3600) * 1000);
  assert.throws(() => decodeLightningInvoice(invoice(20, timestamp - 3601, { expiry: false })), /expired/);
});

test('invoice validation rejects altered signatures even with a recomputed Bech32 checksum', () => {
  const valid = invoice(20);
  assert.doesNotThrow(() => assertInvoiceSignature(valid));
  const { prefix, words } = bech32.decode(valid, 2000);
  words[words.length - 100] ^= 1;
  assert.throws(() => decodeLightningInvoice(bech32.encode(prefix, words, 2000)), /invalid signature/);
  assert.throws(() => decodeLightningInvoice(valid.slice(0, -1) + (valid.endsWith('q') ? 'p' : 'q')), /invalid/);
});

test('signature verification accepts the independent published light-bolt11-decoder vector with recovered payee', () => {
  const source = fs.readFileSync(path.join(__dirname, '../node_modules/light-bolt11-decoder/tests/basic.test.js'), 'utf8');
  const vector = source.match(/'(lnbc[0-9a-z]+)'/)[1];
  assert.doesNotThrow(() => assertInvoiceSignature(vector));
});

test('a balance spent after review cannot be sent and creates no pending attempt', async () => {
  const client = wallet({ payLightningInvoice: async () => assert.fail('Must not send') });
  const payment = await prepared(client);
  client.getBalance = async () => ({ balance: 21 });
  const journal = createLightningPaymentJournal(storage());
  await assert.rejects(payPreparedSparkPayment(client, payment, lifecycle(journal)), /Insufficient balance/);
  assert.equal(await journal.get(paymentHash), null);
});

test('unfinished read-only preflight leaves no submitted record after a simulated process restart', async () => {
  const disk = storage(); const journal = createLightningPaymentJournal(disk);
  const balance = deferred();
  const client = wallet({ payLightningInvoice: async () => assert.fail('No submission before preflight succeeds') });
  const payment = await prepared(client);
  client.getBalance = () => balance.promise;
  let cancelled = false;
  const sending = payPreparedSparkPayment(client, payment, lifecycle(journal), () => {
    if (cancelled) throw new Error('Wallet locked');
  });
  const rejection = assert.rejects(sending, /Wallet locked/);
  await flush();
  assert.deepEqual(await createLightningPaymentJournal(disk).list(), []);
  cancelled = true; balance.resolve({ balance: 100 }); await rejection;
  assert.deepEqual(await journal.list(), []);
});

test('a failed new preflight cannot release the guard of an older unknown submission', async () => {
  const journal = createLightningPaymentJournal(storage());
  await journal.recordPending(paymentHash, 20);
  const original = await journal.get(paymentHash);
  const client = wallet({ payLightningInvoice: async () => assert.fail('Must not resend') });
  const payment = await prepared(client);
  client.getBalance = async () => { throw new Error('offline'); };
  await assert.rejects(payPreparedSparkPayment(client, payment, lifecycle(journal)), /offline/);
  assert.deepEqual(await journal.get(paymentHash), original);
});

test('durable duplicate protection precedes the SDK call and persistence failure prevents sending', async () => {
  const disk = storage(); const journal = createLightningPaymentJournal(disk);
  const client = wallet({ payLightningInvoice: async () => {
    assert.equal((await createLightningPaymentJournal(disk).get(paymentHash)).state, 'pending');
    return { paymentPreimage: preimage };
  } });
  await payPreparedSparkPayment(client, await prepared(client), lifecycle(journal));
  client.payLightningInvoice = async () => assert.fail('Must not send when the journal write fails');
  await assert.rejects(payPreparedSparkPayment(client, await prepared(client), {
    onPending: async () => { throw new Error('disk unavailable'); },
  }), /disk unavailable/);
});

test('expiry during the pending write cancels only the recorded attempt before SDK submission', async () => {
  const journal = createLightningPaymentJournal(storage());
  const client = wallet({ payLightningInvoice: async () => assert.fail('Expired request must not send') });
  const payment = await prepared(client);
  const now = Date.now;
  const callbacks = lifecycle(journal);
  try {
    await assert.rejects(payPreparedSparkPayment(client, payment, { ...callbacks,
      onPending: async value => {
        await callbacks.onPending(value);
        Date.now = () => payment.invoice.expiresAt + 1;
      },
    }), /expired/);
    assert.equal((await journal.get(paymentHash)).result, 'CANCELLED_BEFORE_SUBMISSION');
  } finally { Date.now = now; }
});

test('a higher SDK quote is a definite pre-submit failure; a transport error never releases the pending guard', async () => {
  const message = 'maxFeeSats does not cover fee estimate [field: maxFeeSats, value: 2, expected: 3 sats]';
  for (const localValidation of [true, false]) {
    const error = new Error(message);
    if (localValidation) error.getContext = () => ({ field: 'maxFeeSats', value: 2, expected: '3 sats' });
    const journal = createLightningPaymentJournal(storage());
    const client = wallet({ payLightningInvoice: async () => { throw error; } });
    await assert.rejects(payPreparedSparkPayment(client, await prepared(client), lifecycle(journal)),
      localValidation ? LightningFeeChangedError : LightningPaymentPendingError);
    assert.equal((await journal.get(paymentHash)).state, localValidation ? 'failed' : 'pending');
  }
});

test('expiry is checked again after the asynchronous balance read', async () => {
  const client = wallet({ payLightningInvoice: async () => assert.fail('Expired request must not send') });
  const payment = await prepared(client);
  const now = Date.now;
  client.getBalance = async () => { Date.now = () => payment.invoice.expiresAt + 1; return { balance: 100 }; };
  try { await assert.rejects(payPreparedSparkPayment(client, payment), /expired/); }
  finally { Date.now = now; }
});

test('locking during the fresh balance read invalidates authorization before any SDK submission', async () => {
  const client = wallet({ payLightningInvoice: async () => assert.fail('Locked wallet must not send') });
  const payment = await prepared(client);
  let locked = false;
  client.getBalance = async () => { locked = true; return { balance: 100 }; };
  await assert.rejects(payPreparedSparkPayment(client, payment, undefined, () => { if (locked) throw new Error('Wallet locked'); }), /locked/);
});

test('parallel confirmation and a process restart cannot submit the same invoice twice', async () => {
  const pending = deferred(); let submissions = 0;
  const disk = storage();
  const journal = createLightningPaymentJournal(disk);
  const client = wallet({ payLightningInvoice: async () => { submissions++; return pending.promise; } });
  const payment = await prepared(client);
  const first = payPreparedSparkPayment(client, payment, lifecycle(journal));
  await flush();
  await assert.rejects(payPreparedSparkPayment(client, payment, lifecycle(journal)), LightningPaymentPendingError);
  const restarted = createLightningPaymentJournal(disk);
  await assert.rejects(payPreparedSparkPayment(client, payment, lifecycle(restarted)), LightningPaymentPendingError);
  pending.resolve({ paymentPreimage: preimage }); await first;
  assert.equal(submissions, 1);
});

test('unknown network outcomes and preimage/transfer failures stay pending, while matching proof wins', async () => {
  for (const status of ['PREIMAGE_PROVIDING_FAILED', 'TRANSFER_FAILED', 'USER_SWAP_RETURN_FAILED', 'FUTURE_VALUE']) {
    const journal = createLightningPaymentJournal(storage());
    const client = wallet({ payLightningInvoice: async () => ({ id: 'request-1', status }) });
    await assert.rejects(payPreparedSparkPayment(client, await prepared(client), lifecycle(journal)), LightningPaymentPendingError);
    assert.equal((await journal.get(paymentHash)).state, 'pending');
  }
  const client = wallet({ payLightningInvoice: async () => { throw new Error('connection lost'); } });
  const disk = storage(); const journal = createLightningPaymentJournal(disk);
  await assert.rejects(payPreparedSparkPayment(client, await prepared(client), lifecycle(journal)), LightningPaymentPendingError);
  assert.equal((await createLightningPaymentJournal(disk).get(paymentHash)).state, 'pending');
  client.payLightningInvoice = async () => ({ status: 'TRANSFER_FAILED', paymentPreimage: preimage });
  assert.equal((await payPreparedSparkPayment(client, await prepared(client))).paymentHash, paymentHash);
});

test('a send timeout stays pending and cannot be retried while the SDK may still settle', async t => {
  const pending = deferred(); const journal = createLightningPaymentJournal(storage());
  const client = wallet({ payLightningInvoice: () => pending.promise });
  const payment = await prepared(client);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sending = payPreparedSparkPayment(client, payment, lifecycle(journal));
  const rejected = assert.rejects(sending, LightningPaymentPendingError);
  await flush(); t.mock.timers.tick(45_001); await rejected;
  assert.equal((await journal.get(paymentHash)).state, 'pending');
  pending.resolve({ paymentPreimage: preimage }); await flush();
  await assert.rejects(journal.recordPending(paymentHash, 20), /already being processed/);
});

test('slow reconciliation does not block writes, and a stale failure never downgrades confirmed', async () => {
  const journal = createLightningPaymentJournal(storage());
  await journal.recordPending(paymentHash, 20);
  const slow = deferred();
  const reconciling = journal.reconcile(() => slow.promise); await flush();
  await journal.recordResolved(paymentHash, 'confirmed', 'PREIMAGE_VERIFIED');
  slow.resolve({ state: 'failed', result: 'LIGHTNING_PAYMENT_FAILED' }); await reconciling;
  await journal.recordResolved(paymentHash, 'failed', 'LIGHTNING_PAYMENT_FAILED');
  assert.equal((await journal.get(paymentHash)).state, 'confirmed');
});

test('clearing the journal during a network lookup cannot resurrect a previous wallet payment', async () => {
  const journal = createLightningPaymentJournal(storage()); await journal.recordPending(paymentHash, 20);
  const slow = deferred(); const reconciling = journal.reconcile(() => slow.promise); await flush();
  await journal.clear();
  slow.resolve({ state: 'confirmed', result: 'PREIMAGE_VERIFIED' });
  assert.deepEqual(await reconciling, []); assert.deepEqual(await journal.list(), []);
});

test('a direct send lookup for another payment cannot incorrectly mark this one failed', async () => {
  const record = { paymentHash, requestId: 'request-1' };
  const result = await resolveLightningPaymentFromSpark({
    getLightningSendRequest: async () => ({ id: 'request-1', idempotencyKey: 'opago-' + 'a'.repeat(64), status: 'LIGHTNING_PAYMENT_FAILED' }),
    getTransfers: async () => ({ transfers: [] }),
  }, record);
  assert.equal(result.state, 'pending');
});

test('receive restart preserves an expired invoice and still confirms payment made while the app was closed', async () => {
  const disk = storage(); const saved = savedRequest(); await createLightningReceiveStore(disk).save(saved);
  const restored = await createLightningReceiveStore(disk).load();
  const status = await resolveLightningReceive({
    getLightningReceiveRequest: async () => ({ id: saved.requestId, status: 'TRANSFER_COMPLETED', invoice: { paymentHash }, paymentPreimage: preimage }),
    getTransfers: async () => assert.fail('A verified direct result must not load full history'),
  }, restored);
  assert.equal(status, 'confirmed');
});

test('open Lightning receive stores zero request amount and confirms the actual paid SAT amount', async () => {
  const disk = storage();
  const open = { ...savedRequest(), amountSats: 0 };
  await createLightningReceiveStore(disk).save(open);
  assert.equal((await createLightningReceiveStore(disk).load()).amountSats, 0);
  const { resolveLightningReceiveOutcome } = require('../lib/lightning/receive-status.ts');
  const result = await resolveLightningReceiveOutcome({
    getLightningReceiveRequest: async () => ({
      id: open.requestId, status: 'TRANSFER_COMPLETED', invoice: { paymentHash }, paymentPreimage: preimage,
      transfer: { totalAmount: { originalValue: 34, originalUnit: 'SATOSHI' } },
    }),
    getTransfers: async () => assert.fail('The direct proof and amount are sufficient'),
  }, open);
  assert.deepEqual(result, { state: 'confirmed', amountSats: 34 });
});

test('pending receive polls use only the direct request, while a failed lookup falls back to history', async () => {
  const saved = savedRequest();
  assert.equal(await resolveLightningReceive({
    getLightningReceiveRequest: async () => ({ id: saved.requestId, status: 'INVOICE_CREATED', invoice: { paymentHash } }),
    getTransfers: async () => assert.fail('Waiting must not load history every poll'),
  }, saved), 'waiting');
  const transfer = { id: 'transfer', transferDirection: 'INCOMING', status: 'COMPLETED', totalValue: 20,
    userRequest: { invoice: { paymentHash }, paymentPreimage: preimage } };
  assert.equal(await resolveLightningReceive({
    getLightningReceiveRequest: async () => { throw new Error('offline'); },
    getTransfers: async () => ({ transfers: [transfer] }),
  }, saved), 'confirmed');
  assert.equal(sparkTransferMatchesInvoice({ ...transfer, status: 'NOT_COMPLETED', userRequest: { ...transfer.userRequest, status: 'UNPAID' } }, paymentHash, 20), false);
});

test('receive confirmation rejects a wrong proof and a late completion cannot clear a newer request', async () => {
  const disk = storage(); const store = createLightningReceiveStore(disk); const first = savedRequest();
  const second = { ...first, requestId: 'request-2' };
  await store.save(first); await store.save(second); await store.clear(first.requestId);
  assert.equal((await store.load()).requestId, second.requestId);
  assert.equal(await resolveLightningReceive({
    getLightningReceiveRequest: async () => ({ id: first.requestId, status: 'TRANSFER_COMPLETED', invoice: { paymentHash }, paymentPreimage: '01'.repeat(32) }),
    getTransfers: async () => ({ transfers: [] }),
  }, first), 'processing');
});
