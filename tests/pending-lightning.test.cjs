'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hookFixture } = require('./react-hooks-fixture.cjs');
require('./register-typescript.cjs');
function fixture(options = {}) {
  const reads = []; const params = { ready: false, focused: true, ...options };
  const snapshots = [];
  const client = {};
  const app = hookFixture('hooks/usePendingLightningPayments.ts', hooks => ({
    'expo-router': { useFocusEffect: fn => hooks.useEffect(() => params.focused ? fn() : undefined, [fn, params.focused]) },
    '@/lib/ui-ready': { yieldToUi: async () => { reads.push('frame'); } },
    '@/lib/lightning/payment-journal-native': { lightningPaymentJournal: { list: async () => { reads.push('journal'); return params.records || []; } } },
    '@/lib/lightning/payment-journal': require('../lib/lightning/payment-journal.ts'),
    '@/lib/lightning/reconcile-native': { reconcileLightningPayments: async (_wallet, _history, snapshot) => { snapshots.push(snapshot); reads.push('network'); return params.resolve ? params.resolve() : []; } },
  }), exports => exports.usePendingLightningPayments(client, params.ready, async () => { reads.push('balance'); }));
  return { ...app, reads, params, snapshots };
}
test('pending payment recovery waits for Bitcoin; a wallet without pending sends never loads remote history', async t => {
  const app = fixture(); t.after(app.unmount);
  app.render(); await app.settle(); assert.deepEqual(app.reads, []);
  app.params.ready = true; await app.settle();
  assert.deepEqual(app.reads, ['frame', 'journal']);
});
test('a pending send is reconciled automatically after startup and refreshes balance once it resolves', async t => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const app = fixture({ ready: true, records: [{ state: 'pending' }], resolve: () => pending }); t.after(app.unmount);
  app.render(); assert.equal((await app.settle()).pendingCount, 1);
  resolve([{ state: 'confirmed' }]); assert.equal((await app.settle()).pendingCount, 0);
  assert.deepEqual(app.reads, ['frame', 'journal', 'network', 'balance']);
});

test('recovery receives the complete journal snapshot so settled payments are not rewritten', async t => {
  const records = [{ paymentHash: 'a'.repeat(64), state: 'pending' }, { paymentHash: 'b'.repeat(64), state: 'confirmed' }];
  const app = fixture({ ready: true, records, resolve: () => records }); t.after(app.unmount);
  app.render(); await app.settle();
  assert.deepEqual(app.snapshots, [records]);
});

test('hidden unresolved sends suppress the notice but still reconcile and refresh on terminal resolution', async t => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const record = { paymentHash: 'a'.repeat(64), state: 'pending', hiddenAt: '2026-09-22T12:00:00Z' };
  const app = fixture({ ready: true, records: [record], resolve: () => pending }); t.after(app.unmount);
  app.render();
  assert.deepEqual(await app.settle(), { pendingCount: 0, hiddenPaymentKeys: ['ln:' + record.paymentHash] });
  assert.equal(app.reads.includes('network'), true);
  resolve([{ ...record, state: 'confirmed' }]);
  assert.deepEqual(await app.settle(), { pendingCount: 0, hiddenPaymentKeys: [] });
  assert.equal(app.reads.includes('balance'), true);
});
test('leaving Home during reconciliation cannot refresh balances or schedule further polling', async t => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const app = fixture({ ready: true, records: [{ state: 'pending' }], resolve: () => pending }); t.after(app.unmount);
  app.render(); await app.settle(); app.params.focused = false; app.render();
  resolve([{ state: 'confirmed' }]); await app.settle();
  assert.equal(app.reads.includes('balance'), false);
});
