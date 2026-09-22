'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sdk = require('@buildonspark/spark-sdk');
const { secp256k1 } = require('@noble/curves/secp256k1');
const kotlinBytes = bytes => Array.from(bytes, byte => byte > 127 ? byte - 256 : byte);
require('./register-typescript.cjs');

// Synthetic keys only. The bridge double uses the SDK's original JS primitive
// as a correctness oracle; these tests are not Android latency measurements.
function fixture({ os = 'android', bridge, nonceFactory } = {}) {
  const calls = [];
  const native = bridge ?? {
    async getPublicKey(params) {
      calls.push(params);
      assert.equal(params.compressed, true);
      return kotlinBytes(secp256k1.getPublicKey(Uint8Array.from(params.privateKey), true));
    },
    async batchGetPublicKeys(params) {
      calls.push(params);
      assert.equal(params.compressed, true);
      return params.privateKeys.map(key => kotlinBytes(secp256k1.getPublicKey(Uint8Array.from(key), true)));
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../lib/spark-signer-native.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exported = {};
  new Function('require', 'exports', code)(name => {
    if (name === '@buildonspark/spark-sdk') return nonceFactory ? { ...sdk, getRandomSigningNonce: nonceFactory } : sdk;
    if (name === 'react-native') return { Platform: { OS: os }, NativeModules: { SparkFrostModule: native } };
    if (name === './spark-signer-cache') return require('../lib/spark-signer-cache.ts');
    throw Error('Unexpected dependency: ' + name);
  }, exported);
  return { signer: exported.createSparkSigner(), calls };
}

async function initialize(signer) {
  return signer.createSparkWalletFromSeed(new Uint8Array(64).fill(0x42), 1);
}

test('native public scalar multiplication matches the original curve primitive without wallet keys', async () => {
  const { signer } = fixture();
  for (const marker of [1, 9, 128, 254]) {
    const scalar = new Uint8Array(32).fill(marker);
    assert.deepEqual(await signer.getPublicKeyForPublicScalar(scalar), secp256k1.getPublicKey(scalar));
  }
  await assert.rejects(signer.getPublicKeyForPublicScalar(new Uint8Array(31)));
  const failed = fixture({ bridge: { getPublicKey: async () => { throw Error('Synthetic internal failure'); }, batchGetPublicKeys: async () => [] } });
  await assert.rejects(failed.signer.getPublicKeyForPublicScalar(new Uint8Array(32).fill(1)), /^Error: Native public-point calculation failed\.$/);
});

test('Android signer keeps every deterministic SDK key family and identity signatures', async () => {
  const { signer, calls } = fixture();
  const original = new sdk.DefaultSparkSigner();
  assert.equal(await initialize(signer), await initialize(original));
  for (const derivation of [
    { type: sdk.KeyDerivationType.DEPOSIT },
    { type: sdk.KeyDerivationType.LEAF, path: 'synthetic-leaf-a' },
    { type: sdk.KeyDerivationType.LEAF, path: 'synthetic-leaf-b' },
    { type: sdk.KeyDerivationType.STATIC_DEPOSIT, path: 0 },
    { type: sdk.KeyDerivationType.STATIC_DEPOSIT, path: 123 },
  ]) {
    const expected = await original.getPublicKeyFromDerivation(derivation);
    assert.deepEqual(await signer.getPublicKeyFromDerivation(derivation), expected);
    assert.deepEqual(await signer.getPublicKeyFromDerivation(derivation), expected);
  }
  const message = new Uint8Array(32).fill(0x17);
  assert.deepEqual(await signer.signMessageWithIdentityKey(message, true), await original.signMessageWithIdentityKey(message, true));
  assert.deepEqual(await signer.getDepositSigningKey(), await original.getDepositSigningKey());
  assert.ok(calls.every(call => call.privateKey.every(byte => byte === 0)));
});

test('native path also preserves ECIES derivation and creates fresh random keys', async () => {
  const { signer } = fixture();
  const original = new sdk.DefaultSparkSigner();
  await initialize(signer);
  await initialize(original);
  const cipher = await sdk.getSparkFrost().encryptEcies(new Uint8Array(32).fill(0x37), await signer.getIdentityPublicKey());
  const derivation = { type: sdk.KeyDerivationType.ECIES, path: cipher };
  assert.deepEqual(await signer.getPublicKeyFromDerivation(derivation), await original.getPublicKeyFromDerivation(derivation));
  assert.notDeepEqual(await signer.getPublicKeyFromDerivation({ type: sdk.KeyDerivationType.RANDOM }),
    await signer.getPublicKeyFromDerivation({ type: sdk.KeyDerivationType.RANDOM }));
});

test('Android reuses a deterministic native result only within the active send', async () => {
  const { signer, calls } = fixture();
  await initialize(signer);
  const derivation = { type: sdk.KeyDerivationType.LEAF, path: 'synthetic-cached-leaf' };
  await signer.withSendKeyCache(async () => {
    const first = await signer.getPublicKeyFromDerivation(derivation);
    assert.deepEqual(await signer.getPublicKeyFromDerivation(derivation), first);
    assert.deepEqual(await signer.getPublicKeyFromDerivation(derivation), first);
    assert.equal(calls.length, 1);
  });
  await signer.getPublicKeyFromDerivation(derivation);
  assert.equal(calls.length, 2);
});

test('each commitment has fresh SDK nonces and uses the SDK FROST nonce lookup', async () => {
  const { signer, calls } = fixture();
  await initialize(signer);
  const commitments = await Promise.all(Array.from({ length: 6 }, () => signer.getRandomSigningCommitment()));
  const seen = new Set();
  for (const commitment of commitments) {
    assert.deepEqual(Object.keys(commitment), ['commitment']);
    const nonce = signer.getNonceForSelfCommitment(commitment);
    assert.ok(nonce);
    assert.deepEqual(commitment.commitment, sdk.getSigningCommitmentFromNonce(nonce));
    for (const key of [nonce.binding, nonce.hiding]) {
      const hex = Buffer.from(key).toString('hex');
      assert.equal(seen.has(hex), false);
      seen.add(hex);
    }
    const keyDerivation = { type: sdk.KeyDerivationType.LEAF, path: 'synthetic-signing-leaf' };
    const publicKey = await signer.getPublicKeyFromDerivation(keyDerivation);
    const params = await signer.buildSignFrostParams({
      message: new Uint8Array(32).fill(11), keyDerivation, publicKey,
      verifyingKey: publicKey, selfCommitment: commitment,
    });
    assert.equal(params.nonce, nonce);
    assert.deepEqual(secp256k1.getPublicKey(params.keyPackage.secretKey), publicKey);
  }
  assert.equal(calls.filter(call => call.privateKeys).length, 6);
  assert.ok(calls.every(call => (call.privateKeys ?? [call.privateKey]).every(key => key.every(byte => byte === 0))));
});

test('malformed native key results fail closed and erase bridge copies without erasing SDK keys', async () => {
  for (const result of [null, [], Array(33).fill(0), [2, ...Array(32).fill(256)], [2, ...Array(32).fill(-129)], [3, ...Array(32).fill(0.5)]]) {
    let copy;
    const { signer } = fixture({ bridge: {
      getPublicKey: async params => { copy = params.privateKey; return result; },
      batchGetPublicKeys: async () => { throw Error('Not used'); },
    } });
    await initialize(signer);
    const before = await signer.getDepositSigningKey();
    await assert.rejects(signer.getPublicKeyFromDerivation({ type: sdk.KeyDerivationType.DEPOSIT }), /Native Spark public-key calculation failed/);
    assert.ok(copy.every(byte => byte === 0));
    assert.deepEqual(await signer.getDepositSigningKey(), before);
  }
});

test('failed commitment generation discards both nonces and never registers or retries them', async () => {
  for (const result of [null, [], [[2]], [Array(33).fill(2), [3]], [Array(33).fill(2)]]) {
    const nonce = sdk.getRandomSigningNonce();
    let copy;
    const { signer } = fixture({ nonceFactory: () => nonce, bridge: {
      getPublicKey: async () => { throw Error('Not used'); },
      batchGetPublicKeys: async params => { copy = params.privateKeys; return result; },
    } });
    await assert.rejects(signer.getRandomSigningCommitment(), /Native Spark commitment calculation failed/);
    assert.equal(signer.commitmentToNonceMap.size, 0);
    assert.ok([nonce.binding, nonce.hiding, ...copy].every(key => key.every(byte => byte === 0)));
  }
});

test('native errors never include native error text or private input and do not fall back', async () => {
  let attempts = 0;
  const { signer } = fixture({ bridge: {
    getPublicKey: async () => { attempts++; throw Error('synthetic-secret-native-error'); },
    batchGetPublicKeys: async () => { attempts++; throw Error('synthetic-secret-native-error'); },
  } });
  await initialize(signer);
  await assert.rejects(signer.getPublicKeyFromDerivation({ type: sdk.KeyDerivationType.DEPOSIT }),
    { message: 'Native Spark public-key calculation failed.' });
  await assert.rejects(signer.getRandomSigningCommitment(),
    { message: 'Native Spark commitment calculation failed.' });
  assert.equal(attempts, 2);
});

test('iOS/web and Android without the optional operations keep the default signer', async () => {
  for (const options of [{ os: 'ios' }, { os: 'web' }, { bridge: {} }, { bridge: { getPublicKey() {} } }]) {
    const { signer, calls } = fixture(options);
    assert.equal(signer.constructor, sdk.DefaultSparkSigner);
    await initialize(signer);
    assert.equal((await signer.getRandomSigningCommitment()).commitment.binding.length, 33);
    assert.equal(calls.length, 0);
  }
});
