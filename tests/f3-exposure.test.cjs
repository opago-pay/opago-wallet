'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');

test('F3 is visible in the existing EAS build profiles', () => {
  const eas = JSON.parse(read('eas.json'));
  for (const name of ['development', 'preview', 'mainnet-candidate', 'production']) {
    const env = eas.build[name].env;
    assert.equal(env.EXPO_PUBLIC_OPAGO_F3_ENABLED, 'true', name);
  }
  assert.equal(eas.build['production-apk'].extends, 'production');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_ENABLE_MAINNET, 'false');
});

test('live backend inspection is exposed without replacing account or wallet authentication', () => {
  const screen = read('components/opago/public-account-screen.tsx');
  const bootstrap = read('lib/opago/bootstrap-native.ts');
  const runtime = read('lib/opago/runtime-native.ts');
  assert.match(screen, /label=\{t\('Check wallet backend'\)\}/);
  assert.match(screen, /getF3Runtime\(start\.sparkWallet, start\.hederaPublicKey\)/);
  assert.match(screen, /wallet_session_contract_pending/);
  assert.match(screen, /label=\{t\('Transaction synchronization'\)\}/);
  assert.match(bootstrap, /throw new OpagoError\('wallet_session_contract_pending'\)/);
  assert.match(runtime, /if \(!nativeF3Enabled\(\)\)/);
  assert.match(runtime, /transactionSyncPort/);
  assert.match(runtime, /onchainSyncPort/);
});

test('wallet backend diagnostics distinguish missing sessions and startup failures from verified binding', () => {
  const screen = read('components/opago/public-account-screen.tsx');
  const startup = screen.indexOf('if (runtime.startupError)');
  const session = screen.indexOf('else if (!runtime.account.state.session)');
  const binding = screen.indexOf("runtime.account.state.wallet?.party_id");
  assert.ok(startup > 0 && startup < session && session < binding,
    'startup and missing-session states must be checked before wallet binding results');
  assert.match(screen, /Wallet session refresh failed\. The backend binding status is unknown\./);
  assert.match(screen, /No verified wallet session is available\./);
  assert.match(screen, /OPAGO wallet binding returned an account-linked wallet/);
  const runtime = read('lib/opago/runtime-native.ts');
  assert.match(runtime, /startupError = testOnly \? undefined : await account\.refreshAfterLoad\(\)/);
  assert.match(runtime, /return \{ account, uma, pos, testOnly, transactionSyncPort, onchainSyncPort:.*startupError/);
});
