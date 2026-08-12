'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

require('./register-typescript.cjs');

const {
  createHederaPaymentJournal,
  HEDERA_PAYMENT_JOURNAL_KEY,
} = require('../lib/hedera/payment-journal.ts');

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

function submission(overrides = {}) {
  return {
    transactionId: '0.0.10030291@1700000000.123456789',
    mode: 'checkout',
    recipientAccountId: '0.0.9944908',
    amountTinybars: 900719925474099312345n,
    paymentId: '0x' + 'ab'.repeat(32),
    ...overrides,
  };
}

test('persists submitted HBAR as exact tinybar text and never as a success', async () => {
  const storage = memoryStorage();
  const journal = createHederaPaymentJournal(
    storage,
    () => new Date('2026-08-12T10:00:00.000Z'),
  );

  await journal.recordSubmitted(submission());
  const [record] = await journal.list();

  assert.equal(record.amountTinybars, '900719925474099312345');
  assert.equal(record.state, 'pending');
  assert.equal(record.result, null);
  const persisted = storage.values.get(HEDERA_PAYMENT_JOURNAL_KEY);
  assert.match(persisted, /900719925474099312345/);
  assert.doesNotMatch(persisted, /mnemonic|recovery|private.?key|signed.?transaction/i);
});

test('keeps an unresolved payment pending across an app restart and network failure', async () => {
  const storage = memoryStorage();
  await createHederaPaymentJournal(storage).recordSubmitted(submission());

  const afterRestart = createHederaPaymentJournal(storage);
  const unavailable = await afterRestart.reconcile(async () => {
    throw new Error('offline');
  });
  assert.equal(unavailable[0].state, 'pending');

  const notFoundYet = await afterRestart.reconcile(async transactionId => ({
    transactionId,
    state: 'pending',
    result: null,
    consensusTimestamp: null,
    hashscanUrl: 'https://hashscan.io/testnet/transaction/example',
  }));
  assert.equal(notFoundYet[0].state, 'pending');
  assert.equal(notFoundYet[0].result, null);
});

test('promotes a pending payment only from an explicit Mirror Node success', async () => {
  const storage = memoryStorage();
  const journal = createHederaPaymentJournal(storage);
  await journal.recordSubmitted(submission());

  const records = await journal.reconcile(async transactionId => ({
    transactionId,
    state: 'success',
    result: 'SUCCESS',
    consensusTimestamp: '1700000001.000000001',
    hashscanUrl: 'https://hashscan.io/testnet/transaction/example',
  }));

  assert.equal(records[0].state, 'confirmed');
  assert.equal(records[0].result, 'SUCCESS');
});

test('stores a known failed receipt as failed and never as confirmed', async () => {
  const storage = memoryStorage();
  const journal = createHederaPaymentJournal(storage);
  await journal.recordSubmitted(submission());
  await journal.recordResolved({
    transactionId: submission().transactionId,
    state: 'failed',
    result: 'CONTRACT_REVERT_EXECUTED',
  });

  const [record] = await createHederaPaymentJournal(storage).list();
  assert.equal(record.state, 'failed');
  assert.equal(record.result, 'CONTRACT_REVERT_EXECUTED');
});

test('fails closed when persisted journal data is malformed', async () => {
  const storage = memoryStorage();
  storage.values.set(HEDERA_PAYMENT_JOURNAL_KEY, JSON.stringify({
    version: 1,
    records: [{ state: 'confirmed' }],
  }));

  await assert.rejects(
    createHederaPaymentJournal(storage).list(),
    /invalid record/i,
  );
});

test('Hedera send paths journal before a non-validating receipt query and use bounded SDK calls', () => {
  const root = path.resolve(__dirname, '..');
  for (const relative of ['lib/hedera/payments.ts', 'lib/hedera/checkout.ts']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const submittedAt = source.indexOf('onSubmitted?.');
    const receiptAt = source.indexOf('.getReceiptQuery(client)');
    assert.ok(submittedAt >= 0 && receiptAt > submittedAt, relative + ' must journal before receipt lookup');
    assert.match(source, /\.setValidateStatus\(false\)/);
    assert.match(source, /\.setRequestTimeout\(HEDERA_SDK_REQUEST_TIMEOUT_MS\)/);
    assert.match(source, /\.setMaxAttempts\(HEDERA_SDK_MAX_ATTEMPTS\)/);
  }
});
