'use strict';

const assert = require('node:assert/strict');

require('../tests/register-typescript.cjs');

const { appConfig } = require('../lib/config.ts');

// Store builds stay on Regtest/Testnet until a separate, reviewed activation change.
// A production EAS profile is not by itself authorization to activate Mainnet.
assert.equal(process.env.EXPO_PUBLIC_ENABLE_MAINNET, 'false');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET, 'false');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_HEDERA_MAINNET, 'false');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_F3, 'false');
assert.equal(appConfig.isMainnet, false);
assert.equal(appConfig.sparkNetwork, 'REGTEST');
assert.equal(appConfig.lightningBuildProfile, 'regtest');
assert.equal(appConfig.isDevelopment, false);
assert.equal(appConfig.isHederaMainnet, false);
assert.equal(appConfig.hederaNetwork, 'testnet');
assert.equal(appConfig.hederaBuildProfile, 'testnet');
assert.equal(appConfig.hederaMirrorNodeUrl, 'https://testnet.mirrornode.hedera.com');
assert.equal(appConfig.allowInsecureHttp, false);
assert.equal(appConfig.hederaCheckoutContractId, '0.0.9972670');
assert.equal(
  appConfig.hederaCheckoutRuntimeSha256,
  '18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8',
);

process.stdout.write('Verified: production build keeps Mainnet and F3 disabled on Regtest/Testnet.\n');
