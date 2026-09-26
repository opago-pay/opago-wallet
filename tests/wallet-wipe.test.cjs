'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const { createWalletWiper } = require('../lib/wallet-wipe.ts');

test('partial wallet deletion retains its marker and completes idempotently after restart', async () => {
  let marker = 'true';
  let fail = true;
  const calls = [];
  const storage = {
    get: async () => marker,
    remove: async () => { marker = null; calls.push('marker'); },
  };
  const steps = [
    async () => calls.push('history'),
    async () => { calls.push('journal'); if (fail) throw new Error('storage unavailable'); },
    async () => calls.push('key'),
  ];
  await assert.rejects(createWalletWiper(storage, steps).resumeIfPending(), /storage unavailable/);
  assert.equal(marker, 'true');
  assert.deepEqual(calls, ['history', 'journal']);
  fail = false;
  const restarted = createWalletWiper(storage, steps);
  assert.equal(await restarted.resumeIfPending(), true);
  assert.deepEqual(calls, ['history', 'journal', 'history', 'journal', 'key', 'marker']);
  assert.equal(await restarted.resumeIfPending(), false);
});

test('parallel startup callers serialize the same pending deletion', async () => {
  let marker = 'true';
  let finish;
  let calls = 0;
  const wiper = createWalletWiper({ get: async () => marker, remove: async () => { marker = null; } }, [
    () => { calls++; return new Promise(resolve => { finish = resolve; }); },
  ]);
  const first = wiper.resumeIfPending();
  const second = wiper.resumeIfPending();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  finish();
  assert.deepEqual(await Promise.all([first, second]), [true, false]);
  assert.equal(calls, 1);
});
