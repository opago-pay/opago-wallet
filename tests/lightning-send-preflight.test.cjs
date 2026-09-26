'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { authorizeAndPayPreparedSparkPayment, payPreparedSparkPayment, prepareDecodedSparkPayment, LightningPaymentPendingError } = require('../lib/payments.ts');
const { createLightningPaymentJournal: createScopedLightningPaymentJournal } = require('../lib/lightning/payment-journal.ts');
const createLightningPaymentJournal = storage => createScopedLightningPaymentJournal(storage, 'REGTEST:' + 'a'.repeat(64));
const { WalletSession } = require('../lib/wallet-session.ts');
const preimage = '00'.repeat(32);
const paymentHash = '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925';
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function payment() {
  return { invoice: { invoice: 'synthetic-validated-invoice', paymentHash, amountSats: 20, expiresAt: Date.now() + 60_000 },
    amountSats: 20, maxFeeSats: 2, estimatedFeeSats: 2 };
}
function journalFixture() {
  const data = new Map();
  const disk = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); }, removeItem: async key => { data.delete(key); } };
  const journal = createLightningPaymentJournal(disk);
  const lifecycle = {
    onPending: value => journal.recordPending(value.invoice.paymentHash, value.amountSats),
    onRequestIdentified: (...args) => journal.recordRequestId(...args),
    onResolved: (...args) => journal.recordResolved(...args),
  };
  return { disk, journal, lifecycle };
}
function wallet(overrides = {}) {
  return { getBalance: async () => ({ balance: 100 }), payLightningInvoice: async () => ({ id: 'request-1', preimage }), ...overrides };
}

test('Bitcoin preparation and submission use fresh Bitcoin-only reads, never the display or token balance', async () => {
  let reads = 0;
  const client = wallet({
    getBalance: async () => assert.fail('Token lookup must not block Bitcoin'),
    getCachedBalance: async () => assert.fail('Display cache must not authorize spending'),
    getBitcoinBalance: async () => { reads++; return { balance: 999, satsBalance: { available: 22, owned: 999 } }; },
    getLightningSendFeeEstimate: async () => 2,
  });
  const approved = await prepareDecodedSparkPayment(client, payment().invoice);
  assert.equal(reads, 1);
  await payPreparedSparkPayment(client, approved);
  assert.equal(reads, 2);
  client.getBitcoinBalance = async () => ({ balance: 999, satsBalance: { available: 21, owned: 999 } });
  client.payLightningInvoice = async () => assert.fail('Reserved funds cannot be sent');
  await assert.rejects(payPreparedSparkPayment(client, approved), /Insufficient balance/);
});

test('balance lookup and PIN run together, but no journal or submission occurs before successful PIN', async () => {
  const prompt = deferred();
  const balance = deferred();
  const { journal, lifecycle } = journalFixture();
  const events = [];
  const client = wallet({
    getBitcoinBalance: () => { events.push('balance'); return balance.promise; },
    payLightningInvoice: async () => {
      assert.equal((await journal.get(paymentHash)).state, 'pending');
      events.push('submit'); return { preimage };
    },
  });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => { events.push('PIN'); return prompt.promise; }, lifecycle);
  assert.deepEqual(events, ['balance', 'PIN']);
  balance.resolve({ balance: 22 });
  await flush();
  assert.deepEqual(await journal.list(), []);
  assert.equal(events.includes('submit'), false);
  prompt.resolve(() => {});
  assert.equal((await sending).proof, preimage);
  assert.deepEqual(events, ['balance', 'PIN', 'submit']);
});

test('successful PIN still waits for a delayed balance and aborts safely if funds are insufficient', async () => {
  const balance = deferred();
  const { journal, lifecycle } = journalFixture();
  const client = wallet({ getBitcoinBalance: () => balance.promise, payLightningInvoice: async () => assert.fail('Must not send') });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), async () => () => {}, lifecycle);
  const rejection = assert.rejects(sending, /Insufficient balance/);
  await flush();
  assert.deepEqual(await journal.list(), []);
  balance.resolve({ balance: 21 });
  await rejection;
  assert.deepEqual(await journal.list(), []);
});

test('cancelled PIN leaves no journal even when the balance lookup fails later', async () => {
  const balance = deferred();
  const { journal, lifecycle } = journalFixture();
  const client = wallet({ getBitcoinBalance: () => balance.promise, payLightningInvoice: async () => assert.fail('Cancelled') });
  await assert.rejects(authorizeAndPayPreparedSparkPayment(client, payment(), async () => { throw Error('PIN cancelled'); }, lifecycle), /PIN cancelled/);
  balance.reject(Error('Network unavailable'));
  await flush();
  assert.deepEqual(await journal.list(), []);
});

test('a failed preflight is observed after approval without submitting or recording a payment', async () => {
  const prompt = deferred();
  const { journal, lifecycle } = journalFixture();
  const client = wallet({ getBitcoinBalance: async () => { throw Error('Balance unavailable'); }, payLightningInvoice: async () => assert.fail('Must not send') });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => prompt.promise, lifecycle);
  const rejection = assert.rejects(sending, /Balance unavailable/);
  await flush();
  assert.deepEqual(await journal.list(), []);
  prompt.resolve(() => {});
  await rejection;
  assert.deepEqual(await journal.list(), []);
});

