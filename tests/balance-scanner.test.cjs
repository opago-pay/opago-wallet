'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { unknownBalance, loadedBalance, refreshingBalance, failedBalance, readSparkBalance } = require('../lib/balance-state.ts');
const { calculatePortfolioEur } = require('../lib/portfolio-valuation.ts');
const { scannerPermission } = require('../lib/scanner-permission.ts');
const { WalletSession } = require('../lib/wallet-session.ts');
const { PaymentScanInbox } = require('../lib/payment-scan.ts');

test('unknown or failed first balance is never interpreted as a zero or partial portfolio', () => {
  const loading = unknownBalance();
  assert.equal(loading.value, null);
  assert.equal(loading.status, 'loading');
  const failed = failedBalance(loading, new Error('Offline'));
  assert.equal(failed.value, null);
  assert.equal(failed.status, 'error');
  const rates = { btcToEur: 50_000, hbarToEur: 0.2 };
  assert.equal(calculatePortfolioEur({ sparkSats: null, hbarTinybars: 100_000_000n }, rates), null);
  assert.equal(calculatePortfolioEur({ sparkSats: 20, hbarTinybars: null }, rates), null);
  assert.equal(calculatePortfolioEur({ sparkSats: 0, hbarTinybars: 0n }, rates), 0);
});

test('refresh and offline failure retain the last known amount with an explicit state', () => {
  const previous = loadedBalance(4_250);
  const refreshing = refreshingBalance(previous);
  assert.equal(refreshing.value, 4_250);
  assert.equal(refreshing.status, 'loading');
  const failed = failedBalance(refreshing, new Error('Timeout'));
  assert.equal(failed.value, 4_250);
  assert.equal(failed.error, 'Timeout');
  assert.equal(loadedBalance(0).status, 'ready');
});

test('malformed Lightning balances cannot silently become zero', () => {
  assert.equal(readSparkBalance({ balance: 0n }), 0);
  assert.equal(readSparkBalance({ balance: 20n, satsBalance: { incoming: '5' } }), 25);
  for (const balance of [undefined, null, NaN, Infinity, -1, 1.2, '', 'invalid', true]) {
    assert.throws(() => readSparkBalance({ balance }), /invalid balance/);
  }
  assert.throws(() => readSparkBalance({ balance: Number.MAX_SAFE_INTEGER, satsBalance: { incoming: 1 } }), /invalid balance/);
});

test('an authorized scanner never calls Android permission request, even on repeated opens', async () => {
  let prompts = 0;
  const camera = {
    getCameraPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    requestCameraPermissionsAsync: async () => { prompts++; throw new Error('Would pause the Activity'); },
  };
  for (let open = 0; open < 3; open++) assert.equal((await scannerPermission(camera)).granted, true);
  assert.equal((await scannerPermission(camera, true)).granted, true);
  assert.equal(prompts, 0);
});

test('camera access is requested only explicitly and only when the OS allows asking', async () => {
  let prompts = 0;
  let canAskAgain = true;
  const camera = {
    getCameraPermissionsAsync: async () => ({ granted: false, canAskAgain }),
    requestCameraPermissionsAsync: async () => { prompts++; return { granted: true, canAskAgain: true }; },
  };
  assert.equal((await scannerPermission(camera)).granted, false);
  assert.equal(prompts, 0);
  assert.equal((await scannerPermission(camera, true)).granted, true);
  assert.equal(prompts, 1);
  canAskAgain = false;
  assert.equal((await scannerPermission(camera, true)).granted, false);
  assert.equal(prompts, 1);
});

test('a scanned request is consumed once without including the invoice in its route key', () => {
  const session = new WalletSession(); session.unlock();
  const inbox = new PaymentScanInbox(session);
  const key = inbox.save('synthetic-payment-request');
  assert.ok(!key.includes('synthetic'));
  assert.equal(inbox.take('different-key'), null);
  assert.equal(inbox.take(key), 'synthetic-payment-request');
  assert.equal(inbox.take(key), null);
});

test('locking, expiry and a later scan invalidate pending scanner results', () => {
  let now = 0;
  const session = new WalletSession(() => now); session.unlock();
  const inbox = new PaymentScanInbox(session, () => now);
  let key = inbox.save('synthetic');
  session.lock(); session.unlock();
  assert.equal(inbox.take(key), null);
  key = inbox.save('synthetic');
  now += 60_000;
  assert.equal(inbox.take(key), null);
  key = inbox.save('first');
  const next = inbox.save('second');
  assert.equal(inbox.take(key), null);
  assert.equal(inbox.take(next), 'second');
});
