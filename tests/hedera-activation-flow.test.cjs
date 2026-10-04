'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { runHederaActivation } = require('../lib/hedera/activation-flow.ts');
const { ActivationApiError } = require('../lib/hedera/activation-api.ts');
let id = 0;
const job = (status, extra = {}) => ({ job_id: 'job', status, transaction_id: null,
  account_id: status === 'confirmed' ? '0.0.1234' : null, error_code: null, retry_after: null, ...extra });
function harness(responses) {
  let time = Date.parse('2030-01-01T00:00:00Z');
  const calls = [], bound = [], shown = [], errors = [];
  const options = {
    scope: 'test-' + (++id), now: () => time,
    wait: async ms => { time += ms; }, assertCurrent: () => {},
    request: async existingOnly => {
      calls.push({ existingOnly, time });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      assert.ok(response, 'unexpected request');
      return response;
    },
    bind: async accountId => { bound.push(accountId); },
    onJob: value => shown.push(value), onError: value => errors.push(value),
  };
  return { options, calls, bound, shown, errors };
}
test('activation reads first, creates only after 404, polls with backoff, then verifies account', async () => {
  const h = harness([new ActivationApiError('JOB_NOT_FOUND'), job('pending'), job('pending'), job('confirmed')]);
  await runHederaActivation(h.options);
  assert.deepEqual(h.calls.map(x => x.existingOnly), [true, false, true, true]);
  assert.deepEqual(h.calls.slice(1).map((x,i) => x.time-h.calls[i].time), [15000,30000,60000]);
  assert.deepEqual(h.bound, ['0.0.1234']);
});
test('lost creation response recovers existing job without creating another account', async () => {
  const h = harness([new ActivationApiError('JOB_NOT_FOUND'), new ActivationApiError('CONNECTION_UNAVAILABLE', true), job('confirmed')]);
  await runHederaActivation(h.options);
  assert.deepEqual(h.calls.map(x => x.existingOnly), [true, false, true]);
  assert.equal(h.bound.length, 1);
});
test('restart or recovery reads confirmed job without an activation POST', async () => {
  const h = harness([job('confirmed')]);
  await runHederaActivation(h.options);
  assert.deepEqual(h.calls.map(x => x.existingOnly), [true]);
  assert.equal(h.bound.length, 1);
});
test('rate limit respects retry_after and daily limit never waits past foreground budget', async () => {
  const h = harness([new ActivationApiError('RATE_LIMITED', true, '2030-01-01T00:02:00Z'), job('confirmed')]);
  await runHederaActivation(h.options);
  assert.equal(h.calls[1].time-h.calls[0].time,120000);
  const daily = harness([new ActivationApiError('DAILY_ACTIVATION_LIMIT', true, null, '2030-01-02T00:00:00Z')]);
  await runHederaActivation(daily.options);
  assert.equal(daily.calls.length,1);
});
for (const status of ['failed','needs_review']) test(status + ' stops without binding or creating a replacement', async () => {
  const h = harness([job(status)]);
  await runHederaActivation(h.options);
  assert.equal(h.calls.length,1); assert.equal(h.bound.length,0);
});
test('wallet interruption stops polling before another signature is requested', async () => {
  const h = harness([job('pending')]);
  const wait = h.options.wait;
  h.options.wait = async ms => { await wait(ms); h.options.assertCurrent = () => { throw new Error('wallet locked'); }; };
  await assert.rejects(runHederaActivation(h.options), /wallet locked/);
  assert.equal(h.calls.length,1); assert.equal(h.bound.length,0);
});
test('mismatching account never becomes usable', async () => {
  const h = harness([job('confirmed')]);
  h.options.bind = async () => { throw new Error('Hedera account key does not match this wallet.'); };
  await assert.rejects(runHederaActivation(h.options), /does not match/);
  assert.equal(h.bound.length,0);
});
test('transient verification failure retries verification without new activation requests', async () => {
  const h = harness([job('confirmed')]); let attempts = 0;
  h.options.bind = async () => { if (++attempts === 1) throw new Error('fetch failed'); };
  await runHederaActivation(h.options);
  assert.equal(h.calls.length,1); assert.equal(attempts,2);
});
test('repeated taps keep cooldown across foreground runs for the same wallet', async () => {
  const h = harness([new ActivationApiError('RATE_LIMITED', true, '2030-01-01T00:10:00Z')]);
  await runHederaActivation(h.options);
  await runHederaActivation(h.options);
  assert.equal(h.calls.length,1);
});
