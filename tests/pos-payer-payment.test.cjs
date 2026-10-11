'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const { bech32 } = require('bech32');
const { isOpagoPosPaymentUrl, assertNotOpagoPosPayment, OpagoPosPayerUnavailableError,
  POS_PAYER_PENDING_MESSAGE } = require('../lib/opago/pos-payment.ts');
const { recognizePayment } = require('../lib/payment-recognition.ts');
const { resolveLightningDestination } = require('../lib/lightning-destination.ts');
const { resolveLNURL, fetchInvoiceFromLNURLP, validateLNURLResponse } = require('../lib/lnurl-safe.ts');
const { loadPaymentEndpoint } = require('../lib/payment-endpoint.ts');
const { fetchOcpOptions, fetchOcpExecutionPayload } = require('../lib/ocp-safe.ts');
const { friendlyPaymentMessage } = require('../lib/payment-errors.ts');
const { translate } = require('../lib/i18n/index.ts');
const { invoice } = require('./lightning-invoice-fixture.cjs');
const discovery = 'https://api.opago.com/lnpos/api/v1/lnurl/pos-a?p=synthetic-encrypted-sale';
const callback = 'https://api.opago.com/lnpos/api/v1/lnurl/cb/0123456789abcdef0123456789abcdef?attempt=synthetic-attempt';
const encode = url => bech32.encode('lnurl', bech32.toWords(Buffer.from(url)), 16384);
const info = { tag: 'payRequest', minSendable: 20000, maxSendable: 20000, callback,
  metadata: '[["text/plain","Synthetic sale"]]' };
const pending = error => error instanceof OpagoPosPayerUnavailableError &&
  error.code === 'opago_pos_payer_unavailable' && error.message === POS_PAYER_PENDING_MESSAGE;

test('real scan and destination resolution stop OPAGO POS before discovery or invoice, including long app payloads', async t => {
  let requests = 0;
  t.mock.method(global, 'fetch', async () => { requests++; throw Error('unexpected request'); });
  const long = encode(discovery + 'x'.repeat(1800));
  assert.ok(long.length > 2000, 'the app payload can exceed the ordinary decoder limit');
  for (const input of [discovery, encode(discovery), 'lightning:' + encode(discovery).toUpperCase(),
    'LIGHTNING://' + encode(discovery), 'lightnings://' + encode(discovery), long,
    'bitcoin:?lightning=' + encodeURIComponent(encode(discovery)), discovery + '&lightning=' + invoice(20)]) {
    assert.throws(() => assertNotOpagoPosPayment(input), pending);
    await assert.rejects(recognizePayment(input), pending);
    await assert.rejects(resolveLightningDestination(input, 20, { ...info, callback: 'https://merchant.example/pay' }), pending);
  }
  assert.equal(requests, 0, 'P01 is a mutation; do not even register a sale');
});

test('direct LNURL, cached endpoint, callback and OCP entry points cannot bypass the closed payer path', async t => {
  let requests = 0;
  t.mock.method(global, 'fetch', async () => { requests++; throw Error('unexpected request'); });
  const quote = { merchantName: 'Synthetic', fiatAmount: 1, fiatCurrency: 'EUR', quoteId: 'synthetic',
    expiresAt: Date.now() + 10000, transferAmounts: [] };
  const option = { asset: 'SAT', chain: 'lightning', amount: 20, fee: 0, method: 'lightning' };
  for (const run of [() => resolveLNURL(encode(discovery)), () => loadPaymentEndpoint(discovery),
    () => loadPaymentEndpoint(discovery), () => fetchInvoiceFromLNURLP(info, 20),
    () => fetchInvoiceFromLNURLP({ ...info, callback: callback + '&payerdata=synthetic-private-data' }, 20),
    () => fetchOcpOptions(discovery), () => fetchOcpExecutionPayload(callback, quote, option)]) {
    await assert.rejects(run(), pending);
  }
  assert.throws(() => validateLNURLResponse(info), pending);
  assert.equal(requests, 0);
});

