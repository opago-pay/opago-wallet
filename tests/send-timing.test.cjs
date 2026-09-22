'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function compile(name) {
  return ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib', name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function fixture(enabled = true) {
  const rows = [], scheduled = [];
  let now = 0;
  const exports = {};
  new Function('exports', 'process', 'performance', 'console', 'setTimeout', compile('send-timing.ts'))(
    exports, { env: { EXPO_PUBLIC_SEND_TIMING: enabled ? 'true' : 'false' } }, { now: () => now },
    { info: text => rows.push(JSON.parse(text.replace('OPAGO_SEND_TIMING ', ''))) },
    callback => scheduled.push(callback),
  );
  const hooks = {};
  new Function('require', 'exports', compile('spark-send-timing.ts'))(name => {
    assert.equal(name, './send-timing'); return exports;
  }, hooks);
  return { ...exports, ...hooks, rows, advance: n => { now += n; }, flush: () => { scheduled.splice(0).forEach(fn => fn()); } };
}

test('send timing is opt-in and never changes a disabled SDK instance', async () => {
  const f = fixture(false);
  const original = async () => 7;
  const wallet = { payLightningInvoice: original };
  f.attachSparkSendTiming(wallet);
  assert.equal(wallet.payLightningInvoice, original);
  const stop = f.beginSendTiming();
  const promise = original();
  assert.equal(f.timeSendStep('sdk_send', () => promise), promise);
  stop(); f.flush();
  assert.deepEqual(f.rows, []);
});

test('one capture preserves values/promises/errors and logs only fixed names and numeric durations', async () => {
  const f = fixture(); const stop = f.beginSendTiming();
  const sensitive = { invoice: 'synthetic-sensitive-invoice', key: 'synthetic-secret', amount: 99999 };
  assert.equal(f.timeSendStep('proof_check', () => { f.advance(3); return sensitive; }), sensitive);
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  assert.equal(f.timeSendStep('sdk_send', () => promise), promise);
  f.advance(25); resolve(sensitive); await promise;
  const error = new Error('synthetic-sensitive-error');
  assert.throws(() => f.timeSendStep('fee_quote', () => { throw error; }), cause => cause === error);
  const rejected = Promise.reject(error);
  assert.equal(f.timeSendStep('journal_pending', () => rejected), rejected);
  await assert.rejects(rejected, cause => cause === error);
  // A runtime value cannot become a log label even if a caller bypasses TS.
  f.timeSendStep('synthetic-private-address', () => sensitive);
  stop(); stop();
  assert.deepEqual(f.rows, []); // no console work inside the measured path
  f.flush();
  assert.equal(f.rows.at(-1).stage, 'total');
  assert.equal(f.rows.at(-1).durationMs, 28);
  assert.equal(f.rows.find(row => row.stage === 'sdk_send').durationMs, 25);
  assert.doesNotMatch(JSON.stringify(f.rows), /synthetic|99999/);
  for (const row of f.rows) for (const [key, value] of Object.entries(row)) {
    assert.ok(['run', 'stage', 'startMs', 'endMs', 'durationMs'].includes(key));
    if (key !== 'stage') assert.equal(typeof value, 'number');
  }
  const prior = f.rows.length;
  f.beginSendTiming()(); f.timeSendStep('sdk_send', () => 1); f.flush();
  assert.equal(f.rows.length, prior); // automatically stops after one attempt
});

test('late completions cannot extend a finished trace, and trace memory is bounded', async () => {
  const f = fixture(); const stop = f.beginSendTiming();
  let resolve; const late = new Promise(done => { resolve = done; });
  f.timeSendStep('sdk_send', () => late);
  for (let n = 0; n < 600; n++) f.timeSendStep('proof_check', () => n);
  stop(); resolve(); await late; f.flush();
  assert.equal(f.rows.length, 513);
  assert.equal(f.rows.some(row => row.stage === 'sdk_send'), false);
});

test('SDK observers preserve receivers and promise identity without submitting extra requests', async () => {
  const f = fixture(); let calls = 0;
  const client = { async get_signing_commitments(argument) { assert.equal(this, client); calls++; return argument; } };
  const clientPromise = Promise.resolve(client);
  const connection = { createSparkClient() { assert.equal(this, connection); return clientPromise; } };
  const wallet = {
    connectionManager: connection,
    async payLightningInvoice(argument) { assert.equal(this, wallet); calls++; return argument; },
  };
  f.attachSparkSendTiming(wallet);
  const wrapped = wallet.payLightningInvoice;
  f.attachSparkSendTiming(wallet);
  assert.equal(wallet.payLightningInvoice, wrapped);
  const stop = f.beginSendTiming();
  assert.equal(connection.createSparkClient(), clientPromise);
  await clientPromise;
  const argument = { private: 'synthetic-secret' };
  assert.equal(await client.get_signing_commitments(argument), argument);
  assert.equal(await wallet.payLightningInvoice(argument), argument);
  stop(); f.flush();
  assert.equal(calls, 2);
  assert.deepEqual(f.rows.map(row => row.stage), ['operator_client', 'operator_commitments', 'sdk_send', 'total']);
  assert.doesNotMatch(JSON.stringify(f.rows), /synthetic-secret/);
});

test('pinned SDK exposes the service methods required to distinguish send bottlenecks', () => {
  const { SparkWallet } = require('@buildonspark/spark-sdk');
  // Constructor only: no seed, initialization, external request or real wallet.
  const wallet = new SparkWallet({ network: 'MAINNET' });
  const methods = [
    [wallet, 'payLightningInvoice'], [wallet, 'getLightningSendFeeEstimate'],
    [wallet.leafManager, 'selectLeavesWithSwap'], [wallet.leafManager, 'checkRenewLeaves'],
    [wallet.leafManager, 'handleTransferEvent'], [wallet.swapService, 'requestLeavesSwap'],
    [wallet.transferService, 'prepareTransferForLightning'], [wallet.transferService, 'sendSwapTransfer'],
    [wallet.transferService, 'claimTransfer'], [wallet.lightningService, 'swapNodesForPreimage'],
    [wallet.sspClient, 'requestLightningSend'], [wallet.sspClient, 'requestLeavesSwap'],
    [wallet.sspClient, 'authenticate'], [wallet.sspClient, 'executeRawQuery'],
    [wallet.connectionManager, 'createSparkClient'], [wallet.connectionManager, 'authenticate'],
    [wallet.config.signer, 'getPublicKeyFromDerivation'], [wallet.config.signer, 'getRandomSigningCommitment'],
    [wallet.config.signer, 'signFrost'], [wallet.config.signer, 'aggregateFrost'],
  ];
  const originals = methods.map(([object, name]) => {
    assert.equal(typeof object[name], 'function', name); return object[name];
  });
  const f = fixture(); f.attachSparkSendTiming(wallet);
  methods.forEach(([object, name], index) => assert.notEqual(object[name], originals[index], name));
});
