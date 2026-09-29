'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function isolatedModule(file, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
    return dependencies[name];
  }, exports);
  return exports;
}

function recoveryFixture(os, { protectedPhrase = null, legacyPhrase = null, failProtected = false, failAuthorization = false } = {}) {
  const calls = [];
  const module = isolatedModule('lib/recovery-access.ts', {
    'react-native': { Platform: { OS: os } },
    './device-authentication': {
      withProtectedWalletAccess: async operation => { calls.push('protected-access'); return operation(); },
      authorizeWalletAction: async () => {
        calls.push('device-authorization');
        if (failAuthorization) throw new Error('Authentication cancelled.');
        return () => calls.push('authorization-current');
      },
    },
    './storage': {
      MNEMONIC_STORE_KEY: 'synthetic-key',
      getBiometricallyProtectedMnemonic: async () => {
        calls.push('protected-read');
        if (failProtected) throw new Error('Keychain unavailable.');
        return protectedPhrase;
      },
      getSecureItem: async () => { calls.push('legacy-read'); return legacyPhrase; },
    },
    './wallet-session': { walletSession: { capture: () => () => calls.push('session-current') } },
  });
  return { ...module, calls };
}

test('an existing protected iOS phrase is revealed with one keychain authorization', async () => {
  const fixture = recoveryFixture('ios', { protectedPhrase: 'synthetic phrase' });
  assert.equal(await fixture.readRecoveryPhraseForDisplay(), 'synthetic phrase');
  assert.deepEqual(fixture.calls, ['protected-access', 'protected-read']);
});

test('legacy iOS and Android entries require explicit device authorization', async () => {
  const ios = recoveryFixture('ios', { legacyPhrase: 'legacy phrase' });
  assert.equal(await ios.readRecoveryPhraseForDisplay(), 'legacy phrase');
  assert.deepEqual(ios.calls, ['protected-access', 'protected-read', 'device-authorization',
    'authorization-current', 'protected-access', 'legacy-read', 'session-current']);
  const android = recoveryFixture('android', { legacyPhrase: 'legacy phrase' });
  assert.equal(await android.readRecoveryPhraseForDisplay(), 'legacy phrase');
  assert.equal(android.calls.includes('protected-read'), false);
  assert.equal(android.calls.includes('device-authorization'), true);
});

test('a protected keychain error or cancelled authorization never falls back to disclosing a phrase', async () => {
  const failedKeychain = recoveryFixture('ios', { failProtected: true, legacyPhrase: 'legacy phrase' });
  await assert.rejects(failedKeychain.readRecoveryPhraseForDisplay(), /Keychain unavailable/);
  assert.equal(failedKeychain.calls.includes('legacy-read'), false);
  const cancelled = recoveryFixture('ios', { failAuthorization: true, legacyPhrase: 'legacy phrase' });
  await assert.rejects(cancelled.readRecoveryPhraseForDisplay(), /cancelled/);
  assert.equal(cancelled.calls.includes('legacy-read'), false);
});

test('protected-only storage lookup cannot silently return a legacy unprotected entry', async () => {
  const requests = [];
  const storage = isolatedModule('lib/storage.ts', {
    './i18n': { t: text => text },
    'expo-secure-store': {
      canUseBiometricAuthentication: () => true,
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
      getItemAsync: async (key, options) => { requests.push({ key, options }); return null; },
    },
    'react-native': { Platform: { OS: 'ios' } },
    './auth-diagnostics': { recordAuthDiagnostic() {}, categorizeAuthFailure: () => 'unknown' },
  });
  assert.equal(await storage.getBiometricallyProtectedMnemonic(), null);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.requireAuthentication, true);
  assert.equal(requests[0].options.keychainService, 'opago.wallet.mnemonic.v2');
});
