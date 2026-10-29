'use strict';

/** Plain, testable FIFO for celebrations: appending never replaces the current event. */
function enqueueCelebration(queue, event) {
  return [...queue, event];
}
function finishCelebration(queue, id) {
  return queue.length && queue[0].id === id ? queue.slice(1) : queue;
}

/**
 * Review countdown runs only while the app is active. An interrupted countdown
 * remains pending and starts again on resume. A failed/unavailable native prompt
 * remains eligible for a future foreground observation.
 */
function createReviewScheduler({ isActive, requestReview, schedule = setTimeout, cancel = clearTimeout, delay = 1800 }) {
  const pending = new Set();
  let timer = null;
  let running = false;
  function start() {
    if (timer !== null || running || !isActive() || !pending.size) return;
    timer = schedule(async () => {
      timer = null;
      if (!isActive()) return;
      const wallet = pending.values().next().value;
      if (!wallet) return;
      running = true;
      try {
        if (await requestReview(wallet) && isActive()) pending.delete(wallet);
      } catch { /* Never interrupt a payment; retry on a later foreground event. */ }
      finally {
        running = false;
        // Other wallet requests are still eligible. Failed wallet retries wait
        // for another enqueue/resume rather than spinning on store unavailability.
        if (pending.size > 1 || !pending.has(wallet)) start();
      }
    }, delay);
  }
  return {
    enqueue(wallet) { if (wallet) pending.add(wallet); start(); },
    onAppStateChange(state) {
      if (state !== 'active') {
        if (timer !== null) cancel(timer);
        timer = null;
      } else start();
    },
    pendingCount() { return pending.size; },
  };
}
module.exports = { enqueueCelebration, finishCelebration, createReviewScheduler };
