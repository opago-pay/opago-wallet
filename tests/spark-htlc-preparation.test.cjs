'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const sdk = require('@buildonspark/spark-sdk');
const { Transaction, Script, ScriptNum, p2tr, taprootListToTree } = require('@scure/btc-signer');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { hexToBytes } = require('@noble/curves/utils');
require('./register-typescript.cjs');
const { createLightningHtlcScript, installSparkHtlcPreparation } = require('../lib/spark-htlc-preparation.ts');
const { BitcoinSparkWallet } = require('../lib/spark-bitcoin-wallet.ts');
const key = number => secp256k1.getPublicKey(new Uint8Array(32).fill(number));
const sender = key(7), receiver = key(9);
const publicPoint = async scalar => secp256k1.getPublicKey(scalar);
const bytes = value => Buffer.from(value).toString('hex');

function oracleScript(hash, destination, identity, network) {
  const hashScript = Script.encode(['SHA256', hash, 'EQUALVERIFY', destination.slice(1), 'CHECKSIG']);
  const timeScript = Script.encode([ScriptNum().encode(2160n), 'CHECKSEQUENCEVERIFY', 'DROP', identity.slice(1), 'CHECKSIG']);
  return p2tr(hexToBytes('50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0'),
    taprootListToTree([{ leafVersion: 0xc0, script: hashScript }, { leafVersion: 0xc0, script: timeScript }]),
    sdk.getNetwork(network), true).script;
}

test('native public-point HTLC construction equals original p2tr across public synthetic vectors', async () => {
  for (let index = 1; index <= 32; index++) {
    const hash = new Uint8Array(32).fill(index);
    const destination = key(index), identity = key(index + 40);
    for (const network of [sdk.Network.MAINNET, sdk.Network.TESTNET, sdk.Network.REGTEST]) {
      assert.deepEqual(await createLightningHtlcScript(hash, destination, identity, publicPoint),
        oracleScript(hash, destination, identity, network));
    }
  }
});

function transaction(amount, sequence, marker) {
  const tx = new Transaction({ version: 3, allowUnknownOutputs: true });
  tx.addInput({ txid: new Uint8Array(32).fill(marker), index: 0, sequence });
  tx.addOutput({ script: Script.encode([1, sender.slice(1)]), amount: BigInt(amount) });
  return tx.toBytes();
}
function leaf(index, { amount = 2000, sequence = 1800, direct = true, destination = receiver } = {}) {
  return {
    leaf: { id: 'synthetic-' + index, nodeTx: transaction(amount, sequence, index),
      refundTx: transaction(amount, sequence, index + 1),
      directTx: direct ? transaction(amount + 123, sequence + 50, index + 2) : new Uint8Array() },
    keyDerivation: { type: sdk.KeyDerivationType.LEAF, path: 'synthetic-' + index },
    receiverIdentityPublicKey: destination,
  };
}
function fixture(Wallet = sdk.SparkWallet) {
  let calculations = 0;
  const signer = { getIdentityPublicKey: async () => sender,
    getPublicKeyForPublicScalar: async scalar => { calculations++; return publicPoint(scalar); } };
  const wallet = new Wallet({ network: 'MAINNET' }, signer); // no init, keys or network
  const calls = [];
  wallet.signingService.signRefundsInternal = async (tx, hash, input, commitments, adaptor) => {
    if (!commitments) throw Error('Invalid signing commitments');
    calls.push({ raw: bytes(tx.toBytes()), hash: bytes(hash), leaf: input.leaf.id, commitments, adaptor });
    return [{ leafId: input.leaf.id, rawTx: tx.toBytes(), userSignature: hash, marker: commitments }];
  };
  return { wallet, signer, calls, calculations: () => calculations };
}
function commitments(count) {
  return [0, 1, 2].map(group => Array.from({ length: count }, (_, index) => ({
    signingNonceCommitments: { synthetic: { marker: group * count + index } },
  })));
}

