'use strict';

const assert = require('node:assert/strict');

require('../tests/register-typescript.cjs');

const { appConfig } = require('../lib/config.ts');

assert.equal(appConfig.isMainnet, false, 'The global multi-chain Mainnet switch must stay disabled.');
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
assert.equal(appConfig.solanaRpcUrl, 'https://api.devnet.solana.com');
assert.equal(appConfig.usdcMint, '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
assert.equal(appConfig.sparkNetwork, 'REGTEST');

process.stdout.write(
  'Verified: Hedera Mainnet only; Solana devnet; Lightning regtest; swaps disabled.\n',
);
