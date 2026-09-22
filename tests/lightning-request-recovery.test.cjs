'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { loadSparkLightningSendRequests, resolveLightningPaymentFromSpark } = require('../lib/lightning/spark-history.ts');
const { paymentHistoryTitle, paymentHistoryStatus } = require('../lib/wallet-display.ts');
const paymentHash = '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925';
const preimage = '00'.repeat(32);
const record = { paymentHash, requestId: null, amountSats: 20 };
const request = (extra = {}) => ({ typename: 'LightningSendRequest', id: 'provider-request',
  idempotencyKey: 'opago-' + paymentHash, status: 'PREIMAGE_PROVIDED', paymentPreimage: preimage, ...extra });
const page = entities => ({ entities, pageInfo: { hasNextPage: false } });

test('a lost submit response is recovered from the provider request index before transfer history exists', async () => {
  const result = await resolveLightningPaymentFromSpark({
    getUserRequests: async () => page([request()]),
    getTransfers: async () => assert.fail('A proof-backed request must not need transfer history'),
  }, record);
  assert.deepEqual(result, { state: 'confirmed', result: 'PREIMAGE_PROVIDED', requestId: 'provider-request' });
});

test('provider request pagination follows cursors and ignores receive requests with the same hash', async () => {
  const calls = [];
  const result = await resolveLightningPaymentFromSpark({
    getUserRequests: async args => {
      calls.push(args);
      return args.after ? page([request({ paymentPreimage: undefined, status: 'LIGHTNING_PAYMENT_FAILED' })]) : {
        entities: [request({ typename: 'LightningReceiveRequest' })],
        pageInfo: { hasNextPage: true, endCursor: 'second-page' },
      };
    },
    getTransfers: async () => ({ transfers: [] }),
  }, record);
  assert.equal(result.state, 'failed');
  assert.equal(result.result, 'LIGHTNING_PAYMENT_FAILED');
  assert.deepEqual(calls, [{ first: 50, after: undefined }, { first: 50, after: 'second-page' }]);
});

test('missing requests, unrelated failures and success labels without proof never release an ambiguous send', async () => {
  for (const entities of [[], [request({ idempotencyKey: 'opago-' + 'f'.repeat(64), status: 'LIGHTNING_PAYMENT_FAILED' })],
    [request({ paymentPreimage: 'ff'.repeat(32), status: 'LIGHTNING_PAYMENT_SUCCEEDED' })]]) {
    const result = await resolveLightningPaymentFromSpark({
      getUserRequests: async () => page(entities), getTransfers: async () => ({ transfers: [] }),
    }, record);
    assert.equal(result.state, 'pending');
  }
});

test('a discovered pending request ID survives a history outage and uses the direct lookup on the next pass', async () => {
  const first = await resolveLightningPaymentFromSpark({
    getUserRequests: async () => page([request({ paymentPreimage: undefined, status: 'LIGHTNING_PAYMENT_INITIATED' })]),
    getTransfers: async () => { throw new Error('history unavailable'); },
  }, record);
  assert.equal(first.state, 'pending');
  assert.equal(first.requestId, 'provider-request');
  const second = await resolveLightningPaymentFromSpark({
    getLightningSendRequest: async id => request({ id }),
    getUserRequests: async () => assert.fail('The direct proof should finish reconciliation'),
    getTransfers: async () => assert.fail('The direct proof should finish reconciliation'),
  }, { ...record, requestId: first.requestId });
  assert.equal(second.state, 'confirmed');
});

test('a request-index outage still permits recovery from transfer history', async () => {
  const result = await resolveLightningPaymentFromSpark({
    getUserRequests: async () => { throw new Error('index unavailable'); },
    getTransfers: async () => ({ transfers: [{ transferDirection: 'OUTGOING', userRequest: request() }] }),
  }, record);
  assert.equal(result.state, 'confirmed');
});

test('malformed or repeated request cursors stop bounded pagination without treating absence as a failure', async () => {
  let calls = 0;
  await assert.rejects(loadSparkLightningSendRequests({ getUserRequests: async () => {
    calls++;
    return { entities: [request()], pageInfo: { hasNextPage: true, endCursor: 'same-page' } };
  } }), /did not advance/);
  assert.equal(calls, 2);
  await assert.rejects(loadSparkLightningSendRequests({ getUserRequests: async () => null }), /unavailable/);
});

test('unresolved and failed history entries never claim that money was sent or received', () => {
  for (const status of ['pending', 'failed', 'action_required', 'unknown']) {
    assert.equal(paymentHistoryTitle('outgoing', status), 'Outgoing payment');
    assert.equal(paymentHistoryTitle('incoming', status), 'Incoming payment');
  }
  assert.equal(paymentHistoryTitle('outgoing', 'confirmed'), 'Payment sent');
  assert.equal(paymentHistoryTitle('incoming', 'confirmed'), 'Money received');
});

