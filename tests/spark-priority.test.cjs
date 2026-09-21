'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { balanceFixture } = require('./wallet-balances-fixture.cjs');

test('An early HBAR expansion waits for the first Spark balance and a UI frame', async t => {
  let resolveSpark;
  const app = balanceFixture({ holdFrames: true, sparkRead: () => new Promise(resolve => { resolveSpark = resolve; }) });
  t.after(app.unmount);
  app.render();
  app.params.enableHedera = true;
  assert.equal(app.render().secondaryDataReady, false);
  assert.deepEqual(app.reads, ['spark']);
  resolveSpark({ balance: 120n });
  const loaded = await app.settle();
  assert.equal(loaded.balances.spark, 120);
  assert.equal(loaded.secondaryDataReady, true);
  assert.deepEqual(app.reads, ['spark']);
  app.releaseFrames(); await app.settle();
  assert.deepEqual(app.reads, ['spark', 'hedera']);
  assert.ok(app.stages.indexOf('lightning_balance') < app.stages.indexOf('hbar_refresh_started'));
});

test('Expanding and collapsing HBAR never refetches an already loaded Bitcoin balance', async t => {
  const app = balanceFixture(); t.after(app.unmount);
  app.render(); await app.settle();
  app.params.enableHedera = true; app.render(); await app.settle();
  app.params.enableHedera = false; app.render(); await app.settle();
  app.params.enableHedera = true; app.render(); await app.settle();
  assert.deepEqual(app.reads, ['spark', 'hedera', 'hedera']);
});

test('Closing the queued HBAR section cancels its read before the UI frame completes', async t => {
  const app = balanceFixture({ holdFrames: true, params: { enableHedera: true } }); t.after(app.unmount);
  app.render(); await app.settle();
  app.params.enableHedera = false; app.render();
  app.releaseFrames(); await app.settle();
  assert.deepEqual(app.reads, ['spark']);
});

test('A Bitcoin balance failure releases explicitly requested HBAR without inventing a zero balance', async t => {
  const app = balanceFixture({ params: { enableHedera: true }, sparkRead: async () => { throw new Error('offline'); } }); t.after(app.unmount);
  app.render(); const result = await app.settle();
  assert.equal(result.balances.spark, null);
  assert.equal(result.balanceStates.spark.status, 'error');
  assert.equal(result.secondaryDataReady, true);
  assert.equal(result.balances.hbarTinybars, 200000000n);
});

test('A stalled SDK releases optional reads after 20 seconds without marking Bitcoin ready', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = balanceFixture({ params: { sparkWallet: null, enableHedera: true } }); t.after(app.unmount);
  app.render(); t.mock.timers.tick(19999); await app.settle();
  assert.deepEqual(app.reads, []);
  t.mock.timers.tick(1);
  const result = await app.settle();
  assert.deepEqual(app.reads, ['hedera']);
  assert.equal(result.sparkPriorityTimedOut, true);
  assert.equal(result.balances.spark, null);
  assert.equal(result.balanceStates.spark.status, 'loading');
});

test('An SDK initialization error releases HBAR immediately instead of waiting for the deadline', async t => {
  const app = balanceFixture({ params: { sparkWallet: null, initializationError: 'Spark unavailable', enableHedera: true } }); t.after(app.unmount);
  app.render(); const result = await app.settle();
  assert.equal(result.secondaryDataReady, true);
  assert.equal(result.sparkPriorityTimedOut, false);
  assert.deepEqual(app.reads, ['hedera']);
});

test('Leaving Home before Spark finishes cannot start optional reads or publish a stale balance', async t => {
  let resolveSpark;
  const app = balanceFixture({ params: { enableHedera: true }, sparkRead: () => new Promise(resolve => { resolveSpark = resolve; }) }); t.after(app.unmount);
  app.render(); app.params.focused = false; app.render();
  resolveSpark({ balance: 120n });
  const result = await app.settle();
  assert.equal(result.balances.spark, null);
  assert.deepEqual(app.reads, ['spark']);
});

test('A new Spark instance must load its own balance before secondary reads are released', async t => {
  let resolveSpark;
  let first = true;
  const app = balanceFixture({ sparkRead: () => {
    if (first) { first = false; return { balance: 120n }; }
    return new Promise(resolve => { resolveSpark = resolve; });
  } }); t.after(app.unmount);
  app.render(); await app.settle();
  app.params.sparkWallet = {};
  app.params.enableHedera = true;
  assert.equal(app.render().secondaryDataReady, false);
  resolveSpark({ balance: 0n });
  const result = await app.settle();
  assert.equal(result.balances.spark, 0);
  assert.deepEqual(app.reads, ['spark', 'spark', 'hedera']);
});

test('Pull-to-refresh waits for Bitcoin again before refreshing visible HBAR data', async t => {
  let resolveSpark;
  let count = 0;
  const app = balanceFixture({ holdFrames: true, params: { enableHedera: true }, sparkRead: () => {
    if (++count === 1) return { balance: 120n };
    return new Promise(resolve => { resolveSpark = resolve; });
  } }); t.after(app.unmount);
  app.render(); await app.settle(); app.releaseFrames();
  const initial = await app.settle();
  app.reads.length = 0;
  const refreshing = initial.refreshBalances();
  app.render(); app.releaseFrames(); await app.settle();
  assert.deepEqual(app.reads, ['spark']);
  resolveSpark({ balance: 100n }); await app.settle();
  assert.deepEqual(app.reads, ['spark']);
  app.releaseFrames(); await refreshing;
  const result = await app.settle();
  assert.deepEqual(app.reads, ['spark', 'hedera']);
  assert.equal(result.balances.spark, 100);
});
