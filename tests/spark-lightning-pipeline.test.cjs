'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { SparkWallet, KeyDerivationType } = require('@buildonspark/spark-sdk');
const { invoice } = require('./lightning-invoice-fixture.cjs');
require('./register-typescript.cjs');
const { installSparkLightningPipeline } = require('../lib/spark-lightning-pipeline.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
function gate() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const identity = new Uint8Array(33).fill(7);
function leaf(id) {
  return { leaf: { id, nodeTx: Uint8Array.of(1), refundTx: Uint8Array.of(2), directTx: Uint8Array.of(3), verifyingPublicKey: identity },
    keyDerivation: { type: KeyDerivationType.LEAF, path: id }, newKeyDerivation: { type: KeyDerivationType.RANDOM }, receiverIdentityPublicKey: identity };
}
function fixture(options = {}) {
  const wallet = new SparkWallet({ network: 'MAINNET' }, { getIdentityPublicKey: async () => identity }); // no init/network
  const events = [], calls = [], prepared = [], requests = [];
  let sequence = 0;
  const client = {
    async get_signing_commitments(input) {
      events.push('commitments:' + input.nodeIds.join(','));
      await options.commitmentGate?.promise;
      if (options.commitmentError) throw Error('Synthetic commitment failure');
      const response = { signingCommitments: Array.from({ length: input.count * input.nodeIds.length }, () => ({
        signingNonceCommitments: { operator: { syntheticNonce: ++sequence } },
      })) };
      if (options.incomplete) response.signingCommitments.pop();
      calls.push({ input, response }); return response;
    },
    async initiate_preimage_swap_v3(input, rpcOptions) {
      assert.equal(this, client);
      events.push('outbound:' + input.transfer.transferId); requests.push({ input, rpcOptions });
      return { transfer: { id: input.transfer.transferId } };
    },
  };
  wallet.connectionManager.createSparkClient = async () => client;
  wallet.transferService.prepareSendTransferKeyTweaks = async () => {
    events.push('key-tweaks'); return new Map();
  };
  wallet.transferService.prepareTransferPackageForLightning = async () => {
    events.push('package-start'); await options.packageGate?.promise;
    if (options.packageError) throw Error('Synthetic package failure');
    events.push('package-ready'); return { syntheticPackage: true };
  };
  wallet.signingService.signRefunds = async (leaves, a, b, c) => {
    events.push('sign:' + leaves.map(item => item.leaf.id));
    if (options.signError) throw Error('Synthetic signing failure');
    const jobs = {
      cpfpLeafSigningJobs: leaves.map((item, i) => ({ leafId: item.leaf.id, marker: a[i] })),
      directLeafSigningJobs: leaves.map((item, i) => ({ leafId: item.leaf.id, marker: b[i] })),
      directFromCpfpLeafSigningJobs: leaves.map((item, i) => ({ leafId: item.leaf.id, marker: c[i] })),
    };
    prepared.push({ leaves, groups: [a, b, c], jobs }); return jobs;
  };
  const originalSwap = wallet.lightningService.swapNodesForPreimage;
  const originalClientMethod = client.get_signing_commitments;
  const pipeline = options.install === false ? null : installSparkLightningPipeline(wallet.transferService, wallet.lightningService);
  function params(leaves, request, id = 'synthetic-transfer') {
    return { leaves, paymentHash: new Uint8Array(32).fill(7), receiverIdentityPubkey: identity,
      isInboundPayment: false, transferID: id, startTransferRequest: request, feeSats: 2,
      invoiceString: invoice(20, 1800000000, { network: 'bc' }), expiryTime: new Date(1900000000000), idempotencyKey: 'synthetic-idempotency' };
  }
  function prepare(leaves, id = 'synthetic-transfer') {
    return wallet.transferService.prepareTransferForLightning(leaves, new Uint8Array(32).fill(7), new Date(1900000000000), id);
  }
  return { wallet, client, events, calls, prepared, requests, pipeline, originalSwap, originalClientMethod, params, prepare };
}

test('actual SDK overlaps preparation but cannot send before the complete transfer package exists', async () => {
  const packageGate = gate(); const app = fixture({ packageGate }); const leaves = [leaf('a'), leaf('b')];
  Object.freeze(app.client); // Wrapping must not require mutable RPC methods.
  const preparation = app.prepare(leaves); await flush();
  assert.ok(app.events.includes('package-start')); assert.ok(app.events.includes('sign:a,b'));
  assert.equal(app.requests.length, 0); assert.equal(app.calls.length, 1);
  packageGate.resolve(); const request = await preparation;
  const params = app.params(leaves, request);
  const result = await app.wallet.lightningService.swapNodesForPreimage(params);
  assert.equal(result.transfer.id, params.transferID);
  assert.equal(app.requests.length, 1); assert.equal(app.calls.length, 1); assert.equal(app.prepared.length, 1);
  assert.equal(app.client.get_signing_commitments, app.originalClientMethod);
  const oracle = fixture({ install: false });
  oracle.client.get_signing_commitments = async () => app.calls[0].response;
  await oracle.originalSwap.call(oracle.wallet.lightningService, params);
  assert.deepEqual(app.requests[0].input, oracle.requests[0].input); // Original SDK wire data, fee and invoice.
  assert.deepEqual(Object.keys(app.requests[0].rpcOptions), ['metadata']);
  assert.equal(app.requests[0].rpcOptions.metadata.get('x-idempotency-key'), 'synthetic-idempotency');
  assert.equal(app.requests[0].rpcOptions.metadata.get('x-idempotency-key'), oracle.requests[0].rpcOptions.metadata.get('x-idempotency-key'));
  await assert.rejects(app.wallet.lightningService.swapNodesForPreimage(params), /already consumed/);
  assert.equal(app.requests.length, 1);
});

test('primary failure cancels auxiliary preparation and observes a late network failure without signing', async () => {
  for (const fail of [false, true]) {
    const commitmentGate = gate(); const app = fixture({ packageError: true, commitmentGate, commitmentError: fail });
    await assert.rejects(app.prepare([leaf('a')]), /package failure/);
    commitmentGate.resolve(); await flush();
    assert.equal(app.prepared.length, 0); assert.equal(app.requests.length, 0);
  }
});

test('auxiliary commitment/signing errors propagate through the SDK without sending or retrying signatures', async () => {
  for (const option of ['commitmentError', 'signError']) {
    const app = fixture({ [option]: true }); const leaves = [leaf('a')];
    const request = await app.prepare(leaves);
    await assert.rejects(app.wallet.lightningService.swapNodesForPreimage(app.params(leaves, request)));
    assert.equal(app.requests.length, 0);
    assert.equal(app.events.filter(event => event.startsWith('commitments:')).length, 1);
  }
});

test('cleanup stops delayed preparation and blocks outbound submission of a ready package', async () => {
  const commitmentGate = gate(); const app = fixture({ commitmentGate }); const leaves = [leaf('a')];
  const request = await app.prepare(leaves);
  app.pipeline.close(); commitmentGate.resolve(); await flush();
  assert.equal(app.prepared.length, 0);
  await assert.rejects(app.wallet.lightningService.swapNodesForPreimage(app.params(leaves, request)), /closed/);
  await assert.rejects(app.prepare(leaves), /closed/);
  assert.equal(app.requests.length, 0);
});

test('changed payment hash, recipient, transfer ID, leaf array or transaction cannot reuse prepared signatures', async () => {
  for (const change of [p => { p.paymentHash = new Uint8Array(32).fill(8); },
    p => { p.receiverIdentityPubkey = new Uint8Array(33).fill(8); }, p => { p.transferID = 'different'; },
    p => { p.leaves = [...p.leaves]; }, p => { p.leaves[0].leaf.refundTx = Uint8Array.of(42); },
    p => { p.isInboundPayment = true; }]) {
    const app = fixture(); const leaves = [leaf('a')]; const request = await app.prepare(leaves);
    await flush(); const params = app.params(leaves, request); change(params);
    await assert.rejects(app.wallet.lightningService.swapNodesForPreimage(params));
    assert.equal(app.requests.length, 0);
  }
});

test('simultaneous transfers retain separate fresh commitments and their original SDK request association', async () => {
  const app = fixture(); const left = [leaf('left')], right = [leaf('right')];
  const [a, b] = await Promise.all([app.prepare(left, 'left-transfer'), app.prepare(right, 'right-transfer')]);
  await Promise.all([app.wallet.lightningService.swapNodesForPreimage(app.params(right, b, 'right-transfer')),
    app.wallet.lightningService.swapNodesForPreimage(app.params(left, a, 'left-transfer'))]);
  assert.equal(app.calls.length, 2); assert.equal(app.prepared.length, 2); assert.equal(app.requests.length, 2);
  const nonceIds = app.calls.flatMap(call => call.response.signingCommitments.map(item => item.signingNonceCommitments.operator.syntheticNonce));
  assert.equal(new Set(nonceIds).size, 6);
  for (const request of app.requests) assert.equal(request.input.transfer.leavesToSend[0].leafId + '-transfer', request.input.transfer.transferId);
});

test('unsupported key derivations and calls without a prepared package retain the original SDK path', async () => {
  const app = fixture(); const leaves = [leaf('a')]; leaves[0].keyDerivation = { type: KeyDerivationType.DEPOSIT };
  const request = await app.prepare(leaves); assert.equal(app.calls.length, 0);
  await app.wallet.lightningService.swapNodesForPreimage(app.params(leaves, request));
  assert.equal(app.calls.length, 1); assert.equal(app.requests.length, 1);
});

test('bounded auxiliary work does not start a fifth speculative preparation', async () => {
  const app = fixture();
  for (let i = 0; i < 5; i++) await app.prepare([leaf('leaf-' + i)], 'transfer-' + i);
  await flush(); assert.equal(app.calls.length, 4); assert.equal(app.requests.length, 0);
  app.pipeline.close();
});

test('incomplete operator commitments fail before local signing or outbound submission', async () => {
  const app = fixture({ incomplete: true }); const leaves = [leaf('a')];
  const request = await app.prepare(leaves);
  await assert.rejects(app.wallet.lightningService.swapNodesForPreimage(app.params(leaves, request)));
  assert.equal(app.prepared.length, 0); assert.equal(app.requests.length, 0);
});
