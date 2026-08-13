'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');

const { withTimeout } = require('../lib/promise-timeout.ts');

test('returns an operation result before the deadline', async () => {
  assert.equal(await withTimeout(Promise.resolve('ready'), 50, 'too slow'), 'ready');
});

test('rejects an operation that exceeds its deadline', async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, 'wallet refresh timed out'),
    /wallet refresh timed out/,
  );
});

test('rejects invalid timeout values without starting a timer', async () => {
  await assert.rejects(
    withTimeout(Promise.resolve('ready'), 0, 'too slow'),
    /positive number of milliseconds/,
  );
});
