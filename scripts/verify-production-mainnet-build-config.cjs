'use strict';

const assert = require('node:assert/strict');

require('../tests/register-typescript.cjs');

const { appConfig } = require('../lib/config.ts');

assert.equal(appConfig.isMainnet, true, 'Lightning Mainnet must be explicitly enabled.');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_MAINNET, 'false', 'Legacy global Mainnet flag must stay disabled.');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET, 'true');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_HEDERA_MAINNET, 'false');
assert.equal(process.env.EXPO_PUBLIC_OPAGO_F3_ENABLED, 'true', 'F3 account discovery must be visible in the production candidate.');
assert.equal(appConfig.sparkNetwork, 'MAINNET');
assert.equal(appConfig.lightningBuildProfile, 'mainnet');
assert.equal(appConfig.maxLightningFeeSats, 100);
assert.equal(appConfig.isDevelopment, false);
assert.equal(appConfig.isHederaMainnet, false, 'Hedera Mainnet must remain disabled.');
assert.equal(appConfig.hederaNetwork, 'testnet');
assert.equal(appConfig.hederaBuildProfile, 'testnet');
assert.equal(appConfig.hederaMirrorNodeUrl, 'https://testnet.mirrornode.hedera.com');
assert.equal(appConfig.hederaMaxTransferHbar, '1');
assert.equal(process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL, undefined);
assert.equal(appConfig.hederaCheckoutContractId, '0.0.9972670');
assert.equal(
  appConfig.hederaCheckoutRuntimeSha256,
  '18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8',
);
assert.equal(appConfig.allowInsecureHttp, false);
assert.equal(process.env.EXPO_PUBLIC_ENABLE_BITCOIN_MAINNET, 'true');
const { resolveOnchainPolicy } = require('../lib/onchain/policy.ts');
assert.deepEqual(resolveOnchainPolicy({network:process.env.EXPO_PUBLIC_BITCOIN_NETWORK,
  esploraUrl:process.env.EXPO_PUBLIC_BITCOIN_ESPLORA_URL,
  mainnetEnabled:process.env.EXPO_PUBLIC_ENABLE_BITCOIN_MAINNET === 'true',allowLocal:appConfig.allowInsecureHttp}),
  {network:'mainnet',esploraUrl:'https://mempool.space/api'});

process.stdout.write('Verified: Bitcoin and Lightning production networks; F3 visible; Hedera Mainnet blocked.\n');