test('recovery diagnostics are opt-in and reject arbitrary values even in an internal build', () => {
  const { recordLightningRecoveryStage } = require('../lib/lightning/recovery-diagnostics.ts');
  const flag = process.env.EXPO_PUBLIC_PAYMENT_DIAGNOSTICS;
  const original = console.info;
  const messages = [];
  console.info = message => messages.push(message);
  try {
    delete process.env.EXPO_PUBLIC_PAYMENT_DIAGNOSTICS;
    recordLightningRecoveryStage('request_missing');
    assert.deepEqual(messages, []);
    process.env.EXPO_PUBLIC_PAYMENT_DIAGNOSTICS = 'true';
    recordLightningRecoveryStage('request_missing');
    recordLightningRecoveryStage('private wallet material must never be printed');
    assert.deepEqual(messages, ['OPAGO_RECOVERY request_missing']);
  } finally {
    console.info = original;
    if (flag === undefined) delete process.env.EXPO_PUBLIC_PAYMENT_DIAGNOSTICS;
    else process.env.EXPO_PUBLIC_PAYMENT_DIAGNOSTICS = flag;
  }
});

test('a lost provider response can be confirmed by a hash-bound operator proof with sender role', async () => {
  const calls = [];
  const result = await resolveLightningPaymentFromSpark({
    getUserRequests: async () => page([]),
    getTransfers: async () => assert.fail('Operator proof must not need transfer history'),
    queryHTLC: async args => {
      calls.push(args);
      return { preimageRequests: [{ paymentHash: Buffer.from(paymentHash, 'hex'), preimage: Buffer.from(preimage, 'hex') }] };
    },
  }, record);
  assert.deepEqual(calls, [{ paymentHashes: [paymentHash], matchRole: 1, limit: 100, offset: 0 }]);
  assert.deepEqual(result, { state: 'confirmed', result: 'OPERATOR_PREIMAGE_VERIFIED', requestId: null });
});

test('absent, returned, unrelated and unproven operator records never release the pending guard', async () => {
  for (const preimageRequests of [[],
    [{ paymentHash: Buffer.from(paymentHash, 'hex'), status: 2 }],
    [{ paymentHash: Buffer.from('f'.repeat(64), 'hex'), preimage: Buffer.from(preimage, 'hex'), status: 1 }],
    [{ paymentHash: Buffer.from(paymentHash, 'hex'), preimage: Buffer.from('f'.repeat(64), 'hex'), status: 1 }],
    [{ paymentHash, preimage, status: 1 }]]) {
    const result = await resolveLightningPaymentFromSpark({
      getUserRequests: async () => page([]), getTransfers: async () => ({ transfers: [] }),
      queryHTLC: async () => ({ preimageRequests }),
    }, record);
    assert.equal(result.state, 'pending');
  }
});

test('operator errors and malformed replies do not prevent proof-backed transfer recovery', async () => {
  for (const queryHTLC of [async () => { throw new Error('offline'); }, async () => null]) {
    const result = await resolveLightningPaymentFromSpark({ queryHTLC,
      getUserRequests: async () => page([]),
      getTransfers: async () => ({ transfers: [{ transferDirection: 'OUTGOING', userRequest: request() }] }),
    }, record);
    assert.equal(result.state, 'confirmed');
  }
});

test('an unresolved Lightning send is described as unknown, without changing receive or final states', () => {
  assert.equal(paymentHistoryStatus('outgoing', 'SAT', 'pending'), 'Status unknown');
  assert.equal(paymentHistoryStatus('incoming', 'SAT', 'pending'), 'Processing');
  assert.equal(paymentHistoryStatus('outgoing', 'HBAR', 'pending'), 'Processing');
  assert.equal(paymentHistoryStatus('outgoing', 'SAT', 'confirmed'), 'Completed');
  assert.equal(paymentHistoryStatus('outgoing', 'SAT', 'failed'), 'Needs attention');
});

test('a diagnostic console failure cannot prevent recovery', () => {
  const { recordLightningRecoveryStage } = require('../lib/lightning/recovery-diagnostics.ts');
  const flag = process.env.EXPO_PUBLIC_PAYMENT_DIAGNOSTICS;
  const original = console.info;
  process.env.EXPO_PUBLIC_PAYMENT_DIAGNOSTICS = 'true';
  console.info = () => { throw new Error('Logging unavailable'); };
  try { assert.doesNotThrow(() => recordLightningRecoveryStage('operator_missing')); }
  finally {
    console.info = original;
    if (flag === undefined) delete process.env.EXPO_PUBLIC_PAYMENT_DIAGNOSTICS;
    else process.env.EXPO_PUBLIC_PAYMENT_DIAGNOSTICS = flag;
  }
});
