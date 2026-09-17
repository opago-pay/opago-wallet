'use strict';

const assert = require('node:assert/strict');

require('../tests/register-typescript.cjs');

const { appConfig } = require('../lib/config.ts');

assert.equal(appConfig.isMainnet, true, 'Lightning Mainnet must be explicitly enabled.');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_MAINNET, 'false', 'Legacy global Mainnet flag must stay disabled.');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET, 'true');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_HEDERA_MAINNET, 'true');
assert.equal(appConfig.sparkNetwork, 'MAINNET');
assert.equal(appConfig.lightningBuildProfile, 'mainnet');
assert.equal(appConfig.maxLightningFeeSats, 100);
assert.equal(appConfig.isDevelopment, false);
assert.equal(appConfig.isHederaMainnet, true, 'Hedera Mainnet must be explicitly enabled.');
assert.equal(appConfig.hederaNetwork, 'mainnet');
assert.equal(appConfig.hederaBuildProfile, 'mainnet');
assert.equal(appConfig.hederaMirrorNodeUrl, 'https://mainnet.mirrornode.hedera.com');
assert.equal(appConfig.hederaMaxTransferHbar, '1');
assert.equal(appConfig.hederaCheckoutContractId, '0.0.10850063');
assert.equal(
  appConfig.hederaCheckoutRuntimeSha256,
  '18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8',
);
assert.equal(appConfig.allowInsecureHttp, false);

process.stdout.write('Verified: Hedera and Lightning Mainnet production profile.\n');
