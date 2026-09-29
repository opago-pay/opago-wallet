'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const { rememberBitcoinRate, currentBitcoinRateSnapshot } = require('../lib/exchange-rate-snapshot.ts');

test('only a recent, valid BTC/EUR observation can be attached to a payment', () => {
  const observedAt = Date.now();
  rememberBitcoinRate(75_000, observedAt);
  assert.deepEqual(currentBitcoinRateSnapshot(observedAt + 60_000), { btcEur: 75_000, fetchedAt: observedAt });
  rememberBitcoinRate(0, observedAt + 1);
  assert.equal(currentBitcoinRateSnapshot(observedAt + 5 * 60_000 + 1), null);
});
