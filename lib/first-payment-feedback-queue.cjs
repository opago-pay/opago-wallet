'use strict';

/** Plain, testable FIFO for celebrations: appending never replaces the current event. */
function enqueueCelebration(queue, event) {
  return [...queue, event];
}
function finishCelebration(queue, id) {
  return queue.length && queue[0].id === id ? queue.slice(1) : queue;
}

/**
 * Check the durable flag *without consuming it* before invoking the OS review
 * sheet. A background transition during any async gate or availability check
 * makes the attempt retryable. The flag is persisted only after the native call
 * resolves while the same foreground session is still current. The OS may still
 * choose not to display a sheet; the native API cannot report that decision.
 */
async function attemptNativeReview(wallet, { isCurrent, isAvailable, hasClaim, requestReview, claim }) {
  if (!isCurrent()) return false;
  if (await hasClaim(wallet)) return true;
  if (!isCurrent() || !(await isAvailable()) || !isCurrent()) return false;
  await requestReview();
  if (!isCurrent()) return false;
  await claim(wallet);
  return true;
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
  let resumedDuringRequest = false;
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
        if (resumedDuringRequest || !pending.has(wallet)) {
          resumedDuringRequest = false;
          start();
        }
      }
    }, delay);
  }
  return {
    enqueue(wallet) { if (wallet) pending.add(wallet); start(); },
    onAppStateChange(state) {
      if (state !== 'active') {
        if (timer !== null) cancel(timer);
        timer = null;
      } else {
        if (running) resumedDuringRequest = true;
        else start();
      }
    },
    pendingCount() { return pending.size; },
  };
}
module.exports = { enqueueCelebration, finishCelebration, createReviewScheduler, attemptNativeReview };
