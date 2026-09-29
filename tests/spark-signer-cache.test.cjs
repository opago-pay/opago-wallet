'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const sdk = require('@buildonspark/spark-sdk');
const { secp256k1 } = require('@noble/curves/secp256k1');
require('./register-typescript.cjs');
const { PaymentScopedSparkSigner } = require('../lib/spark-signer-cache.ts');
const { BitcoinSparkWallet } = require('../lib/spark-bitcoin-wallet.ts');
const leaf = path => ({ type: sdk.KeyDerivationType.LEAF, path });
async function signerFixture() {
  const signer = new PaymentScopedSparkSigner();
  await signer.createSparkWalletFromSeed(new Uint8Array(64).fill(0x29), 1);
  return signer;
}
async function countDerivations(run) {
  const original = sdk.DefaultSparkSigner.prototype.getSigningPrivateKeyFromDerivation;
  let count = 0;
  sdk.DefaultSparkSigner.prototype.getSigningPrivateKeyFromDerivation = function (...args) { count++; return original.apply(this, args); };
  try { await run(() => count); }
  finally { sdk.DefaultSparkSigner.prototype.getSigningPrivateKeyFromDerivation = original; }
}

test('repeated public-key and FROST preparation reuses one derivation within a send', async () => {
  const signer = await signerFixture();
  const derivation = leaf('synthetic-leaf');
  const expected = await signer.getPublicKeyFromDerivation(derivation);
  let cacheOwned;
  await countDerivations(async count => {
    await signer.withSendKeyCache(async () => {
      for (let i = 0; i < 3; i++) {
        const publicKey = await signer.getPublicKeyFromDerivation(derivation);
        assert.deepEqual(publicKey, expected);
        const params = await signer.buildSignFrostParams({
          message: new Uint8Array(32).fill(11), keyDerivation: derivation, publicKey,
          verifyingKey: publicKey, selfCommitment: await signer.getRandomSigningCommitment(),
        });
        assert.deepEqual(secp256k1.getPublicKey(params.keyPackage.secretKey), expected);
      }
      assert.equal(count(), 1); // previously public key + each signing job derive again
      cacheOwned = [...signer.sendCache.privateKeys.values()][0];
    });
    assert.ok(cacheOwned.every(byte => byte === 0));
    assert.equal(signer.sendCache, null);
    await signer.getPublicKeyFromDerivation(derivation);
    assert.equal(count(), 2); // no persistence outside this SDK send
  });
});

test('static and encrypted key families preserve original keys; random keys/nonces stay fresh', async () => {
  const signer = await signerFixture();
  const cipher = await sdk.getSparkFrost().encryptEcies(new Uint8Array(32).fill(0x37), await signer.getIdentityPublicKey());
  const derivations = [leaf('synthetic-a'), leaf('synthetic-b'), { type: sdk.KeyDerivationType.STATIC_DEPOSIT, path: 2 },
    { type: sdk.KeyDerivationType.ECIES, path: cipher }];
  const expected = await Promise.all(derivations.map(value => signer.getPublicKeyFromDerivation(value)));
  await countDerivations(async count => {
    await signer.withSendKeyCache(async () => {
      for (let index = 0; index < derivations.length; index++) {
        assert.deepEqual(await signer.getPublicKeyFromDerivation(derivations[index]), expected[index]);
        assert.deepEqual(await signer.getPublicKeyFromDerivation(derivations[index]), expected[index]);
      }
      assert.equal(count(), derivations.length);
      const random = { type: sdk.KeyDerivationType.RANDOM };
      assert.notDeepEqual(await signer.getPublicKeyFromDerivation(random), await signer.getPublicKeyFromDerivation(random));
      const a = await signer.getRandomSigningCommitment(), b = await signer.getRandomSigningCommitment();
      assert.notDeepEqual(a.commitment, b.commitment);
      assert.notDeepEqual(signer.getNonceForSelfCommitment(a), signer.getNonceForSelfCommitment(b));
    });
  });
});

test('returned keys cannot mutate the cache and clearing it cannot wipe an active signing input', async () => {
  const signer = await signerFixture();
  await signer.withSendKeyCache(async () => {
    const first = await signer.getSigningPrivateKeyFromDerivation(leaf('synthetic-leaf'));
    const expected = new Uint8Array(first);
    first.fill(0);
    const copy = await signer.getSigningPrivateKeyFromDerivation(leaf('synthetic-leaf'));
    assert.deepEqual(copy, expected);
    const owned = [...signer.sendCache.privateKeys.values()][0];
    signer.clearSendKeyCache();
    assert.ok(owned.every(byte => byte === 0));
    assert.deepEqual(copy, expected);
    assert.deepEqual(await signer.getSigningPrivateKeyFromDerivation(leaf('synthetic-leaf')), expected);
    assert.equal(signer.sendCache, null);
  });
});

