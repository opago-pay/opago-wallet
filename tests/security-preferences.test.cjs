'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('./register-typescript.cjs');
const { SecurityPreferences, SECURITY_PREFERENCES_KEY } = require('../lib/security-preferences.ts');

function isolatedModule(file, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
    return dependencies[name];
  }, exports);
  return exports;
}

test('security defaults and saved choices survive restart; failed writes do not change active policy', async () => {
  const values = new Map();
  const storage = {
    getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
  };
  const preference = new SecurityPreferences();
  await preference.initialize(storage);
  assert.deepEqual(preference.getSnapshot(), { ready: true, lockOnOpen: true, authenticatePayments: false });
  await preference.set({ lockOnOpen: false, authenticatePayments: true });
  assert.equal(values.has(SECURITY_PREFERENCES_KEY), true);
  const reopened = new SecurityPreferences();
  await reopened.initialize(storage);
  assert.deepEqual(reopened.getSnapshot(), { ready: true, lockOnOpen: false, authenticatePayments: true });
  const failing = new SecurityPreferences();
  await failing.initialize({ getItemAsync: storage.getItemAsync, setItemAsync: async () => { throw Error('write failed'); } });
  await assert.rejects(failing.set({ authenticatePayments: false }), /write failed/);
  assert.equal(failing.getSnapshot().authenticatePayments, true);
});

test('payment prompt can be disabled without bypassing the unlocked-session check', async () => {
  let locked = false;
  let prompts = 0;
  let credentialFallback = false;
  let touches = 0;
  let enabled = false;
  const session = {
    capture: () => {
      if (locked) throw Error('locked');
      return () => { if (locked) throw Error('locked'); };
    },
    touch: () => { touches++; },
  };
  const { authorizePayment } = isolatedModule('lib/payment-authorization.ts', {
    './device-authentication': { authorizeWalletAction: async (_message, options) => {
      prompts++;
      credentialFallback = options.allowDeviceCredential;
      return session.capture();
    } },
    './wallet-session': { walletSession: session },
    './security-preferences': { securityPreferences: { getSnapshot: () => ({ ready: true, authenticatePayments: enabled }) } },
  });
  const assertAllowed = await authorizePayment();
  assert.equal(prompts, 0);
  assert.equal(touches, 1);
  assertAllowed();
  locked = true;
  assert.throws(assertAllowed, /locked/);
  await assert.rejects(authorizePayment(), /locked/);
  locked = false;
  enabled = true;
  await authorizePayment();
  assert.equal(prompts, 1);
  assert.equal(credentialFallback, true);
});

test('opening-authentication changes move the phrase between distinct secure items', async () => {
  let lockOnOpen = true;
  const items = new Map([['opago.wallet.mnemonic.v2', 'synthetic test phrase']]);
  const keyFor = options => options?.keychainService ?? 'legacy';
  const secureStore = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    canUseBiometricAuthentication: () => true,
    getItemAsync: async (_key, options) => items.get(keyFor(options)) ?? null,
    setItemAsync: async (_key, value, options) => { items.set(keyFor(options), value); },
    deleteItemAsync: async (_key, options) => { items.delete(keyFor(options)); },
  };
  const storage = isolatedModule('lib/storage.ts', {
    './i18n': { t: value => value },
    'expo-secure-store': secureStore,
    'react-native': { Platform: { OS: 'ios' } },
    './auth-diagnostics': { recordAuthDiagnostic() {}, categorizeAuthFailure: () => 'unknown' },
    './security-preferences': { securityPreferences: {
      getSnapshot: () => ({ lockOnOpen }),
      set: async value => { lockOnOpen = value.lockOnOpen; },
    } },
  });
  await storage.changeOpeningAuthentication(false);
  assert.equal(lockOnOpen, false);
  assert.equal(items.get('opago.wallet.mnemonic.v2'), undefined);
  assert.equal(items.get('opago.wallet.mnemonic.quick.v1'), 'synthetic test phrase');
  assert.equal(await storage.getSecureItem(storage.MNEMONIC_STORE_KEY), 'synthetic test phrase');
  await storage.changeOpeningAuthentication(true);
  assert.equal(lockOnOpen, true);
  assert.equal(items.get('opago.wallet.mnemonic.quick.v1'), undefined);
  assert.equal(items.get('opago.wallet.mnemonic.v2'), 'synthetic test phrase');
});
