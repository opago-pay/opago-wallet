'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

require('./register-typescript.cjs');

const {
  createHederaPaymentJournal: createScopedHederaPaymentJournal,
  HEDERA_PAYMENT_JOURNAL_KEY,
  HEDERA_PAYMENT_JOURNAL_V2_PREFIX,
} = require('../lib/hedera/payment-journal.ts');
const scope = 'testnet:' + 'a'.repeat(64);
const scopedKey = HEDERA_PAYMENT_JOURNAL_V2_PREFIX + scope;
const createHederaPaymentJournal = (storage, now) => createScopedHederaPaymentJournal(storage, scope, now);
const {
  HederaPaymentPendingError,
  reconcileAmbiguousHederaSubmission,
} = require('../lib/hedera/payments.ts');

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
  const persisted = storage.values.get(scopedKey);
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
  storage.values.set(scopedKey, JSON.stringify({
    version: 2, scope,
    records: [{ state: 'confirmed' }],
  }));

  await assert.rejects(
    createHederaPaymentJournal(storage).list(),
    /invalid record/i,
  );
});
test('settled history never evicts an older unresolved HBAR payment', async () => {
  const storage = memoryStorage();
  const journal = createHederaPaymentJournal(storage);
  const first = submission({ mode: 'direct', paymentId: null });
  await journal.recordSubmitted(first);
  for (let index = 1; index <= 55; index++) {
    const transactionId = `0.0.10030291@1700000000.${String(index).padStart(9, '0')}`;
    await journal.recordSubmitted(submission({ transactionId }));
    await journal.recordResolved({ transactionId, state: 'confirmed', result: 'SUCCESS' });
  }
  const records = await createHederaPaymentJournal(storage).list();
  assert.equal(records.length, 51);
  assert.equal(records.find(record => record.transactionId === first.transactionId)?.state, 'pending');
});
test('a slow Hedera status lookup does not block journal writes or overwrite a newer resolution', async () => {
  const journal = createHederaPaymentJournal(memoryStorage());
  const first = submission({ mode: 'direct', paymentId: null });
  await journal.recordSubmitted(first);
  let release;
  const waiting = journal.reconcile(() => new Promise(resolve => { release = resolve; }));
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const second = submission({ transactionId: '0.0.10030291@1700000001.123456789' });
  await journal.recordSubmitted(second);
  await journal.recordResolved({ transactionId: first.transactionId, state: 'confirmed', result: 'SUCCESS' });
  release({ transactionId: first.transactionId, state: 'failed', result: 'REJECTED' });
  const records = await waiting;
  assert.equal(records.find(record => record.transactionId === first.transactionId)?.state, 'confirmed');
  assert.equal(records.find(record => record.transactionId === second.transactionId)?.state, 'pending');
});
test('a pending direct HBAR transfer blocks a second transaction ID until resolved', async () => {
  const journal = createHederaPaymentJournal(memoryStorage());
  const first = submission({ mode: 'direct', paymentId: null });
  const second = submission({ mode: 'direct', paymentId: null,
    transactionId: '0.0.10030291@1700000001.123456789' });
  await journal.recordSubmitted(first);
  await assert.rejects(journal.assertNoUnresolvedDirectPayment('0.0.10030291'), /still being checked/);
  await assert.rejects(journal.recordSubmitted(second), /still being checked/);
  assert.equal((await journal.list()).length, 1);
  await journal.recordResolved({ transactionId: first.transactionId, state: 'confirmed', result: 'SUCCESS' });
  await journal.assertNoUnresolvedDirectPayment('0.0.10030291');
  await journal.recordSubmitted(second);
  assert.equal((await journal.list()).find(item => item.transactionId === second.transactionId)?.state, 'pending');
});

test('HBAR journals isolate wallets and networks and do not adopt an unscoped pending payment', async () => {
  const storage = memoryStorage();
  const first = createHederaPaymentJournal(storage);
  await first.recordSubmitted(submission({ mode: 'direct', paymentId: null }));
  const otherWallet = createScopedHederaPaymentJournal(storage, 'testnet:' + 'b'.repeat(64));
  const otherNetwork = createScopedHederaPaymentJournal(storage, 'mainnet:' + 'a'.repeat(64));
  assert.deepEqual(await otherWallet.list(), []);
  assert.deepEqual(await otherNetwork.list(), []);
  assert.equal((await first.list()).length, 1);
  storage.values.set(HEDERA_PAYMENT_JOURNAL_KEY, JSON.stringify({
    version: 1, records: [{ state: 'pending' }],
  }));
  await assert.rejects(otherWallet.assertNoUnresolvedDirectPayment('0.0.10030291'), /unscoped/i);
  await assert.rejects(otherNetwork.recordSubmitted(submission()), /unscoped/i);
  assert.deepEqual(await otherWallet.list(), []);
  assert.ok(storage.values.has(HEDERA_PAYMENT_JOURNAL_KEY));
});