test('throw/reinitialization/overlapping scopes erase copies without crossing wallets', async () => {
  const signer = await signerFixture(); let owned;
  await assert.rejects(signer.withSendKeyCache(async () => {
    await signer.getPublicKeyFromDerivation(leaf('synthetic-leaf'));
    owned = [...signer.sendCache.privateKeys.values()][0];
    throw Error('Synthetic failure');
  }), /Synthetic failure/);
  assert.ok(owned.every(byte => byte === 0));
  let finishInner; const wait = new Promise(resolve => { finishInner = resolve; });
  let inner;
  await signer.withSendKeyCache(async () => {
    await signer.getPublicKeyFromDerivation(leaf('synthetic-leaf'));
    inner = signer.withSendKeyCache(() => wait);
  });
  assert.ok(signer.sendCache);
  finishInner(); await inner; assert.equal(signer.sendCache, null);
  await signer.withSendKeyCache(async () => {
    const before = await signer.getPublicKeyFromDerivation(leaf('synthetic-leaf'));
    owned = [...signer.sendCache.privateKeys.values()][0];
    await signer.createSparkWalletFromSeed(new Uint8Array(64).fill(0x61), 1);
    assert.ok(owned.every(byte => byte === 0));
    assert.notDeepEqual(await signer.getPublicKeyFromDerivation(leaf('synthetic-leaf')), before);
  });
});

test('cache is bounded and late derivations after cleanup cannot refill it', async () => {
  const signer = await signerFixture();
  await signer.withSendKeyCache(async () => {
    for (let index = 0; index < 132; index++) await signer.getPublicKeyFromDerivation(leaf('synthetic-' + index));
    assert.equal(signer.sendCache.privateKeys.size, 128);
    assert.equal(signer.sendCache.publicKeys.size, 128);
  });
  const original = sdk.DefaultSparkSigner.prototype.getSigningPrivateKeyFromDerivation;
  let release; const gate = new Promise(resolve => { release = resolve; });
  sdk.DefaultSparkSigner.prototype.getSigningPrivateKeyFromDerivation = async function (derivation) {
    await gate; return original.call(this, derivation);
  };
  try {
    const result = signer.withSendKeyCache(() => signer.getPublicKeyFromDerivation(leaf('synthetic-late')));
    signer.clearSendKeyCache(); release();
    const publicKey = await result;
    assert.equal(publicKey.length, 33);
    assert.equal(signer.sendCache, null);
  } finally { sdk.DefaultSparkSigner.prototype.getSigningPrivateKeyFromDerivation = original; }
});

test('wallet scopes the cache around SDK submission and clears it when connections close', async () => {
  const signer = await signerFixture();
  const oldPay = sdk.SparkWallet.prototype.payLightningInvoice;
  const oldClose = sdk.SparkWallet.prototype.cleanupConnections;
  // The inherited methods may live higher in the prototype chain.
  const hadPay = Object.hasOwn(sdk.SparkWallet.prototype, 'payLightningInvoice');
  const hadClose = Object.hasOwn(sdk.SparkWallet.prototype, 'cleanupConnections');
  let finish; const gate = new Promise(resolve => { finish = resolve; });
  const result = { preimage: 'synthetic-only' };
  sdk.SparkWallet.prototype.payLightningInvoice = async function (input) {
    assert.equal(input.invoice, 'synthetic-only');
    assert.ok(this.config.signer.sendCache);
    await signer.getPublicKeyFromDerivation(leaf('synthetic-leaf'));
    await gate; return result;
  };
  sdk.SparkWallet.prototype.cleanupConnections = async function () { assert.equal(this.config.signer.sendCache, null); };
  try {
    const wallet = new BitcoinSparkWallet({ network: 'MAINNET' }, signer);
    const pending = wallet.payLightningInvoice({ invoice: 'synthetic-only', maxFeeSats: 1 });
    await new Promise(resolve => setImmediate(resolve));
    const owned = [...signer.sendCache.privateKeys.values()][0];
    await wallet.cleanupConnections();
    assert.ok(owned.every(byte => byte === 0));
    finish(); assert.equal(await pending, result);
    assert.equal(signer.sendCache, null);
  } finally {
    if (hadPay) sdk.SparkWallet.prototype.payLightningInvoice = oldPay; else delete sdk.SparkWallet.prototype.payLightningInvoice;
    if (hadClose) sdk.SparkWallet.prototype.cleanupConnections = oldClose; else delete sdk.SparkWallet.prototype.cleanupConnections;
  }
});
