const test = require('node:test');
const assert = require('node:assert/strict');
const { createMilestoneGate, eligibleHistoryEvent } = require('../lib/first-payment-milestones.cjs');

function storage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
}

test('claims each milestone once per wallet and survives gate reconstruction', async () => {
  const store = storage();
  const gate = createMilestoneGate(store);
  assert.equal(await gate.claim('wallet-A', 'received'), true);
  assert.equal(await gate.claim('wallet-A', 'received'), false);
  assert.equal(await createMilestoneGate(store).claim('wallet-A', 'received'), false);
  assert.equal(await gate.claim('wallet-A', 'sent'), true);
  assert.equal(await gate.claim('wallet-A', 'review'), true);
  assert.equal(await gate.claim('wallet-B', 'received'), true);
});
test('concurrent identical events cannot claim twice', async () => {
  const gate = createMilestoneGate(storage());
  assert.deepEqual((await Promise.all(Array.from({length: 15}, () => gate.claim('wallet', 'sent')))).filter(Boolean), [true]);
});
test('failure to persist never grants a celebration', async () => {
  const gate = createMilestoneGate({ getItem: async () => null, setItem: async () => { throw Error('disk'); } });
  await assert.rejects(gate.claim('wallet', 'received'), /disk/);
});
test('only positive, confirmed external transactions count', () => {
  const item = { type: 'incoming', status: 'confirmed', amountValue: 10 };
  assert.equal(eligibleHistoryEvent(item), 'received');
  assert.equal(eligibleHistoryEvent({ ...item, type: 'outgoing', status: 'success' }), 'sent');
  for (const status of ['pending', 'failed', 'action_required', 'unknown']) {
    assert.equal(eligibleHistoryEvent({ ...item, status }), null);
  }
  assert.equal(eligibleHistoryEvent({ ...item, amountValue: 0 }), null);
  assert.equal(eligibleHistoryEvent({ ...item, internalTransfer: 'to_lightning' }), null);
  assert.equal(eligibleHistoryEvent({ ...item, legacyDeposit: true }), null);
  assert.equal(eligibleHistoryEvent({ ...item, operation: { kind: 'transfer' } }), null);
  assert.equal(eligibleHistoryEvent({ ...item, type: 'outgoing', status: 'broadcast' }), null);
  assert.equal(eligibleHistoryEvent({ ...item, type: 'incoming', status: 'pending' }), null);
  assert.equal(eligibleHistoryEvent({ ...item, type: 'other' }), null);
});

test('merged on-chain history qualifies only confirmed external BTC deposits and sends', () => {
  require('./register-typescript.cjs');
  const { mergeOnchainHistory } = require('../lib/onchain/history.ts');
  const operations = [
    { id: 'sent', kind: 'send', state: 'confirmed', amountSats: 500, createdAt: '2026-10-29T08:00:00Z', network: 'mainnet', txid: 'senttx' },
    { id: 'processing', kind: 'send', state: 'broadcast_pending', amountSats: 300, createdAt: '2026-10-29T08:00:00Z', network: 'mainnet', txid: 'processingtx' },
    { id: 'internal', kind: 'to_lightning', state: 'confirmed', transferStage: 'completed', amountSats: 200, createdAt: '2026-10-29T08:00:00Z', network: 'mainnet', txid: 'internaltx' },
    { id: 'refund', kind: 'refund', state: 'confirmed', amountSats: 100, createdAt: '2026-10-29T08:00:00Z', network: 'mainnet', txid: 'refundtx' },
  ];
  const txs = [
    { txid: 'deposit', sentSats: 0, receivedSats: 1000, confirmed: true, observedAt: Date.now() },
    { txid: 'unconfirmed-deposit', sentSats: 0, receivedSats: 2000, confirmed: false, observedAt: Date.now() },
  ];
  const rows = mergeOnchainHistory([], txs, operations, 'en', 'mainnet');
  const byKey = key => rows.find(row => row.key === key);
  assert.equal(eligibleHistoryEvent(byKey('own:sent')), 'sent');
  assert.equal(eligibleHistoryEvent(byKey('own-tx:deposit')), 'received');
  assert.equal(eligibleHistoryEvent(byKey('own:processing')), null);
  assert.equal(eligibleHistoryEvent(byKey('own:internal')), null);
  assert.equal(eligibleHistoryEvent(byKey('own:refund')), null);
  assert.equal(eligibleHistoryEvent(byKey('own-tx:unconfirmed-deposit')), null);
});
