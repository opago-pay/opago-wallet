'use strict';
const { Buffer } = require('node:buffer');
const assert = require('node:assert/strict');
const test = require('node:test');
const { bech32 } = require('bech32');
const { createHash } = require('node:crypto');
require('./register-typescript.cjs');
const { resolveLightningDestination } = require('../lib/lightning-destination.ts');
const { prepareSparkPayment } = require('../lib/payments.ts');
const { friendlyPaymentMessage } = require('../lib/payment-errors.ts');
const { t } = require('../lib/i18n/index.ts');

const { invoice } = require('./lightning-invoice-fixture.cjs');

async function withEndpoint(run, overrides = {}, callbackInvoice) {
  const endpoint = 'https://wallet.example/.well-known/lnurlp/recipient';
  const lnurl = bech32.encode('lnurl', bech32.toWords(Buffer.from(endpoint)), 2000).toUpperCase();
  const requests = [];
  const previousFetch = global.fetch;
  global.fetch = async rawUrl => {
    const url = new URL(rawUrl);
    requests.push(url);
    if (url.hostname === 'wallet.example') return new Response(JSON.stringify({
      tag: 'payRequest', minSendable: 1000, maxSendable: 100_000_000_000,
      callback: 'https://callback.example/pay', metadata: '[["text/plain","Payment"]]', ...overrides,
    }), { headers: { 'content-type': 'application/json' } });
    assert.equal(url.hostname, 'callback.example');
    return new Response(JSON.stringify({ pr: callbackInvoice ?? invoice(Number(url.searchParams.get('amount')) / 1000) }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  try { await run({ lnurl, requests }); } finally { global.fetch = previousFetch; }
}

test('LNURL h-tags commit to the exact original metadata and review names the endpoint', async () => {
  const metadata = '[["text/plain", "Café 🟡"]]';
  const descriptionHash = createHash('sha256').update(metadata).digest('hex');
  await withEndpoint(async ({ lnurl }) => {
    const resolved = await resolveLightningDestination(lnurl, 20);
    assert.equal(resolved.recipientLabel, 'wallet.example\nCafé 🟡');
  }, { metadata }, invoice(20, undefined, { descriptionHash }));
  await withEndpoint(async ({ lnurl }) => {
    await assert.rejects(resolveLightningDestination(lnurl, 20), /metadata commitment/);
  }, {}, invoice(20, undefined, { descriptionHash }));
});

test('malformed LNURL metadata is rejected before the invoice callback', async () => {
  for (const metadata of [null, '{}', 'invalid', '[["text/plain",12]]', '[["image/png;base64","x"]]', '[["text/plain","a"],["text/plain","b"]]']) {
    await withEndpoint(async ({ lnurl, requests }) => {
      await assert.rejects(resolveLightningDestination(lnurl, 20), /invalid metadata/);
      assert.equal(requests.length, 1);
    }, { metadata });
  }
});

test('a reusable LNURL scan requests an amount without calling the invoice callback', async () => {
  await withEndpoint(async ({ lnurl, requests }) => {
    assert.deepEqual(await resolveLightningDestination(lnurl), {
      kind: 'amount-required', limits: { minSats: 1, maxSats: 100_000_000, recipient: 'wallet.example' },
    });
    assert.equal(requests.length, 1);
    assert.deepEqual(await resolveLightningDestination('LIGHTNING:' + lnurl), {
      kind: 'amount-required', limits: { minSats: 1, maxSats: 100_000_000, recipient: 'wallet.example' },
    });
    assert.equal(requests.length, 2);
  });
});

test('entering SAT after the scan obtains an exact invoice and prepares review without sending', async () => {
  await withEndpoint(async ({ lnurl, requests }) => {
    const resolved = await resolveLightningDestination(lnurl, 20);
    assert.equal(resolved.kind, 'invoice');
    assert.equal(resolved.amountSats, 20);
    assert.equal(requests[1].searchParams.get('amount'), '20000');
    let estimates = 0;
    const prepared = await prepareSparkPayment({
      getBalance: async () => ({ balance: 1000 }),
      getLightningSendFeeEstimate: async input => { estimates++; assert.equal(input.encodedInvoice, resolved.invoice); return 1; },
      payLightningInvoice: async () => assert.fail('Preparing a request must not submit a payment'),
    }, resolved.invoice, resolved.amountSats);
    assert.equal(estimates, 1);
    assert.equal(prepared.amountSats, 20);
    assert.equal(prepared.maxFeeSats, 1);
  });
});

test('Lightning addresses also wait for an amount, while fixed LNURLs prepare immediately', async () => {
  await withEndpoint(async ({ requests }) => {
    assert.equal((await resolveLightningDestination('recipient@wallet.example')).kind, 'amount-required');
    assert.equal(requests.length, 1);
  });
  await withEndpoint(async ({ lnurl }) => {
    const resolved = await resolveLightningDestination(lnurl);
    assert.equal(resolved.kind, 'invoice');
    assert.equal(resolved.amountSats, 21);
  }, { minSendable: 21_000, maxSendable: 21_000 });
});

test('amountless invoices wait for input and fixed invoices keep their requested amount', async () => {
  assert.deepEqual(await resolveLightningDestination(invoice(null)), {
    kind: 'amount-required', limits: { minSats: 1, maxSats: null },
  });
  assert.equal((await resolveLightningDestination(invoice(null), 20)).amountSats, 20);
  assert.equal((await resolveLightningDestination(invoice(21))).amountSats, 21);
  await assert.rejects(resolveLightningDestination(invoice(21), 20), /amount mismatch/);
  await assert.rejects(resolveLightningDestination(invoice(null, 1)), /expired/);
});

test('LNURL limits, fractional amounts and incorrect callback amounts fail before payment', async () => {
  await withEndpoint(async ({ lnurl, requests }) => {
    await assert.rejects(resolveLightningDestination(lnurl, 11), /between 1 and 10/);
    await assert.rejects(resolveLightningDestination(lnurl, 1.5), /whole numbers/);
    assert.ok(requests.every(url => url.hostname === 'wallet.example'));
  }, { maxSendable: 10_000 });
  for (const returned of [invoice(19), invoice(null)]) {
    await withEndpoint(async ({ lnurl }) => {
      await assert.rejects(resolveLightningDestination(lnurl, 20), /does not match/);
    }, {}, returned);
  }
  for (const limits of [{ minSendable: 1001, maxSendable: 1999 }, { maxSendable: Number.MAX_SAFE_INTEGER + 1 }]) {
    await withEndpoint(async ({ lnurl }) => {
      await assert.rejects(resolveLightningDestination(lnurl), /invalid payment limits/);
    }, limits);
  }
});

test('quotes over the build fee cap fail clearly without submitting a payment', async () => {
  const wallet = {
    getBalance: async () => ({ balance: 1000 }),
    getLightningSendFeeEstimate: async () => 101,
    payLightningInvoice: async () => assert.fail('An unaffordable quote must not submit a payment'),
  };
  await assert.rejects(prepareSparkPayment(wallet, invoice(20)), cause => {
    assert.equal(friendlyPaymentMessage(cause), t('The estimated network fee is {fee} SAT. This payment allows at most {max} SAT. Nothing was sent. Try again later or use a different payment request.', { fee: 101, max: 100 }));
    return true;
  });
  wallet.getLightningSendFeeEstimate = async () => { throw new Error('Private invoice in SDK response'); };
  await assert.rejects(prepareSparkPayment(wallet, invoice(20)), cause => {
    assert.equal(friendlyPaymentMessage(cause), t('The Lightning network could not provide a fee estimate. Nothing was sent. Please try again in a moment.'));
    assert.doesNotMatch(cause.message, /Private/);
    return true;
  });
  assert.equal(friendlyPaymentMessage(new Error('This LNURL requires an amount.')), t('Enter the amount you want to send.'));
  assert.equal(friendlyPaymentMessage(new Error('Amount must be between 1 and 10 SAT.')), t('Enter an amount between {min} and {max} SAT.', { min: 1, max: 10 }));
});
