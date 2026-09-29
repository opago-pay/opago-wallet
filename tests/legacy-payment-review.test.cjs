'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { reviewLegacyPayments } = require('../lib/legacy-payment-review.ts');
const { LIGHTNING_PAYMENT_JOURNAL_KEY } = require('../lib/lightning/payment-journal.ts');
const { HEDERA_PAYMENT_JOURNAL_KEY } = require('../lib/hedera/payment-journal.ts');
const now = '2026-09-24T12:00:00.000Z';
const lightning = (state, paymentHash) => ({ state, paymentHash, amountSats: 20, requestId: null,
  result: null, createdAt: now, updatedAt: now });
const hedera = (state, transactionId) => ({ state, transactionId, mode: 'direct',
  recipientAccountId: '0.0.456', amountTinybars: '100000000', paymentId: null,
  result: null, createdAt: now, updatedAt: now });

test('legacy review displays unresolved references without assigning a wallet or network', async () => {
  const data = new Map([
    [LIGHTNING_PAYMENT_JOURNAL_KEY, JSON.stringify({ version: 1, records: [
      lightning('pending', 'a'.repeat(64)),
      lightning('confirmed', 'b'.repeat(64)),
    ] })],
    [HEDERA_PAYMENT_JOURNAL_KEY, JSON.stringify({ version: 1, records: [
      hedera('pending', '0.0.123@1700000000.123456789'),
    ] })],
  ]);
  const result = await reviewLegacyPayments({ getItem: async key => data.get(key) ?? null });
  assert.deepEqual(result.map(item => [item.network, item.pending, item.invalid]), [
    ['Bitcoin', 1, false], ['HBAR', 1, false],
  ]);
  assert.deepEqual(result[0].references, ['…' + 'a'.repeat(12)]);
  assert.equal(result[1].references.length, 1);
  assert.equal(data.size, 2);
});

test('settled legacy records need no warning; corrupt records remain visible for review', async () => {
  const data = new Map([
    [LIGHTNING_PAYMENT_JOURNAL_KEY, '{broken'],
    [HEDERA_PAYMENT_JOURNAL_KEY, JSON.stringify({ version: 1, records: [hedera('confirmed', '0.0.123@1700000000.123456789')] })],
  ]);
  const result = await reviewLegacyPayments({ getItem: async key => data.get(key) ?? null });
  assert.deepEqual(result, [{ network: 'Bitcoin', pending: 0, invalid: true, references: [] }]);
});

test('a legacy record without verifiable fields remains flagged and its original bytes untouched', async () => {
  const original = JSON.stringify({ version: 1, records: [{ state: 'pending', paymentHash: 'c'.repeat(64) }] });
  const data = new Map([[LIGHTNING_PAYMENT_JOURNAL_KEY, original]]);
  const result = await reviewLegacyPayments({ getItem: async key => data.get(key) ?? null });
  assert.equal(result[0].invalid, true);
  assert.equal(result[0].pending, 1);
  assert.equal(data.get(LIGHTNING_PAYMENT_JOURNAL_KEY), original);
});
