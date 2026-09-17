'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require('./register-typescript.cjs');

const {
  exponentialBackoffDelay,
  isTransientNetworkError,
  retryWithBackoff,
} = require('../lib/retry.ts');
test('retries only transient RPC failures with bounded backoff', async () => {
  const delays = [];
  let attempts = 0;
  const value = await retryWithBackoff(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('429 Too Many Requests');
    return 'ready';
  }, {
    maxAttempts: 2,
    baseDelayMs: 1_000,
    maxDelayMs: 2_000,
    random: () => 0.5,
    sleep: async delayMs => { delays.push(delayMs); },
  });
  assert.equal(value, 'ready');
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [1_000]);
  assert.equal(isTransientNetworkError(new Error('fetch failed')), true);
  assert.equal(isTransientNetworkError(new Error('invalid public key')), false);
  assert.equal(exponentialBackoffDelay(2_500, 4, 30_000), 30_000);
});

test('does not retry permanent validation failures', async () => {
  let attempts = 0;
  await assert.rejects(
    retryWithBackoff(async () => {
      attempts += 1;
      throw new Error('invalid public key');
    }, { sleep: async () => undefined }),
    /invalid public key/,
  );
  assert.equal(attempts, 1);
});
