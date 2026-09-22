'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { calculateMaxLightningFee } = require('../lib/lightning.ts');
const { prepareDecodedSparkPayment, payPreparedSparkPayment } = require('../lib/payments.ts');

const preimage = '00'.repeat(32);
const paymentHash = '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925';
const details = (amountSats = 20) => ({
  invoice: 'lnbcrt-decoded-test-fixture', amountSats, paymentHash, expiresAt: Date.now() + 60_000,
});

test('small payments use the reviewed quote instead of a percentage that rejects base fees', () => {
  assert.equal(calculateMaxLightningFee(20, 120, 2), 2);
  assert.equal(calculateMaxLightningFee(20, 22, 2), 2);
  assert.equal(calculateMaxLightningFee(20, 20, 0), 0);
  assert.equal(calculateMaxLightningFee(20, 120, 100), 100);
  assert.equal(calculateMaxLightningFee(1000, 1001, 1), 1);
  assert.throws(() => calculateMaxLightningFee(20, 21, 2), /Insufficient balance/);
  assert.throws(() => calculateMaxLightningFee(20, 1000, 101), /exceeds.*100 SAT/);
  for (const invalid of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => calculateMaxLightningFee(20, 120, invalid), /invalid Lightning fee estimate/);
  }
});

test('preparation only returns review data; submission retains exactly the approved fee ceiling', async () => {
  let submitted = 0;
  let quoteCalls = 0;
  let submittedRequest;
  const wallet = {
    getBalance: async () => ({ balance: 120 }),
    getLightningSendFeeEstimate: async () => { quoteCalls++; return 2; },
    payLightningInvoice: async request => { submitted++; submittedRequest = request; return { preimage }; },
  };
  const prepared = await prepareDecodedSparkPayment(wallet, details());
  assert.equal(submitted, 0);
  assert.equal(prepared.maxFeeSats, 2);
  assert.equal(prepared.estimatedFeeSats, 2);
  assert.equal(prepared.amountSats + prepared.maxFeeSats, 22);
  // A changed service quote must not silently expand an already reviewed budget.
  wallet.getLightningSendFeeEstimate = async () => 10;
  const result = await payPreparedSparkPayment(wallet, prepared, undefined, () => {});
  assert.equal(quoteCalls, 1);
  assert.equal(submitted, 1);
  assert.equal(submittedRequest.maxFeeSats, 2);
  assert.equal(submittedRequest.amountSatsToSend, undefined);
  assert.equal(result.amountSats, 20);
});

test('zero-fee and amountless invoices retain their exact reviewed amount and fee', async () => {
  let quoteRequest;
  let paymentRequest;
  const wallet = {
    getBalance: async () => ({ balance: 20 }),
    getLightningSendFeeEstimate: async input => { quoteRequest = input; return 0; },
    payLightningInvoice: async input => { paymentRequest = input; return { preimage }; },
  };
  const prepared = await prepareDecodedSparkPayment(wallet, details(null), 20);
  assert.equal(quoteRequest.amountSats, 20);
  assert.equal(prepared.maxFeeSats, 0);
  await payPreparedSparkPayment(wallet, prepared, undefined, () => {});
  assert.equal(paymentRequest.amountSatsToSend, 20);
  assert.equal(paymentRequest.maxFeeSats, 0);
});

test('insufficient total balance and malformed quotes never reach payment submission', async () => {
  for (const [balance, quote, expected] of [[21, 2, /Insufficient balance/], [120, 101, /exceeds/], [120, -1, /invalid/], [120, 1.5, /invalid/], [120, undefined, /invalid/]]) {
    await assert.rejects(prepareDecodedSparkPayment({
      getBalance: async () => ({ balance }),
      getLightningSendFeeEstimate: async () => quote,
      payLightningInvoice: async () => assert.fail('Invalid preparation must not submit'),
    }, details()), expected);
  }
  await assert.rejects(prepareDecodedSparkPayment({
    getBalance: async () => ({ balance: 19 }),
    getLightningSendFeeEstimate: async () => 2,
    payLightningInvoice: async () => assert.fail('Insufficient balance must not submit'),
  }, details()), /Insufficient Lightning balance/);
});

test('review starts balance and fee lookups together but waits for both before returning', async () => {
  let resolveBalance, resolveFee;
  const balance = new Promise(resolve => { resolveBalance = resolve; });
  const fee = new Promise(resolve => { resolveFee = resolve; });
  const started = [];
  let reviewed = false;
  const preparation = prepareDecodedSparkPayment({
    getBalance: () => { started.push('balance'); return balance; },
    getLightningSendFeeEstimate: () => { started.push('fee'); return fee; },
    payLightningInvoice: async () => assert.fail('Review must not send'),
  }, details()).then(value => { reviewed = true; return value; });
  assert.deepEqual(started, ['balance', 'fee']);
  resolveFee(2);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reviewed, false);
  resolveBalance({ balance: 22 });
  assert.equal((await preparation).maxFeeSats, 2);
});

test('a failed parallel lookup cannot produce review data and consumes the other rejection', async () => {
  let rejectFee;
  const fee = new Promise((resolve, reject) => { rejectFee = reject; });
  await assert.rejects(prepareDecodedSparkPayment({
    getBalance: async () => { throw new Error('Balance unavailable'); },
    getLightningSendFeeEstimate: () => fee,
    payLightningInvoice: async () => assert.fail('Failed review must not send'),
  }, details()), /Balance unavailable/);
  rejectFee(new Error('Private SDK invoice data'));
  await new Promise(resolve => setImmediate(resolve));
});

test('cancelling authorization still blocks the newly prepared fee budget before submission', async () => {
  const wallet = {
    getBalance: async () => ({ balance: 120 }),
    getLightningSendFeeEstimate: async () => 2,
    payLightningInvoice: async () => assert.fail('Cancelled authorization must not submit'),
  };
  const prepared = await prepareDecodedSparkPayment(wallet, details());
  await assert.rejects(payPreparedSparkPayment(wallet, prepared, undefined, () => { throw new Error('Wallet locked'); }), /Wallet locked/);
});