test('a long PIN prompt refreshes the expired balance instead of spending from old preparation', async () => {
  const prompt = deferred();
  const now = Date.now;
  let time = now(), reads = 0;
  Date.now = () => time;
  const { journal, lifecycle } = journalFixture();
  try {
    const client = wallet({
      getBitcoinBalance: async () => ({ balance: ++reads === 1 ? 100 : 21 }),
      payLightningInvoice: async () => assert.fail('Funds spent while entering PIN'),
    });
    const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => prompt.promise, lifecycle);
    const rejection = assert.rejects(sending, /Insufficient balance/);
    await flush(); time += 5_001;
    prompt.resolve(() => {});
    await rejection;
    assert.equal(reads, 2);
    assert.deepEqual(await journal.list(), []);
  } finally { Date.now = now; }
});

test('a long PIN prompt refreshes before approval, avoiding a new post-approval read', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const prompt = deferred(); let reads = 0, submits = 0;
  const { journal, lifecycle } = journalFixture();
  const client = wallet({
    getBitcoinBalance: async () => { reads++; return { balance: 22 }; },
    payLightningInvoice: async () => { submits++; return { preimage }; },
  });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => prompt.promise, lifecycle);
  await flush();
  t.mock.timers.tick(2500); await flush();
  assert.equal(reads, 2); assert.equal(submits, 0); assert.deepEqual(await journal.list(), []);
  t.mock.timers.tick(2500); await flush();
  t.mock.timers.tick(2100); await flush();
  assert.equal(reads, 3);
  prompt.resolve(() => {}); await sending;
  assert.equal(reads, 3); assert.equal(submits, 1);
  t.mock.timers.tick(10000); await flush(); assert.equal(reads, 3);
});

test('cancel during a refresh stops further reads and cannot resurrect a late result', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const prompt = deferred(), refresh = deferred(); let reads = 0;
  const { journal, lifecycle } = journalFixture();
  const client = wallet({
    getBitcoinBalance: () => ++reads === 1 ? Promise.resolve({ balance: 22 }) : refresh.promise,
    payLightningInvoice: async () => assert.fail('Cancelled prompt'),
  });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => prompt.promise, lifecycle);
  const rejected = assert.rejects(sending, /Cancelled/);
  await flush(); t.mock.timers.tick(2500); await flush(); assert.equal(reads, 2);
  prompt.reject(Error('Cancelled')); await rejected;
  refresh.reject(Error('Late read failure')); await flush();
  t.mock.timers.tick(10000); await flush();
  assert.equal(reads, 2); assert.deepEqual(await journal.list(), []);
});

test('refresh failure or decreased funds supersede a previously sufficient balance', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  for (const failure of [false, true]) {
    const prompt = deferred(); let reads = 0;
    const { journal, lifecycle } = journalFixture();
    const client = wallet({
      getBitcoinBalance: async () => {
        if (++reads === 1) return { balance: 100 };
        if (failure) throw Error('Refresh unavailable');
        return { balance: 21 };
      },
      payLightningInvoice: async () => assert.fail('Cannot use old balance'),
    });
    const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => prompt.promise, lifecycle);
    const rejected = assert.rejects(sending, failure ? /Refresh unavailable/ : /Insufficient balance/);
    await flush(); t.mock.timers.tick(2500); await flush();
    prompt.resolve(() => {}); await rejected;
    assert.equal(reads, 2); assert.deepEqual(await journal.list(), []);
  }
});

test('approval waits for an in-flight refresh rather than trusting the older balance', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const prompt = deferred(), refresh = deferred(); let reads = 0;
  const { journal, lifecycle } = journalFixture();
  const client = wallet({
    getBitcoinBalance: () => ++reads === 1 ? Promise.resolve({ balance: 100 }) : refresh.promise,
    payLightningInvoice: async () => assert.fail('Funds changed during prompt'),
  });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => prompt.promise, lifecycle);
  const rejected = assert.rejects(sending, /Insufficient balance/);
  await flush(); t.mock.timers.tick(2500); await flush();
  t.mock.timers.tick(4000); await flush(); assert.equal(reads, 2); // no overlapping queries
  prompt.resolve(() => {}); await flush(); assert.deepEqual(await journal.list(), []);
  refresh.resolve({ balance: 21 }); await rejected;
  t.mock.timers.tick(10000); await flush(); assert.equal(reads, 2);
});

test('bounded PIN refreshes stop after six and the final five-second freshness guard remains', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const prompt = deferred(); let reads = 0;
  const client = wallet({ getBitcoinBalance: async () => { reads++; return { balance: 22 }; } });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => prompt.promise);
  await flush();
  for (let index = 0; index < 10; index++) { t.mock.timers.tick(2500); await flush(); }
  assert.equal(reads, 7); // initial read + six refreshes
  prompt.resolve(() => {}); await sending;
  assert.equal(reads, 8); // bounded refresh ended; old data still cannot approve spending
});