test('an ordinary discovery pointing at OPAGO P02 cannot be cached or followed anonymously', async t => {
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push([String(url), options]);
    return new Response(JSON.stringify(info), { headers: { 'content-type': 'application/json' } });
  });
  await assert.rejects(recognizePayment(encode('https://merchant.example/pos-payer-test')), pending);
  await assert.rejects(resolveLightningDestination('payer-test@merchant.example', 20), pending);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(([url, options]) => new URL(url).hostname === 'merchant.example' &&
    !new Headers(options.headers).has('authorization')));
});

test('known and configured POS hosts stay closed across disabled F3, malformed and legacy requests', t => {
  const saved = { api: process.env.EXPO_PUBLIC_OPAGO_F3_API_ORIGIN, address: process.env.EXPO_PUBLIC_OPAGO_F3_ADDRESS_ORIGIN };
  t.after(() => {
    for (const [name, value] of [['EXPO_PUBLIC_OPAGO_F3_API_ORIGIN', saved.api], ['EXPO_PUBLIC_OPAGO_F3_ADDRESS_ORIGIN', saved.address]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  process.env.EXPO_PUBLIC_OPAGO_F3_API_ORIGIN = 'https://pos-staging.example';
  process.env.EXPO_PUBLIC_OPAGO_F3_ADDRESS_ORIGIN = 'https://address-staging.example';
  for (const url of [discovery.replace('api.opago.com', 'pos-staging.example'),
    discovery.replace('api.opago.com', 'api.opago-pay.com'),
    discovery.replace('api.opago.com', 'address-staging.example'), discovery.replace('api.opago.com', 'API.OPAGO.COM.'),
    discovery.replace('https:', 'http:'), discovery.replace('api.opago.com', 'api.opago.com:8443'),
    discovery.replace('/lnpos/api/v1', '/opago-pos/api/v2'), discovery.replace('/lnpos/', '/%6cnpos/'),
    discovery.replace('/lnpos/', '//lnpos/'), discovery.replace('pos-a?p=synthetic-encrypted-sale', '%GG'),
    callback, discovery.split('?')[0]]) {
    assert.equal(isOpagoPosPaymentUrl(url), true, url);
  }
  for (const url of [discovery.replace('api.opago.com', 'api.opago.com.attacker.example'),
    discovery.replace('api.opago.com', 'api.opago.com@attacker.example'),
    discovery.replace('api.opago.com', 'attacker.example'), 'https://api.opago.com/.well-known/lnurlp/customer',
    'https://api.opago.com/lnurlp/cb/context', 'https://api.opago.com/lnpos/api/v1/lnurl-other', 'not-a-url']) {
    assert.equal(isOpagoPosPaymentUrl(url), false, url);
  }
});

test('ordinary external Lightning including similarly named hosts keeps its anonymous payment contract', async t => {
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push([String(url), options]);
    return new Response(JSON.stringify(String(url).includes('/cb/') ? { pr: invoice(20) } :
      { ...info, callback: callback.replace('api.opago.com', 'other-merchant.example') }),
    { headers: { 'content-type': 'application/json' } });
  });
  const result = await resolveLightningDestination(encode(discovery.replace('api.opago.com', 'other-merchant.example')));
  assert.equal(result.kind, 'invoice');
  assert.equal(result.amountSats, 20);
  assert.equal(requests.length, 2);
  for (const [url, options] of requests) {
    assert.equal(new Headers(options.headers).has('authorization'), false);
    assert.equal(/payerdata|proof|bearer|token/i.test(url), false);
  }
  assert.equal((await recognizePayment(invoice(20))).kind, 'lightning');
  assert.equal((await recognizePayment('0.0.123')).kind, 'hedera');
});

test('POS refusal is local, translated and contains no QR, identity, account or callback material', () => {
  const error = new OpagoPosPayerUnavailableError();
  assert.equal(friendlyPaymentMessage(error), POS_PAYER_PENDING_MESSAGE);
  assert.equal(/https:|synthetic-|payerdata|attempt=/.test(error.message), false);
  for (const language of ['de', 'fr', 'es', 'it']) {
    assert.notEqual(translate(language, error.message), error.message);
  }
});
