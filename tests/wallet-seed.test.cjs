'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const bip39 = require('bip39');
const { DefaultSparkSigner } = require('@buildonspark/spark-sdk');
const { derivePath } = require('ed25519-hd-key');
const { PrivateKey } = require('@hiero-ledger/sdk');
require('./register-typescript.cjs');
const { deriveWalletSeed, normalizeRecoveryMnemonic } = require('../lib/wallet-seed.ts');
const { deriveHederaPrivateKeyFromSeed, HEDERA_DERIVATION_PATH } = require('../lib/wallet-keys.ts');

function loadWithMocks(file, deps) {
  const exported = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    assert.ok(name in deps, 'Missing test dependency: ' + name);
    return deps[name];
  }, exported);
  return exported;
}

test('shared seed preserves Hedera signing and every Spark signing-key family for all phrase lengths', async () => {
  for (const bytes of [16, 20, 24, 28, 32]) {
    const mnemonic = bip39.entropyToMnemonic(Buffer.alloc(bytes, 0x42));
    const seed = await deriveWalletSeed(mnemonic);
    const oldSeed = bip39.mnemonicToSeedSync(mnemonic);
    assert.deepEqual(Buffer.from(seed), oldSeed);
    const oldKey = PrivateKey.fromBytesED25519(derivePath(HEDERA_DERIVATION_PATH, oldSeed.toString('hex')).key);
    const newKey = deriveHederaPrivateKeyFromSeed(seed);
    assert.equal(newKey.publicKey.toStringRaw(), oldKey.publicKey.toStringRaw());
    const message = new Uint8Array([1, 2, 3, 4]);
    assert.deepEqual(newKey.sign(message), oldKey.sign(message));
    const oldSigner = new DefaultSparkSigner();
    const newSigner = new DefaultSparkSigner();
    // 1 is the installed SDK's unchanged MAINNET default account number.
    const fromPhrase = await oldSigner.mnemonicToSeed(mnemonic);
    assert.equal(await newSigner.createSparkWalletFromSeed(seed, 1), await oldSigner.createSparkWalletFromSeed(fromPhrase, 1));
    for (const name of ['identityKey', 'signingKey', 'depositKey', 'staticDepositKey', 'htlcPreimageKey']) {
      assert.deepEqual(newSigner[name].privateKey, oldSigner[name].privateKey, name);
    }
    seed.fill(0);
    oldSeed.fill(0);
    fromPhrase.fill(0);
    // Wiping temporary derivation buffers must not wipe the SDK's actual key.
    assert.ok(newKey.publicKey.verify(message, newKey.sign(message)));
  }
});

test('seed derivation validates and normalizes before calling crypto; malformed output is erased', async () => {
  let calls = 0;
  const phrase = 'abandon '.repeat(11) + 'about';
  const seed = await deriveWalletSeed('  ' + phrase.toUpperCase().replaceAll(' ', '\n ') + ' ', async normalized => {
    calls++;
    assert.equal(normalized, phrase);
    return new Uint8Array(64).fill(7);
  });
  assert.equal(calls, 1);
  assert.equal(seed[0], 7);
  await assert.rejects(deriveWalletSeed('invalid phrase', async () => { calls++; }), /valid BIP39/);
  assert.equal(calls, 1);
  const malformed = new Uint8Array(32).fill(9);
  await assert.rejects(deriveWalletSeed(phrase, async () => malformed), /valid wallet seed/);
  assert.ok(malformed.every(byte => byte === 0));
  assert.throws(() => deriveHederaPrivateKeyFromSeed(new Uint8Array(32)), /Invalid BIP39 seed/);
  assert.throws(() => deriveHederaPrivateKeyFromSeed(seed, 2), /Unsupported/);
  assert.throws(() => normalizeRecoveryMnemonic('abandon '.repeat(12)), /valid BIP39/);
});