test('installed SDK oracle matches every transaction, sighash, output order and commitment association', async () => {
  for (const amount of [1, 954, 955, 956, 10000]) {
    for (const sequence of [200, 1870, (1 << 30) | 1800]) {
      const leaves = [leaf(1, { amount, sequence }), leaf(8, { amount, sequence, direct: false })];
      const args = [leaves, ...commitments(leaves.length), new Uint8Array(32).fill(amount % 255)];
      const original = fixture(), optimized = fixture(BitcoinSparkWallet);
      const expected = await original.wallet.signingService.signRefundsForLightning(...args);
      const actual = await optimized.wallet.signingService.signRefundsForLightning(...args);
      assert.deepEqual(actual, expected);
      assert.deepEqual(optimized.calls, original.calls);
      assert.equal(optimized.calculations(), 1); // five HTLC refunds, one public-point operation
    }
  }
});

test('public output reuse is scoped to hash, sender, receiver and invocation, including concurrent calls', async () => {
  const app = fixture(BitcoinSparkWallet);
  const leaves = [leaf(1), leaf(2, { destination: key(12) }), leaf(3)];
  const args = [leaves, ...commitments(3)];
  const original = fixture();
  for (const marker of [17, 18]) {
    const hash = new Uint8Array(32).fill(marker);
    assert.deepEqual(await app.wallet.signingService.signRefundsForLightning(...args, hash),
      await original.wallet.signingService.signRefundsForLightning(...args, hash));
  }
  assert.equal(app.calculations(), 4);
  const results = await Promise.all([19, 20].map(marker => app.wallet.signingService.signRefundsForLightning(
    ...args, new Uint8Array(32).fill(marker))));
  assert.notDeepEqual(results[0], results[1]);
  assert.equal(app.calculations(), 8);
  const before = app.wallet.signingService.signRefundsForLightning;
  installSparkHtlcPreparation(app.wallet.signingService, app.signer);
  assert.equal(app.wallet.signingService.signRefundsForLightning, before);
});

test('malformed native output or parameters fail before signing and do not poison another request', async () => {
  for (const response of [new Uint8Array(), new Uint8Array(33), new Uint8Array(33).fill(255)]) {
    await assert.rejects(createLightningHtlcScript(new Uint8Array(32), receiver, sender, async () => response));
  }
  await assert.rejects(createLightningHtlcScript(new Uint8Array(31), receiver, sender, publicPoint));
  await assert.rejects(createLightningHtlcScript(new Uint8Array(32), new Uint8Array(33), sender, publicPoint));
  const app = fixture();
  app.signer.getPublicKeyForPublicScalar = async () => { throw Error('Synthetic native failure'); };
  installSparkHtlcPreparation(app.wallet.signingService, app.signer);
  await assert.rejects(app.wallet.signingService.signRefundsForLightning([leaf(1)], ...commitments(1), new Uint8Array(32)), /native failure/);
  assert.equal(app.calls.length, 0);
});

test('invalid sequences, raw inputs and missing signing commitments cannot silently proceed', async () => {
  for (const input of [leaf(1, { sequence: 100 }), null, { ...leaf(1), leaf: { ...leaf(1).leaf, nodeTx: new Uint8Array([0]) } }]) {
    const original = fixture(), optimized = fixture(BitcoinSparkWallet);
    await assert.rejects(original.wallet.signingService.signRefundsForLightning([input], ...commitments(1), new Uint8Array(32)));
    await assert.rejects(optimized.wallet.signingService.signRefundsForLightning([input], ...commitments(1), new Uint8Array(32)));
    assert.equal(optimized.calls.length, 0);
  }
  const app = fixture(BitcoinSparkWallet);
  await assert.rejects(app.wallet.signingService.signRefundsForLightning([leaf(1)], [], [], [], new Uint8Array(32)), /commitments/);
});

test('unsupported signers retain the original SDK path without a global prototype override', async () => {
  const app = fixture(), other = fixture();
  const before = app.wallet.signingService.signRefundsForLightning;
  installSparkHtlcPreparation(app.wallet.signingService, {});
  assert.equal(app.wallet.signingService.signRefundsForLightning, before);
  installSparkHtlcPreparation(app.wallet.signingService, app.signer);
  assert.equal(other.wallet.signingService.signRefundsForLightning, before);
});