test('invalidated review stops scheduled reads and the final authorization gate still rejects', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const prompt = deferred(); let active = true, reads = 0;
  const client = wallet({ getBitcoinBalance: async () => { reads++; return { balance: 22 }; },
    payLightningInvoice: async () => assert.fail('Old review') });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => prompt.promise, undefined,
    () => { if (!active) throw Error('Review invalidated'); });
  const rejected = assert.rejects(sending, /Review invalidated/);
  await flush(); active = false;
  t.mock.timers.tick(2500); await flush(); assert.equal(reads, 1);
  prompt.resolve(() => {}); await rejected;
});

test('locking during PIN stops refreshes even before navigation cleans up the review', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const session = new WalletSession(); session.unlock();
  const assertPreparation = session.captureRuntime();
  const nativePrompt = session.beginDeviceAuthentication(true);
  session.handleAppState('background'); // Android device credential activity
  const prompt = deferred(); let reads = 0;
  const client = wallet({ getBitcoinBalance: async () => { reads++; return { balance: 22 }; },
    payLightningInvoice: async () => assert.fail('Locked session') });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => prompt.promise, undefined, assertPreparation);
  const rejected = assert.rejects(sending, /locked/);
  await flush(); t.mock.timers.tick(2500); await flush(); assert.equal(reads, 2);
  session.lock(); session.handleAppState('active'); session.unlock();
  t.mock.timers.tick(2500); await flush(); assert.equal(reads, 2);
  prompt.resolve(() => {}); await rejected; nativePrompt.cancel();
});

test('lock/re-unlock while a balance read is pending cannot reuse the earlier payment approval', async () => {
  const session = new WalletSession(); session.unlock();
  const balance = deferred();
  const { journal, lifecycle } = journalFixture();
  const client = wallet({ getBitcoinBalance: () => balance.promise, payLightningInvoice: async () => assert.fail('Old session') });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), async () => session.capture(), lifecycle);
  const rejection = assert.rejects(sending, /locked/);
  await flush(); session.lock(); session.unlock(); balance.resolve({ balance: 100 });
  await rejection;
  assert.deepEqual(await journal.list(), []);
});

test('navigation invalidation and failed initial session guards prevent submission', async () => {
  const prompt = deferred(); let active = true;
  const { journal, lifecycle } = journalFixture();
  const client = wallet({ payLightningInvoice: async () => assert.fail('Old review') });
  const sending = authorizeAndPayPreparedSparkPayment(client, payment(), () => prompt.promise, lifecycle, () => {
    if (!active) throw Error('Review cancelled');
  });
  const rejection = assert.rejects(sending, /Review cancelled/);
  active = false; prompt.resolve(() => {}); await rejection;
  assert.deepEqual(await journal.list(), []);
  client.getBitcoinBalance = async () => assert.fail('Do not read a closed wallet');
  await assert.rejects(authorizeAndPayPreparedSparkPayment(client, payment(), async () => assert.fail('No prompt'), lifecycle, () => { throw Error('Closed'); }), /Closed/);
});

test('expiry while entering PIN prevents submission and review values cannot be mutated mid-authorization', async () => {
  const prompt = deferred();
  let submitted;
  const approved = payment();
  const client = wallet({ payLightningInvoice: async value => { submitted = value; return { preimage }; } });
  const sending = authorizeAndPayPreparedSparkPayment(client, approved, () => prompt.promise);
  approved.amountSats = 999; approved.maxFeeSats = 99; approved.invoice.invoice = 'changed';
  prompt.resolve(() => {}); assert.equal((await sending).amountSats, 20);
  assert.equal(submitted.maxFeeSats, 2); assert.equal(submitted.invoice, 'synthetic-validated-invoice');
  const expired = payment(); const now = Date.now;
  try {
    await assert.rejects(authorizeAndPayPreparedSparkPayment(client, expired, async () => {
      Date.now = () => expired.invoice.expiresAt + 1;
      return () => {};
    }), /expired/);
  } finally { Date.now = now; }
});

test('PIN completion still requires durable pending state, and parallel attempts retain the duplicate guard', async () => {
  const { journal, lifecycle } = journalFixture(); const network = deferred(); let submits = 0;
  const client = wallet({ payLightningInvoice: async () => { submits++; return network.promise; } });
  const approved = payment();
  const first = authorizeAndPayPreparedSparkPayment(client, approved, async () => () => {}, lifecycle);
  await flush();
  await assert.rejects(authorizeAndPayPreparedSparkPayment(client, approved, async () => () => {}, lifecycle), LightningPaymentPendingError);
  network.resolve({ preimage }); await first;
  assert.equal(submits, 1); assert.equal((await journal.get(paymentHash)).state, 'confirmed');
  const failedJournal = { onPending: async () => { throw Error('Disk unavailable'); } };
  await assert.rejects(authorizeAndPayPreparedSparkPayment(client, approved, async () => () => {}, failedJournal), /Disk unavailable/);
  assert.equal(submits, 1);
});