test('a late HBAR status from an old wallet cannot update another scope or survive a clear', async () => {
  const storage = memoryStorage();
  const oldWallet = createHederaPaymentJournal(storage);
  const newWallet = createScopedHederaPaymentJournal(storage, 'testnet:' + 'b'.repeat(64));
  await oldWallet.recordSubmitted(submission());
  let release;
  const checking = oldWallet.reconcile(() => new Promise(resolve => { release = resolve; }));
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await newWallet.recordSubmitted(submission({ transactionId: '0.0.10030291@1700000001.123456789' }));
  await oldWallet.clear();
  release({ state: 'success', result: 'SUCCESS' });
  await checking;
  assert.deepEqual(await oldWallet.list(), []);
  assert.equal((await newWallet.list())[0].state, 'pending');
});

test('recovers an ambiguous SDK response from authoritative Mirror Node success', async () => {
  const resolutions = [];
  const result = await reconcileAmbiguousHederaSubmission({
    transactionId: submission().transactionId,
    lifecycle: {
      async onResolved(resolution) { resolutions.push(resolution); },
    },
    loadTransaction: async () => ({ result: 'SUCCESS', nonce: 0 }),
  });
  assert.equal(result, 'SUCCESS');
  assert.deepEqual(resolutions, [{
    transactionId: submission().transactionId,
    state: 'confirmed',
    result: 'SUCCESS',
  }]);
});

test('keeps an ambiguous SDK response pending when Mirror Node has no final result', async () => {
  let lookups = 0;
  await assert.rejects(
    reconcileAmbiguousHederaSubmission({
      transactionId: submission().transactionId,
      loadTransaction: async () => {
        lookups += 1;
        return null;
      },
      sleep: async () => undefined,
      maxAttempts: 3,
    }),
    cause => cause instanceof HederaPaymentPendingError &&
      cause.transactionId === submission().transactionId,
  );
  assert.equal(lookups, 3);
});

test('records an authoritative Mirror Node failure without claiming success', async () => {
  const resolutions = [];
  await assert.rejects(
    reconcileAmbiguousHederaSubmission({
      transactionId: submission().transactionId,
      lifecycle: {
        async onResolved(resolution) { resolutions.push(resolution); },
      },
      loadTransaction: async () => ({ result: 'INSUFFICIENT_PAYER_BALANCE', nonce: 0 }),
    }),
    /INSUFFICIENT_PAYER_BALANCE/,
  );
  assert.equal(resolutions[0].state, 'failed');
});

test('Hedera send paths journal before a non-validating receipt query and use bounded SDK calls', () => {
  const root = path.resolve(__dirname, '..');
  for (const relative of ['lib/hedera/payments.ts', 'lib/hedera/checkout.ts']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const sendSource = source.slice(source.indexOf('export async function sendHedera'));
    const transactionIdAt = sendSource.indexOf('TransactionId.generate');
    const submittedAt = sendSource.indexOf('onSubmitted?.');
    const executeAt = sendSource.indexOf('.execute(client)');
    const receiptAt = sendSource.indexOf('.getReceiptQuery(client)');
    assert.ok(transactionIdAt >= 0, relative + ' must assign a transaction ID before submission');
    assert.ok(submittedAt > transactionIdAt && executeAt > submittedAt,
      relative + ' must journal the assigned transaction ID before network submission');
    assert.ok(receiptAt > executeAt, relative + ' must query the receipt only after submission');
    assert.match(sendSource, /\.setTransactionId\(transactionId\)/);
    assert.match(source, /\.setValidateStatus\(false\)/);
    assert.match(source, /\.setRequestTimeout\(HEDERA_SDK_REQUEST_TIMEOUT_MS\)/);
    assert.match(source, /\.setMaxAttempts\(HEDERA_SDK_MAX_ATTEMPTS\)/);
  }
});
