'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { balanceFixture } = require('./wallet-balances-fixture.cjs');

test('A payment screen can skip the redundant display balance without delaying HBAR', async t => {
  const app = balanceFixture({ params: { enableSpark: false, enableHedera: true } });
  t.after(app.unmount);
  app.render();
  const result = await app.settle();
  assert.equal(result.secondaryDataReady, true);
  assert.deepEqual(app.reads, ['hedera']);
  assert.equal(result.balances.spark, null);
});

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

test('Returning to Home paints the known Bitcoin balance before another SDK read', async t => {
  const app = balanceFixture({ holdFrames: true }); t.after(app.unmount);
  app.render();
  const initial = await app.settle();
  assert.equal(initial.balances.spark, 120);
  assert.deepEqual(app.reads, ['spark']);

  app.params.focused = false; app.render();
  app.params.focused = true;
  const returning = app.render();
  assert.equal(returning.balances.spark, 120);
  assert.deepEqual(app.reads, ['spark']);

  app.releaseFrames(); await app.settle();
  assert.deepEqual(app.reads, ['spark', 'spark']);
});

test('Expanding and collapsing HBAR reuses both balances and keeps refresh listeners stable', async t => {
  const app = balanceFixture(); t.after(app.unmount);
  app.render(); const initial = await app.settle();
  app.params.enableHedera = true; app.render(); await app.settle();
  app.params.enableHedera = false; app.render(); await app.settle();
  app.params.enableHedera = true; app.render(); const result = await app.settle();
  assert.equal(result.refreshBalances, initial.refreshBalances);
  assert.deepEqual(app.reads, ['spark', 'hedera']);
});

test('Rapid HBAR toggles share an in-flight read and still publish its result', async t => {
  let resolveHedera;
  let hederaReads = 0;
  const app = balanceFixture({ params: { enableHedera: true, refreshHederaAccount: () => {
    hederaReads++;
    return new Promise(resolve => { resolveHedera = resolve; });
  } } }); t.after(app.unmount);
  app.render(); await app.settle();
  for (let i = 0; i < 6; i++) {
    app.params.enableHedera = !app.params.enableHedera;
    app.render(); await app.settle();
  }
  assert.equal(hederaReads, 1);
  resolveHedera({ balanceTinybars: 300000000n });
  const result = await app.settle();
  assert.equal(result.balances.hbarTinybars, 300000000n);
  assert.equal(result.balanceStates.hedera.status, 'ready');
});

test('Returning to Home refreshes HBAR again and discards a late result from the previous visit', async t => {
  let resolveFirst;
  let hederaReads = 0;
  const app = balanceFixture({ params: { enableHedera: true, refreshHederaAccount: async () => {
    if (++hederaReads === 1) return new Promise(resolve => { resolveFirst = resolve; });
    return { balanceTinybars: 400000000n };
  } } }); t.after(app.unmount);
  app.render(); await app.settle();
  app.params.focused = false; app.render();
  app.params.focused = true; app.render(); await app.settle();
  resolveFirst({ balanceTinybars: 200000000n });
  const result = await app.settle();
  assert.equal(hederaReads, 2);
  assert.equal(result.balances.hbarTinybars, 400000000n);
});

test('A failed HBAR read can be retried by reopening the section', async t => {
  let hederaReads = 0;
  const app = balanceFixture({ params: { enableHedera: true, refreshHederaAccount: async () => {
    if (++hederaReads === 1) throw new Error('offline');
    return { balanceTinybars: 500000000n };
  } } }); t.after(app.unmount);
  app.render(); const failed = await app.settle();
  assert.equal(failed.balanceStates.hedera.status, 'error');
  assert.equal(failed.balances.hbarTinybars, null);
  app.params.enableHedera = false; app.render();
  app.params.enableHedera = true; app.render();
  const result = await app.settle();
  assert.equal(hederaReads, 2);
  assert.equal(result.balances.hbarTinybars, 500000000n);
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
  const pending = app.render(); app.releaseFrames(); await app.settle();
  assert.equal(pending.balanceStates.spark.status, 'loading');
  assert.equal(pending.balances.spark, 120);
  assert.equal(pending.secondaryDataReady, true, 'A known-balance refresh must not restart optional consumers');
  assert.deepEqual(app.reads, ['spark']);
  resolveSpark({ balance: 100n }); await app.settle();
  assert.deepEqual(app.reads, ['spark']);
  app.releaseFrames(); await refreshing;
  const result = await app.settle();
  assert.deepEqual(app.reads, ['spark', 'hedera']);
  assert.equal(result.balances.spark, 100);
});

test('Collapsing HBAR during Bitcoin refresh skips the now-hidden HBAR refresh', async t => {
  let resolveSpark;
  let count = 0;
  const app = balanceFixture({ params: { enableHedera: true }, sparkRead: () => {
    if (++count === 1) return { balance: 120n };
    return new Promise(resolve => { resolveSpark = resolve; });
  } }); t.after(app.unmount);
  app.render(); const initial = await app.settle();
  const refreshing = initial.refreshBalances();
  app.params.enableHedera = false; app.render();
  resolveSpark({ balance: 100n });
  await refreshing; await app.settle();
  assert.deepEqual(app.reads, ['spark', 'hedera', 'spark']);
});
