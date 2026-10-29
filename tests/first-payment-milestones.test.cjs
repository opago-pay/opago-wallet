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
  assert.equal(eligibleHistoryEvent({ ...item, type: 'other' }), null);
});
