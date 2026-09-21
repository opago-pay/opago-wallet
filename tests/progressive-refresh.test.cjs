'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { refreshProgressively } = require('../lib/progressive-refresh.ts');
const { yieldToUi } = require('../lib/ui-ready.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('fast activity is published before a slow independent network, with stable priority', async () => {
  let finishRemote;
  const updates = [];
  const started = [];
  const refresh = refreshProgressively([
    { label: 'slow', load: () => { started.push('slow'); return new Promise(resolve => { finishRemote = resolve; }); } },
    { label: 'local', load: async () => { started.push('local'); return ['cached payment']; } },
  ], result => updates.push(result), 1000);
  await flush();
  assert.deepEqual(started, ['slow', 'local']);
  assert.deepEqual(updates, [{ batches: [['cached payment']], errors: [], pending: 1 }]);
  finishRemote(['remote payment']);
  await refresh;
  assert.deepEqual(updates.at(-1), { batches: [['remote payment'], ['cached payment']], errors: [], pending: 0 });
});

test('unavailable sources have a bounded wait and late responses cannot overwrite visible activity', async () => {
  let finishLate;
  const updates = [];
  await refreshProgressively([
    { label: 'hung', load: () => new Promise(resolve => { finishLate = resolve; }) },
    { label: 'failed', load: async () => { throw new Error('offline'); } },
    { label: 'ready', load: async () => ['visible'] },
  ], result => updates.push(result), 20);
  assert.deepEqual(updates.at(-1), { batches: [['visible']], errors: ['hung: hung refresh timed out.', 'failed: offline'], pending: 0 });
  const count = updates.length;
  finishLate(['obsolete']);
  await flush();
  assert.equal(updates.length, count);
});

test('wallet work yields past an animation frame before it resumes', async t => {
  const previousFrame = global.requestAnimationFrame;
  const previousCancel = global.cancelAnimationFrame;
  t.after(() => { global.requestAnimationFrame = previousFrame; global.cancelAnimationFrame = previousCancel; });
  let paint;
  global.requestAnimationFrame = callback => { paint = callback; return 1; };
  global.cancelAnimationFrame = () => {};
  let resumed = false;
  const pending = yieldToUi().then(() => { resumed = true; });
  await flush();
  assert.equal(resumed, false);
  paint();
  assert.equal(resumed, false);
  await pending;
  assert.equal(resumed, true);
  // A backgrounded app with no animation frames must release the queue so the
  // session guard can cancel its work instead of leaving initialization stuck.
  const start = Date.now();
  await yieldToUi();
  assert.ok(Date.now() - start >= 100);
});
