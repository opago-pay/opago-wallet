'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function runtime(platform, stored = null, nativeGranted = false) {
  const calls = [];
  const storage = {
    async getItem() { calls.push('read-storage'); return stored; },
    async setItem(_key, value) { calls.push(`save:${value}`); stored = value; },
  };
  const native = {
    async read() { calls.push('read-native'); return nativeGranted; },
    async setEnabled(enabled) { calls.push(`native:${enabled}`); nativeGranted = enabled; },
  };
  const reporting = {
    initializeCrashReporting() { calls.push('start-sentry'); },
    async stopCrashReporting() { calls.push('stop-sentry'); },
  };
  const exports = {};
  const context = {
    exports, __DEV__: false,
    require(name) {
      if (name === '@react-native-async-storage/async-storage') return { default: storage };
      if (name === 'react-native') return { Platform: { OS: platform }, NativeModules: { OpagoNativeCrashConsent: native } };
      if (name === './crash-reporting') return reporting;
      throw Error(`Unexpected import ${name}`);
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../lib/diagnostics-consent.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { consent: exports.diagnosticsConsent, calls };
}

test('Android stays off without consent, starts only after a saved grant, and stops on withdrawal', async () => {
  const { consent, calls } = runtime('android');
  await consent.initialize();
  assert.equal(consent.getSnapshot().ready, true);
  assert.equal(consent.getSnapshot().granted, false);
  assert.deepEqual(calls, ['read-storage']);
  await consent.setGranted(true);
  assert.deepEqual(calls.slice(-2), ['save:granted', 'start-sentry']);
  await consent.setGranted(false);
  assert.deepEqual(calls.slice(-2), ['stop-sentry', 'save:declined']);
  assert.equal(consent.getSnapshot().granted, false);
});

test('iOS shares the native startup gate and closes native capture before JavaScript on withdrawal', async () => {
  const { consent, calls } = runtime('ios');
  await consent.initialize();
  assert.deepEqual(calls, ['read-native']);
  await consent.setGranted(true);
  assert.deepEqual(calls.slice(-2), ['native:true', 'start-sentry']);
  await consent.setGranted(false);
  assert.deepEqual(calls.slice(-2), ['native:false', 'stop-sentry']);
  const source = fs.readFileSync(path.join(__dirname, '../plugins/native/OpagoNativeCrashDiagnostics.m'), 'utf8');
  assert.match(source, /if \(!\[\[NSUserDefaults standardUserDefaults\] boolForKey:OpagoCrashConsentKey\]\) return;/);
});

test('a prior grant resumes diagnostics, while an unreadable choice fails closed', async () => {
  const saved = runtime('android', 'granted');
  await saved.consent.initialize();
  assert.deepEqual(saved.calls, ['read-storage', 'start-sentry']);
  const malformed = runtime('android', 'unknown');
  await malformed.consent.initialize();
  assert.deepEqual(malformed.calls, ['read-storage']);
});
