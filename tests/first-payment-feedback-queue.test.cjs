'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { enqueueCelebration, finishCelebration, createReviewScheduler, attemptNativeReview } =
  require('../lib/first-payment-feedback-queue.cjs');

test('received and sent events in one snapshot play sequentially', () => {
  let queue = [];
  queue = enqueueCelebration(queue, { id: 1, kind: 'received' });
  queue = enqueueCelebration(queue, { id: 2, kind: 'sent' });
  assert.deepEqual(queue.map(e => e.kind), ['received', 'sent']);
  queue = finishCelebration(queue, 2); // stale animation cannot remove current
  assert.deepEqual(queue.map(e => e.id), [1, 2]);
  queue = finishCelebration(queue, 1);
  assert.equal(queue[0].kind, 'sent');
  queue = finishCelebration(queue, 2);
  assert.equal(queue.length, 0);
});

function fakeClock() {
  const timers = new Map();
  let next = 0;
  return {
    timers,
    schedule(fn, ms) { const id = ++next; timers.set(id, { fn, ms }); return id; },
    cancel(id) { timers.delete(id); },
    async fire() {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      await timer.fn();
    },
  };
}

test('review countdown pauses in background and resumes without losing pending claim', async () => {
  const clock = fakeClock();
  let active = true;
  const calls = [];
  const scheduler = createReviewScheduler({
    isActive: () => active,
    requestReview: async wallet => { calls.push(wallet); return true; },
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  scheduler.enqueue('wallet');
  assert.equal(clock.timers.size, 1);
  assert.equal(clock.timers.values().next().value.ms, 1800);
  active = false;
  scheduler.onAppStateChange('background');
  assert.equal(clock.timers.size, 0);
  assert.equal(scheduler.pendingCount(), 1);
  active = true;
  scheduler.onAppStateChange('active');
  assert.equal(clock.timers.size, 1);
  await clock.fire();
  assert.deepEqual(calls, ['wallet']);
  assert.equal(scheduler.pendingCount(), 0);
  scheduler.onAppStateChange('active');
  assert.equal(clock.timers.size, 0);
});

test('review stays pending when unavailable and retries on later foreground', async () => {
  const clock = fakeClock();
  let active = true;
  let available = false;
  const calls = [];
  const scheduler = createReviewScheduler({
    isActive: () => active,
    requestReview: async wallet => {
      calls.push(wallet);
      return available;
    },
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  scheduler.enqueue('wallet');
  await clock.fire();
  assert.equal(scheduler.pendingCount(), 1);
  assert.equal(clock.timers.size, 0); // no busy retry loop
  active = false;
  scheduler.onAppStateChange('background');
  available = true;
  active = true;
  scheduler.onAppStateChange('active');
  await clock.fire();
  assert.deepEqual(calls, ['wallet', 'wallet']);
  assert.equal(scheduler.pendingCount(), 0);
});

test('multiple pending wallet reviews remain serialized', async () => {
  const clock = fakeClock();
  const calls = [];
  const scheduler = createReviewScheduler({
    isActive: () => true,
    requestReview: async wallet => { calls.push(wallet); return true; },
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  scheduler.enqueue('one');
  scheduler.enqueue('two');
  scheduler.enqueue('two');
  await clock.fire();
  assert.deepEqual(calls, ['one']);
  assert.equal(clock.timers.size, 1);
  await clock.fire();
  assert.deepEqual(calls, ['one', 'two']);
  assert.equal(scheduler.pendingCount(), 0);
});

test('background during asynchronous review storage lookup does not claim or open native sheet', async () => {
  let resolveLookup;
  const storageLookup = new Promise(resolve => { resolveLookup = resolve; });
  let active = true;
  let nativeCalls = 0;
  let claims = 0;
  const attempt = attemptNativeReview('wallet', {
    isCurrent: () => active,
    hasClaim: () => storageLookup,
    isAvailable: async () => true,
    requestReview: async () => { nativeCalls++; },
    claim: async () => { claims++; return true; },
  });
  active = false;
  resolveLookup(false);
  assert.equal(await attempt, false);
  assert.equal(nativeCalls, 0);
  assert.equal(claims, 0);
  active = true;
  assert.equal(await attemptNativeReview('wallet', {
    isCurrent: () => active,
    hasClaim: async () => false,
    isAvailable: async () => true,
    requestReview: async () => { nativeCalls++; },
    claim: async () => { claims++; return true; },
  }), true);
  assert.equal(nativeCalls, 1);
  assert.equal(claims, 1);
});

test('background during native review request does not persist review marker', async () => {
  let finishRequest;
  const nativeRequest = new Promise(resolve => { finishRequest = resolve; });
  let generation = 0;
  const captured = generation;
  let claims = 0;
  const attempt = attemptNativeReview('wallet', {
    isCurrent: () => generation === captured,
    hasClaim: async () => false,
    isAvailable: async () => true,
    requestReview: () => nativeRequest,
    claim: async () => { claims++; return true; },
  });
  await Promise.resolve();
  await Promise.resolve();
  generation++;
  finishRequest();
  assert.equal(await attempt, false);
  assert.equal(claims, 0);
});

test('successful native review is persisted only after its request resolves', async () => {
  let finishRequest;
  const nativeRequest = new Promise(resolve => { finishRequest = resolve; });
  let claimed = false;
  let calls = 0;
  const deps = {
    isCurrent: () => true,
    hasClaim: async () => claimed,
    isAvailable: async () => true,
    requestReview: async () => { calls++; await nativeRequest; },
    claim: async () => { claimed = true; return true; },
  };
  const first = attemptNativeReview('wallet', deps);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(claimed, false);
  finishRequest();
  assert.equal(await first, true);
  assert.equal(claimed, true);
  assert.equal(await attemptNativeReview('wallet', deps), true);
  assert.equal(calls, 1);
});
