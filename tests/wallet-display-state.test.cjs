'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { bitcoinOperationNotice, paymentHistoryStatus } = require('../lib/wallet-display.ts');

test('broadcast Bitcoin withdrawal is distinguished from an unknown outcome', () => {
  assert.equal(paymentHistoryStatus('outgoing', 'SAT', 'broadcast', 'onchain'), 'Broadcast to the Bitcoin network');
  assert.equal(paymentHistoryStatus('outgoing', 'SAT', 'checking', 'onchain'), 'Status unknown');
  assert.equal(paymentHistoryStatus('outgoing', 'SAT', 'pending', 'lightning'), 'Status unknown');
  assert.equal(paymentHistoryStatus('incoming', 'SAT', 'pending', 'onchain'), 'Processing');
});

test('a deposit requiring approval points directly to fee review', () => {
  assert.deepEqual(bitcoinOperationNotice([{ kind: 'deposit', state: 'action_required' }]), {
    title: 'Bitcoin deposit needs your approval',
    description: 'Review the claim fee before these Bitcoin become available.',
    destination: 'deposits',
  });
  assert.equal(bitcoinOperationNotice([{ kind: 'deposit', state: 'pending' }]).destination, 'deposits');
});

test('an outgoing payment never routes to Receive', () => {
  for (const state of ['checking', 'pending', 'broadcast']) {
    const notice = bitcoinOperationNotice([{ kind: 'withdrawal', state }]);
    assert.equal(notice.destination, 'activity');
  }
  assert.equal(bitcoinOperationNotice([{ kind: 'withdrawal', state: 'confirmed' }]), null);
});

test('a needed deposit approval takes precedence over a concurrent withdrawal', () => {
  const notice = bitcoinOperationNotice([
    { kind: 'withdrawal', state: 'checking' },
    { kind: 'deposit', state: 'action_required' },
  ]);
  assert.equal(notice.destination, 'deposits');
});
