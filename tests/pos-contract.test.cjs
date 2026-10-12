const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('./register-typescript.cjs');
const { parsePosOffer, preparePosAttempt } = require('../lib/opago/pos-contract.ts');
const { invoice } = require('./lightning-invoice-fixture.cjs');
const token = '0123456789abcdef0123456789abcdef';
const scan = 'https://api.opago.com/lnpos/api/v1/lnurl/pos-a?p=synthetic';
const callback = 'https://api.opago.com/lnpos/api/v1/lnurl/cb/' + token + '?attempt=' + token;
const metadata = '[["text/plain", "Synthetic sale"]]';
const profile = mandatory => ({ identifier: { mandatory }, compliance: { mandatory } });
const offer = { tag: 'payRequest', minSendable: 20000, maxSendable: 20000, callback, metadata, payerData: profile(true) };
const raw = '{ "identifier": "$synthetic@example.test", "compliance": { "signatureNonce": "' + token + '", "signature": "synthetic-not-a-real-proof" } }';
const digest = value => createHash('sha256').update(value).digest('hex');

test('P01 binds exact callback token, amount and metadata; P02 retains payerdata bytes on retry without bearer', () => {
  const parsed = parsePosOffer(scan, offer);
  assert.equal(parsed.attempt, token);
  assert.equal(parsed.metadata, metadata);
  const attempt = preparePosAttempt(parsed, raw);
  assert.deepEqual(attempt.request(), attempt.request());
  const request = attempt.request();
  const url = new URL(request.url);
  assert.equal(url.searchParams.get('payerdata'), raw);
  assert.equal(url.searchParams.get('payerData'), null);
  assert.equal(url.searchParams.get('amount'), '20000');
  assert.equal(url.searchParams.get('attempt'), url.pathname.split('/').at(-1));
  assert.equal(request.method, 'GET');
  assert.equal(new Headers(request.headers).get('authorization'), null);
  assert.equal(request.cache, 'no-store'); assert.equal(request.redirect, 'error');
  assert.equal(JSON.stringify(attempt), '{}');
  attempt.close(); assert.throws(() => attempt.request(), /attempt_closed/);
});
test('malformed or rebound P01 cannot become a payment attempt', () => {
  for (const patch of [{ minSendable: 0 }, { minSendable: 1 }, { maxSendable: 21000 }, { minSendable: Number.MAX_SAFE_INTEGER + 1 },
    { metadata: 'bad' }, { metadata: '[]' }, { payerData: {} }, { callback: callback + '&attempt=' + token },
    { callback: callback.replace(token, 'f'.repeat(32)) }, { callback: callback.replace('api.opago.com', 'attacker.example') },
    { callback: callback + '&payerdata=private-data' }, { callback: callback.replace('https:', 'http:') }])
    assert.throws(() => parsePosOffer(scan, { ...offer, ...patch }), /invalid_offer/);
  for (const input of [scan + '&p=other', scan + '&amount=1', scan.replace('/lnpos/', '/other/'), scan.replace('api.opago.com', 'attacker.example')])
    assert.throws(() => parsePosOffer(input, offer), /invalid_offer/);
});
test('payerdata omission follows the profile without claiming authorization, malformed evidence is sanitized', () => {
  assert.throws(() => preparePosAttempt(parsePosOffer(scan, offer)), /invalid_payerdata/);
  const optional = preparePosAttempt(parsePosOffer(scan, { ...offer, payerData: profile(false) }));
  assert.equal(new URL(optional.request().url).searchParams.has('payerdata'), false);
  for (const value of [raw.replace(token, 'f'.repeat(32)), 'private-response', '{}', raw + ' '.repeat(8192),
    raw.replace('synthetic-not-a-real-proof', 'ü'.repeat(1500))]) {
    assert.throws(() => preparePosAttempt(parsePosOffer(scan, offer), value), error =>
      error.code === 'invalid_payerdata' && !error.message.includes('private-response'));
  }
});
test('invoice checks bind signature, network, amount, metadata plus exact payerdata, expiry and stable invoice', () => {
  const attempt = preparePosAttempt(parsePosOffer(scan, offer), raw);
  const descriptionHash = digest(metadata + raw);
  const good = { pr: invoice(20, undefined, { descriptionHash }) };
  const checked = attempt.inspectInvoice(good);
  assert.equal(checked.recipientBindingVerified, false);
  assert.equal(checked.paymentEnabled, false);
  assert.deepEqual(attempt.inspectInvoice(good), checked);
  for (const pr of [invoice(21, undefined, { descriptionHash }), invoice(20),
    invoice(20, undefined, { network: 'bc', descriptionHash }), invoice(20, 1, { descriptionHash }),
    invoice(20, undefined, { descriptionHash: digest(metadata + JSON.stringify(JSON.parse(raw))) }),
    good.pr.slice(0, -1) + 'x']) assert.throws(() => attempt.inspectInvoice({ pr }), /invalid_invoice/);
  assert.throws(() => attempt.inspectInvoice({ pr: invoice(20, undefined, { descriptionHash, paymentHash: '08'.repeat(32) }) }), /invoice_changed/);
  attempt.close(); assert.throws(() => attempt.inspectInvoice(good), /attempt_closed/);
});
