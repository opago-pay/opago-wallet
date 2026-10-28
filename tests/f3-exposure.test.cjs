'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');

test('F3 is visible in EAS builds while Hedera Mainnet remains disabled', () => {
  const eas = JSON.parse(read('eas.json'));
  for (const name of ['development', 'preview', 'mainnet-candidate', 'production']) {
    const env = eas.build[name].env;
    assert.equal(env.EXPO_PUBLIC_OPAGO_F3_ENABLED, 'true', name);
    assert.equal(env.EXPO_PUBLIC_ENABLE_HEDERA_MAINNET, 'false', name);
    assert.equal(env.EXPO_PUBLIC_HEDERA_NETWORK, 'testnet', name);
    assert.equal(env.EXPO_PUBLIC_HEDERA_BUILD_PROFILE, 'testnet', name);
  }
  assert.equal(eas.build['production-apk'].extends, 'production');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_ENABLE_MAINNET, 'false');
});

test('live backend inspection is exposed without replacing account or wallet authentication', () => {
  const screen = read('components/opago/public-account-screen.tsx');
  const bootstrap = read('lib/opago/bootstrap-native.ts');
  const runtime = read('lib/opago/runtime-native.ts');
  assert.match(screen, /label="Check wallet backend"/);
  assert.match(screen, /getF3Runtime\(start\.sparkWallet, start\.hederaPublicKey\)/);
  assert.match(screen, /wallet_session_contract_pending/);
  assert.match(screen, /label="Transaction synchronization"/);
  assert.match(bootstrap, /throw new OpagoError\('wallet_session_contract_pending'\)/);
  assert.match(runtime, /if \(!nativeF3Enabled\(\)\)/);
  assert.match(runtime, /transactionSyncPort/);
  assert.match(runtime, /onchainSyncPort/);
});
