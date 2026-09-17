'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../tests/register-typescript.cjs');

const { appConfig } = require('../lib/config.ts');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));

assert.equal(appConfig.isMainnet, true, 'Lightning Mainnet must be explicitly enabled.');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_MAINNET, 'false', 'Legacy global Mainnet flag must stay disabled.');
assert.equal(process.env.EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET, 'true');
assert.equal(appConfig.sparkNetwork, 'MAINNET');
assert.equal(appConfig.lightningBuildProfile, 'mainnet');
assert.equal(appConfig.maxLightningFeeSats, 100);
assert.equal(appConfig.isDevelopment, false);
assert.equal(appConfig.allowInsecureHttp, false, 'Insecure HTTP must be disabled.');
assert.equal(
  packageJson.dependencies['@buildonspark/spark-sdk'],
  '0.7.12',
  'Spark SDK must be pinned exactly.',
);
assert.equal(
  lock.packages['node_modules/@buildonspark/spark-sdk'].version,
  '0.7.12',
  'Lockfile Spark SDK must match the reviewed version.',
);

for (const name of Object.keys(process.env)) {
  assert.doesNotMatch(
    name,
    /^EXPO_PUBLIC_.*(?:PRIVATE|MNEMONIC|SEED|SECRET|PREIMAGE|KEY)$/i,
    'Client build variables must not contain secrets.',
  );
}

process.stdout.write('Verified: pinned Spark SDK with explicit Lightning Mainnet profile.\n');
