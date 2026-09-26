'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// The repository deliberately runs tests in one process. Establish the shared
// safe testnet build before this alphabetically first Hedera test loads config.
process.env.NODE_ENV = 'test';
process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP = 'true';
process.env.EXPO_PUBLIC_HEDERA_BUILD_PROFILE = 'testnet';
process.env.EXPO_PUBLIC_HEDERA_NETWORK = 'testnet';
process.env.EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR = '1';
process.env.EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID = '0.0.7777';
process.env.EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256 =
  'f3df0a62b10f205b0f29768aa3d69e777154caaa179f64aabb0a4899c666b017';
require('./register-typescript.cjs');

const {
  createHederaAccountBinding,
  getHederaAccountBindingStorageKey,
  parseHederaAccountBinding,
  serializeHederaAccountBinding,
} = require('../lib/hedera/account-binding.ts');

const PUBLIC_KEY =
  '793af21fd5a0a7cc1076195263717fab12600496dfc7ad49e902acdd0bf22331';

test('round-trips a versioned network-bound Hedera account binding', () => {
  const binding = createHederaAccountBinding({
    network: 'mainnet',
    publicKey: PUBLIC_KEY,
    accountId: '0.0.123456',
  });
  assert.deepEqual(binding, {
    schemaVersion: 1,
    network: 'mainnet',
    derivationVersion: 1,
    algorithm: 'ED25519',
    publicKey: PUBLIC_KEY,
    accountId: '0.0.123456',
  });
  assert.deepEqual(
    parseHederaAccountBinding(
      serializeHederaAccountBinding(binding),
      'mainnet',
      PUBLIC_KEY,
    ),
    binding,
  );
});

test('uses separate testnet and Mainnet account-binding storage keys', () => {
  assert.equal(
    getHederaAccountBindingStorageKey('testnet'),
    'opago.hedera.account-binding.v1.testnet',
  );
  assert.equal(
    getHederaAccountBindingStorageKey('mainnet'),
    'opago.hedera.account-binding.v1.mainnet',
  );
});

test('rejects another network, key, schema, algorithm, or unexpected field', () => {
  const binding = createHederaAccountBinding({
    network: 'mainnet',
    publicKey: PUBLIC_KEY,
    accountId: '0.0.123456',
  });
  const raw = serializeHederaAccountBinding(binding);
  assert.throws(
    () => parseHederaAccountBinding(raw, 'testnet', PUBLIC_KEY),
    /does not match this wallet build/i,
  );
  assert.throws(
    () => parseHederaAccountBinding(raw, 'mainnet', 'a'.repeat(64)),
    /another wallet key/i,
  );
  for (const mutation of [
    { ...binding, schemaVersion: 2 },
    { ...binding, derivationVersion: 2 },
    { ...binding, algorithm: 'ECDSA' },
    { ...binding, privateKey: 'must-not-be-stored' },
  ]) {
    assert.throws(
      () => parseHederaAccountBinding(JSON.stringify(mutation), 'mainnet', PUBLIC_KEY),
      /does not match this wallet build/i,
    );
  }
});

test('rejects malformed account bindings before any account can be used', () => {
  assert.throws(
    () => parseHederaAccountBinding('{', 'mainnet', PUBLIC_KEY),
    /not valid JSON/i,
  );
  assert.throws(
    () => parseHederaAccountBinding('[]', 'mainnet', PUBLIC_KEY),
    /is invalid/i,
  );
  assert.throws(
    () =>
      createHederaAccountBinding({
        network: 'mainnet',
        publicKey: PUBLIC_KEY,
        accountId: 'not-an-account',
      }),
    /0\.0\.x/i,
  );
});

test('treats cached account metadata as untrusted and wipes both network bindings', () => {
  const nativeSource = readFileSync(
    path.join(__dirname, '..', 'lib', 'hedera', 'account-binding-native.ts'),
    'utf8',
  );
  const authSource = readFileSync(
    path.join(__dirname, '..', 'hooks', 'useWalletAuth.ts'),
    'utf8',
  );
  assert.match(
    nativeSource,
    /loadHederaAccount\(binding\.accountId, normalizedPublicKey\)/,
  );
  assert.match(nativeSource, /getHederaAccountBindingStorageKey\('testnet'\)/);
  assert.match(nativeSource, /getHederaAccountBindingStorageKey\('mainnet'\)/);
  assert.doesNotMatch(nativeSource, /mnemonic|private.?key|recovery phrase/i);
  const wipeSource = readFileSync(path.join(__dirname, '..', 'lib', 'wallet-wipe-native.ts'), 'utf8');
  assert.match(authSource, /resumePendingWalletWipe\(\)/);
  assert.match(wipeSource, /clearHederaAccountBindings\(\)/);
});
