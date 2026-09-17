'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require('./register-typescript.cjs');

const {
  resolveHederaBuildPolicy,
  resolveHederaMainnetEnabled,
  resolveLightningBuildPolicy,
} = require('../lib/config.ts');

test('keeps Lightning on regtest unless a matching explicit Mainnet profile is enabled', () => {
  assert.deepEqual(resolveLightningBuildPolicy('false', 'false', 'regtest'), {
    mainnetEnabled: false,
    profile: 'regtest',
    network: 'REGTEST',
  });
  assert.deepEqual(resolveLightningBuildPolicy('false', 'true', 'mainnet'), {
    mainnetEnabled: true,
    profile: 'mainnet',
    network: 'MAINNET',
  });
  assert.throws(
    () => resolveLightningBuildPolicy('false', 'true', 'regtest'),
    /requires.*profile=mainnet/i,
  );
  assert.throws(
    () => resolveLightningBuildPolicy('false', 'false', 'mainnet'),
    /requires.*profile=mainnet/i,
  );
  assert.throws(
    () => resolveLightningBuildPolicy('false', 'yes', 'mainnet'),
    /must be true or false/i,
  );
});
const {
  assertHederaMirrorNodeMatchesNetwork,
  getHederaChainId,
} = require('../lib/hedera/config.ts');
const { getHederaHashscanBaseUrl } = require('../lib/hedera/explorer.ts');

const mainnetInput = Object.freeze({
  network: 'mainnet',
  buildProfile: 'mainnet',
  mainnetEnabled: true,
  maxTransferHbar: '0.1',
  checkoutContractId: '0.0.123456',
  checkoutRuntimeSha256: 'a'.repeat(64),
});

test('uses the official Hedera testnet profile by default', () => {
  assert.deepEqual(resolveHederaBuildPolicy({ mainnetEnabled: false }), {
    network: 'testnet',
    buildProfile: 'testnet',
    mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com',
    maxTransferHbar: '1',
    checkoutContractId: '',
    checkoutRuntimeSha256: '',
  });
  assert.equal(getHederaChainId('testnet'), 296n);
  assert.equal(getHederaHashscanBaseUrl('testnet'), 'https://hashscan.io/testnet');
});

test('allows Hedera Mainnet without enabling other real-fund networks', () => {
  assert.equal(resolveHederaMainnetEnabled('false', 'true'), true);
  assert.equal(resolveHederaMainnetEnabled('false', 'false'), false);
  assert.equal(resolveHederaMainnetEnabled('true', undefined), true);
  assert.throws(() => resolveHederaMainnetEnabled('yes', 'false'), /must be true or false/i);
});

test('activates Mainnet only with an explicit matching release profile', () => {
  assert.deepEqual(resolveHederaBuildPolicy(mainnetInput), {
    network: 'mainnet',
    buildProfile: 'mainnet',
    mirrorNodeUrl: 'https://mainnet.mirrornode.hedera.com',
    maxTransferHbar: '0.1',
    checkoutContractId: '0.0.123456',
    checkoutRuntimeSha256: 'a'.repeat(64),
  });
  assert.equal(getHederaChainId('mainnet'), 295n);
  assert.equal(getHederaHashscanBaseUrl('mainnet'), 'https://hashscan.io/mainnet');
});

test('fails closed for partial Mainnet activation and network/profile mismatches', () => {
  assert.throws(
    () => resolveHederaBuildPolicy({ ...mainnetInput, mainnetEnabled: false }),
    /requires EXPO_PUBLIC_HEDERA_NETWORK=mainnet and EXPO_PUBLIC_ENABLE_HEDERA_MAINNET=true/i,
  );
  assert.throws(
    () => resolveHederaBuildPolicy({ ...mainnetInput, buildProfile: 'testnet' }),
    /build_profile must match/i,
  );
});

test('rejects a Mirror Node endpoint for the wrong Hedera network', () => {
  assert.throws(
    () =>
      resolveHederaBuildPolicy({
        ...mainnetInput,
        mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com',
      }),
    /must use the official mainnet Mirror Node origin/i,
  );
  assert.throws(
    () =>
      assertHederaMirrorNodeMatchesNetwork(
        'mainnet',
        new URL('https://testnet.mirrornode.hedera.com'),
      ),
    /does not match the configured mainnet network/i,
  );
  assert.doesNotThrow(() =>
    assertHederaMirrorNodeMatchesNetwork(
      'mainnet',
      new URL('https://mainnet.mirrornode.hedera.com'),
    ),
  );
});

test('requires a human-approved cap and pinned contract evidence for Mainnet', () => {
  const base = {
    network: 'mainnet',
    buildProfile: 'mainnet',
    mainnetEnabled: true,
  };
  assert.throws(() => resolveHederaBuildPolicy(base), /MAX_TRANSFER_HBAR is required/i);
  assert.throws(
    () => resolveHederaBuildPolicy({ ...mainnetInput, maxTransferHbar: '0' }),
    /must be a positive HBAR amount/i,
  );
  assert.throws(
    () => resolveHederaBuildPolicy({ ...base, maxTransferHbar: '0.1' }),
    /verified EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID is required/i,
  );
  assert.throws(
    () =>
      resolveHederaBuildPolicy({
        ...base,
        maxTransferHbar: '0.1',
        checkoutContractId: '0.0.123456',
      }),
    /pinned EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256 is required/i,
  );
});
