'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { enqueueCelebration, finishCelebration, createReviewScheduler } =
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
