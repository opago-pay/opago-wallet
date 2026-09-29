'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { schnorr } = require('@noble/curves/secp256k1');
const { DefaultSparkSigner } = require('@buildonspark/spark-sdk');
const { createSparkInvoiceAdapter, createLnurlpSpikeServer } = require('../demo/f2-spark-lnurlp-spike.cjs');
const { invoice } = require('./lightning-invoice-fixture.cjs');
require('./register-typescript.cjs');
const { decodeLightningInvoice } = require('../lib/lightning.ts');

const receiverIdentityPubkey = '02' + '11'.repeat(32);

test('SDK signer exposes a usable Spark identity Schnorr proof over the contract hash', async () => {
  // Synthetic test seed only; this key never signs a payment or leaves the process.
  const seed = Buffer.alloc(64, 0x29);
  const signer = new DefaultSparkSigner();
  await signer.createSparkWalletFromSeed(seed, 1);
  seed.fill(0);
  const hash = createHash('sha256').update('F2 wallet proof', 'utf8').digest();
  const signature = await signer.signSchnorrWithIdentityKey(hash);
  const publicKey = await signer.getIdentityPublicKey();
  assert.equal(publicKey.length, 33);
  assert.ok(schnorr.verify(signature, hash, publicKey.subarray(1)));
  assert.equal(schnorr.verify(signature, createHash('sha256').update('wrong').digest(), publicKey.subarray(1)), false);
});

async function withServer(createInvoice, run) {
  const server = createLnurlpSpikeServer({
    alias: 'f2-test', publicOrigin: 'http://127.0.0.1:0', createInvoice,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // The origin in discovery must be the actual listening port.
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
  const active = createLnurlpSpikeServer({ alias: 'f2-test', publicOrigin: origin, createInvoice });
  await new Promise(resolve => active.listen(server.address()?.port || Number(new URL(origin).port), '127.0.0.1', resolve));
  try { await run(origin); } finally { await new Promise(resolve => active.close(resolve)); }
}

test('local LNURL-P HTTP callback passes exact metadata hash and receiver to Spark SDK adapter', async () => {
  const calls = [];
  let sequence = 0;
  const wallet = {
    async createLightningInvoice(params) {
      calls.push(params);
      sequence++;
      return { id: `request-${sequence}`, invoice: { encodedInvoice: invoice(params.amountSats, undefined, {
        descriptionHash: params.descriptionHash, paymentHash: sequence.toString(16).padStart(2, '0').repeat(32),
      }) } };
    },
  };
  await withServer(createSparkInvoiceAdapter(wallet, receiverIdentityPubkey), async origin => {
    const discovery = await (await fetch(`${origin}/.well-known/lnurlp/f2-test`)).json();
    assert.equal(discovery.tag, 'payRequest');
    assert.equal(discovery.minSendable, 1000);
    assert.equal(discovery.maxSendable, 100_000_000);
    const expectedHash = createHash('sha256').update(discovery.metadata, 'utf8').digest('hex');
    const first = await (await fetch(`${origin}/lnurlp/f2-test/callback?amount=20000`)).json();
    const second = await (await fetch(`${origin}/lnurlp/f2-test/callback?amount=20000`)).json();
    const a = decodeLightningInvoice(first.pr);
    const b = decodeLightningInvoice(second.pr);
    assert.equal(a.amountSats, 20);
    assert.equal(a.descriptionHash, expectedHash);
    assert.notEqual(a.paymentHash, b.paymentHash);
    assert.deepEqual(calls, Array.from({ length: 2 }, () => ({
      amountSats: 20, receiverIdentityPubkey, descriptionHash: expectedHash, expirySeconds: 600,
    })));
  });
});

test('invalid callbacks never ask the SDK to create an invoice; failure issues no payment request', async () => {
  let calls = 0;
  await withServer(async () => { calls++; throw new Error('simulated provider outage'); }, async origin => {
    for (const query of ['amount=1001', 'amount=0', 'amount=100000001', 'amount=20000&amount=20000']) {
      const response = await fetch(`${origin}/lnurlp/f2-test/callback?${query}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).pr, undefined);
    }
    assert.equal(calls, 0);
    const response = await fetch(`${origin}/lnurlp/f2-test/callback?amount=20000`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).pr, undefined);
    assert.equal(calls, 1);
  });
});
