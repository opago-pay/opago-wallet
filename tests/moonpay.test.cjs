'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function client(fetchJson = async () => { throw new Error('offline'); }, backend = 'https://api.opago.example') {
  const file = path.join(__dirname, '..', 'lib', 'moonpay.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === './config') return {
      appConfig: { moonPayBackendUrl: backend },
      assertSafeRemoteUrl: raw => new URL(raw),
    };
    if (name === './http') return { fetchJson };
    throw new Error('Unexpected dependency: ' + name);
  }, exports);
  return exports;
}

const valid = {
  enabled: true, environment: 'sandbox', publicApiKey: 'pk_test_example123',
  assets: [
    { asset: 'BTC', network: 'bitcoin', moonpayCurrencyCode: 'btc' },
    { asset: 'HBAR', network: 'hedera', moonpayCurrencyCode: 'hbar' },
  ], fiatCurrencies: ['EUR'], redirectUrl: 'https://opago.example/moonpay/return',
};
const expected = {
  environment: 'sandbox', apiKey: valid.publicApiKey, currencyCode: 'btc',
  walletAddress: 'bc1qexample', eurAmount: '100', redirectUrl: valid.redirectUrl,
};
function checkoutUrl() {
  const url = new URL('https://buy-sandbox.moonpay.com/');
  url.searchParams.set('apiKey', expected.apiKey);
  url.searchParams.set('currencyCode', expected.currencyCode);
  url.searchParams.set('walletAddress', expected.walletAddress);
  url.searchParams.set('baseCurrencyCode', 'eur');
  url.searchParams.set('baseCurrencyAmount', expected.eurAmount);
  url.searchParams.set('redirectURL', expected.redirectUrl);
  return url;
}

test('MoonPay config allows only the contracted assets, fiat, environment and key', () => {
  const api = client();
  assert.equal(api.validateMoonPayConfig({ enabled: false, reason: 'not_configured' }), null);
  assert.deepEqual(api.validateMoonPayConfig(valid).assets.map(item => item.asset), ['BTC', 'HBAR']);
  assert.throws(() => api.validateMoonPayConfig({ ...valid, publicApiKey: 'pk_live_example123' }), /key and environment/);
  assert.throws(() => api.validateMoonPayConfig({ ...valid, assets: [{ asset: 'BTC', network: 'lightning', moonpayCurrencyCode: 'btc' }] }), /Unsupported/);
  assert.throws(() => api.validateMoonPayConfig({ ...valid, fiatCurrencies: ['USD'] }), /Invalid/);
  assert.throws(() => api.validateMoonPayConfig({ ...valid, redirectUrl: 'opago://return' }));
  assert.equal(api.parseMoonPayEurAmount('100'), '100');
  for (const invalid of ['0', '10.5', '-2', '1e4', '9007199254740992']) assert.equal(api.parseMoonPayEurAmount(invalid), null);
});

test('MoonPay checkout refuses a changed address, amount, origin or unsigned browser URL', () => {
  const api = client();
  const url = checkoutUrl();
  api.assertMoonPayCheckoutUrl(url.toString(), expected);
  for (const [key, value] of [['walletAddress', 'other'], ['baseCurrencyAmount', '200'], ['currencyCode', 'hbar']]) {
    const changed = new URL(url);
    changed.searchParams.set(key, value);
    assert.throws(() => api.assertMoonPayCheckoutUrl(changed.toString(), expected), /changed/);
  }
  assert.throws(() => api.assertMoonPayCheckoutUrl(url.toString().replace('buy-sandbox', 'buy'), expected), /changed/);
  assert.throws(() => api.assertMoonPayCheckoutUrl(url.toString().replace('.com/', '.com/swaps'), expected), /changed/);
  const signed = new URL(url);
  const signature = 'A'.repeat(43) + '=';
  signed.searchParams.set('signature', signature);
  api.assertMoonPayCheckoutUrl(signed.toString(), { ...expected, signed: true });
  api.assertSignedMoonPayCheckout(url.toString(), signed.toString(), signature);
  assert.throws(() => api.assertMoonPayCheckoutUrl(url.toString(), { ...expected, signed: true }), /changed/);
  signed.searchParams.set('walletAddress', 'other');
  assert.throws(() => api.assertSignedMoonPayCheckout(url.toString(), signed.toString(), signature), /changed/);
});

test('MoonPay client sends the exact SDK URL for backend signing and rejects malformed signatures', async () => {
  const calls = [];
  const api = client(async (url, init, options) => {
    calls.push({ url, init, options });
    return { signature: 'A'.repeat(43) + '=' };
  });
  const unsigned = checkoutUrl().toString();
  assert.equal(await api.signMoonPayCheckout(unsigned), 'A'.repeat(43) + '=');
  assert.equal(calls[0].url, 'https://api.opago.example/api/moonpay/sign-checkout');
  assert.deepEqual(JSON.parse(calls[0].init.body), { unsignedUrl: unsigned });
  assert.equal(calls[0].options.timeoutMs, 10_000);
  const unavailable = client(undefined, '');
  await assert.rejects(unavailable.loadMoonPayConfig(), /not configured/);
  await assert.rejects(unavailable.signMoonPayCheckout(unsigned), /not configured/);
  const invalid = client(async () => ({ signature: 'url%2Bencoded' }));
  await assert.rejects(invalid.signMoonPayCheckout(unsigned), /Invalid MoonPay signature/);
  const timedOut = client(async () => { throw new Error('timed out'); });
  await assert.rejects(timedOut.signMoonPayCheckout(unsigned), /timed out/);
});

test('receive view never offers an amount for HBAR QR and buying stays unavailable', () => {
  const receive = fs.readFileSync(path.join(__dirname, '..', 'app', '(tabs)', 'receive.tsx'), 'utf8');
  const buy = fs.readFileSync(path.join(__dirname, '..', 'app', 'buy.tsx'), 'utf8');
  assert.match(receive, /network !== 'hedera' && amountEditorOpen && <View/);
  assert.match(receive, /network !== 'hedera' && !amountEditorOpen && <TouchableOpacity/);
  assert.match(receive, /\{t\('Amount \(optional\)'\)\}/);
  assert.match(receive, /buildHederaWalletQrValue\(hederaAccount\.accountId\)/);
  assert.match(buy, /t\('Coming soon'\)/);
  assert.doesNotMatch(buy, /MoonPayCheckout|loadMoonPayConfig|signMoonPayCheckout/);
});

test('browser-return notice is wallet scoped and is never treated as purchase proof', async () => {
  const file = path.join(__dirname, '..', 'lib', 'moonpay-return-native.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const values = new Map();
  const storage = { setItem: async (key, value) => values.set(key, value),
    getItem: async key => values.get(key) ?? null, removeItem: async key => values.delete(key) };
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === '@react-native-async-storage/async-storage') return storage;
    throw new Error(name);
  }, exports);
  await exports.markMoonPayBrowserOpened('wallet-one');
  assert.equal(await exports.hasMoonPayReturnNotice('wallet-one'), true);
  assert.equal(await exports.hasMoonPayReturnNotice('wallet-two'), false);
  assert.equal(await exports.consumeMoonPayReturnNotice('wallet-two'), false);
  await exports.markMoonPayBrowserOpened('wallet-one');
  assert.equal(await exports.consumeMoonPayReturnNotice('wallet-one'), true);
  assert.equal(await exports.consumeMoonPayReturnNotice('wallet-one'), false);
});
