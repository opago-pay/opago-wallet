'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const { createStaticAddressCache } = require('../lib/bitcoin/static-address-cache.ts');

const ADDRESS = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
const memory = () => {
  const values = new Map();
  return {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
};

test('the saved deposit address survives reopening only for its wallet and Bitcoin network', async () => {
  const storage = memory();
  const first = createStaticAddressCache(storage);
  await first.save('MAINNET:wallet-one', ADDRESS, 'MAINNET', () => {});
  const reopened = createStaticAddressCache(storage);
  assert.equal(await reopened.load('MAINNET:wallet-one', 'MAINNET', () => {}), ADDRESS);
  assert.equal(await reopened.load('MAINNET:wallet-two', 'MAINNET', () => {}), null);
  assert.equal(await reopened.load('REGTEST:wallet-one', 'REGTEST', () => {}), null);
  await reopened.clear();
  assert.equal(await reopened.load('MAINNET:wallet-one', 'MAINNET', () => {}), null);
});

test('invalid or stale addresses are never reused', async () => {
  const storage = memory();
  const cache = createStaticAddressCache(storage);
  await assert.rejects(cache.save('MAINNET:wallet-one', 'not-an-address', 'MAINNET', () => {}));
  await assert.rejects(cache.save('MAINNET:wallet-one', ADDRESS, 'MAINNET', () => { throw new Error('Wallet changed.'); }), /Wallet changed/);
  assert.equal(await cache.load('MAINNET:wallet-one', 'MAINNET', () => {}), null);
});
