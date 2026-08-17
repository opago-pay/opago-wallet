'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require('./register-typescript.cjs');

const {
  exponentialBackoffDelay,
  isTransientNetworkError,
  retryWithBackoff,
} = require('../lib/retry.ts');
const {
  createSolanaAccountCache,
  SOLANA_ACCOUNT_CACHE_PREFIX,
} = require('../lib/solana/account-cache.ts');

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

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

test('persists last-known Solana fields independently and rejects corrupt cache data', async () => {
  const storage = memoryStorage();
  const address = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
  const cache = createSolanaAccountCache(
    storage,
    () => new Date('2026-08-14T12:00:00.000Z'),
  );
  await cache.mergeFresh({
    address,
    balanceLamports: 5_000_000_000n,
    usdcBaseUnits: 2_000_000n,
    availability: { SOL: 'fresh', USDC: 'fresh' },
    warnings: [],
  });
  const cacheLater = createSolanaAccountCache(
    storage,
    () => new Date('2026-08-14T12:01:00.000Z'),
  );
  await cacheLater.mergeFresh({
    address,
    balanceLamports: 5_100_000_000n,
    usdcBaseUnits: 0n,
    availability: { SOL: 'fresh', USDC: 'unavailable' },
    warnings: ['USDC: 429 Too Many Requests'],
  });
  const loaded = await cacheLater.load(address);
  assert.equal(loaded.balanceLamports, 5_100_000_000n);
  assert.equal(loaded.usdcBaseUnits, 2_000_000n);
  assert.equal(loaded.solUpdatedAt, '2026-08-14T12:01:00.000Z');
  assert.equal(loaded.usdcUpdatedAt, '2026-08-14T12:00:00.000Z');

  storage.values.set(SOLANA_ACCOUNT_CACHE_PREFIX + address, '{broken');
  assert.equal(await cacheLater.load(address), null);
  assert.equal(storage.values.has(SOLANA_ACCOUNT_CACHE_PREFIX + address), false);
});