test('Android seed bridge validates bytes, wipes the bridge array and fails closed', async () => {
  let result = Array(64).fill(27);
  const load = () => loadWithMocks('lib/wallet-seed-native.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-modules-core': { requireNativeModule: name => {
      assert.equal(name, 'OpagoWalletCrypto');
      return { deriveSeed: async () => result };
    } },
    './wallet-seed': { deriveWalletSeed },
  });
  const bridge = load();
  const phrase = 'abandon '.repeat(11) + 'about';
  const seed = await bridge.deriveAuthenticatedWalletSeed(phrase);
  assert.ok(seed.every(byte => byte === 27));
  assert.ok(result.every(byte => byte === 0));
  result = Array(64).fill(0); result[2] = 256;
  await assert.rejects(bridge.deriveAuthenticatedWalletSeed(phrase), /valid wallet seed/);
  assert.ok(result.every(byte => byte === 0));
  const missing = loadWithMocks('lib/wallet-seed-native.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-modules-core': { requireNativeModule: () => { throw new Error('Native module missing'); } },
    './wallet-seed': { deriveWalletSeed },
  });
  await assert.rejects(missing.deriveAuthenticatedWalletSeed(phrase), /Native module missing/);
});

test('non-Android keeps the same async BIP39 seed without requesting an Android module', async () => {
  const bridge = loadWithMocks('lib/wallet-seed-native.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-modules-core': { requireNativeModule: () => { throw new Error('Must not load'); } },
    './wallet-seed': { deriveWalletSeed },
  });
  const phrase = 'abandon '.repeat(11) + 'about';
  assert.deepEqual(Buffer.from(await bridge.deriveAuthenticatedWalletSeed(phrase)), bip39.mnemonicToSeedSync(phrase));
});

function sparkFixture(initialize) {
  const synced = [];
  const exported = loadWithMocks('lib/spark.ts', {
    './config': { appConfig: { sparkNetwork: 'MAINNET' } },
    './display-spark-balance': { markSparkWalletSynchronized: wallet => synced.push(wallet) },
    './spark-bitcoin-wallet': { BitcoinSparkWallet: { initialize } },
    './spark-signer-native': { createSparkSigner: () => new DefaultSparkSigner() },
    './spark-send-timing': { attachSparkSendTiming() {} },
  });
  return { ...exported, synced };
}

test('Spark receives an owned seed with unchanged network/default account and erases it after startup', async () => {
  let sdkSeed, finish;
  const wallet = { getSparkAddress: async () => 'synthetic-address' };
  const fixture = sparkFixture(options => {
    assert.deepEqual(options.options, { network: 'MAINNET' });
    assert.equal(options.accountNumber, undefined);
    assert.ok(options.signer instanceof DefaultSparkSigner);
    sdkSeed = options.mnemonicOrSeed;
    return new Promise(resolve => { finish = () => resolve({ wallet }); });
  });
  const source = new Uint8Array(64).fill(12);
  const pending = fixture.initializeSparkWallet(source);
  source.fill(0); // Simulate the session invalidating its retry input during startup.
  assert.ok(sdkSeed.every(byte => byte === 12));
  finish();
  assert.equal(await pending, wallet);
  assert.ok(sdkSeed.every(byte => byte === 0));
  assert.deepEqual(fixture.synced, [wallet]);
});

test('Spark erases its owned seed on failure and disposes an incomplete wallet', async () => {
  let sdkSeed, cleanups = 0;
  const source = new Uint8Array(64).fill(8);
  const rejected = sparkFixture(async options => { sdkSeed = options.mnemonicOrSeed; throw new Error('Startup failed'); });
  await assert.rejects(rejected.initializeSparkWallet(source), /Startup failed/);
  assert.ok(sdkSeed.every(byte => byte === 0));
  assert.ok(source.every(byte => byte === 8)); // Retry input still belongs to the caller.
  const incomplete = sparkFixture(async options => {
    sdkSeed = options.mnemonicOrSeed;
    return { wallet: {
      getSparkAddress: async () => { throw new Error('Address failed'); },
      cleanupConnections: async () => { cleanups++; },
    } };
  });
  await assert.rejects(incomplete.initializeSparkWallet(source), /Address failed/);
  assert.equal(cleanups, 1);
  assert.ok(sdkSeed.every(byte => byte === 0));
  assert.deepEqual(incomplete.synced, []);
});
