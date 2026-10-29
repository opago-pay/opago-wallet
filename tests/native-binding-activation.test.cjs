'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { OpagoError } = require('../lib/opago/api.ts');
const { opagoUserError } = require('../lib/opago/errors.ts');
const { translate } = require('../lib/i18n/index.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function load(file, dependencies, env = {}) {
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}, imports = [];
  new Function('require', 'exports', 'process', '__DEV__', code)(name => {
    imports.push(name);
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected production dependency: ${name}`);
    return dependencies[name];
  }, exports, { env }, false);
  return { exports, imports };
}
test('existing F3-enabled EAS profiles cannot activate prepared native wiring', async () => {
  const eas = JSON.parse(read('eas.json'));
  for (const name of ['development', 'preview', 'mainnet-candidate', 'production', 'production-apk']) {
    const profile = eas.build[name];
    const env = profile.env || eas.build[profile.extends].env;
    assert.equal(env.EXPO_PUBLIC_OPAGO_F3_ENABLED, 'true');
    const { exports, imports } = load('lib/opago/bootstrap-native.ts', { './api': { OpagoError } }, env);
    await assert.rejects(exports.createNativeF3Integration(), error => error instanceof OpagoError && error.code === 'wallet_session_contract_pending');
    assert.deepEqual(imports, ['./api'], name + ': no HTTP, browser, key-store, proof or prepared factory loaded');
  }
});
test('prepared native factory retains real adapter ports but is not imported by application code', async () => {
  let captured;
  const expected = { prepared: true }, http = () => {}, store = {}, logout = async () => {}, current = () => {};
  const { exports } = load('lib/opago/binding-integration-native.ts', {
    './api': { OpagoError }, 'react-native': { Platform: { OS: 'android' } },
    'expo-application': { nativeBuildVersion: '22' }, 'expo-crypto': { getRandomValues: value => value },
    './binding-integration': { createAccountBindingIntegration: async ports => { captured = ports; return expected; } },
    './hka-http-native': { nativeHkaHttp: http, nativeOidcVerifierPorts: {} },
    './oidc-verifier': { createWalletBrokerVerifier: () => 'verified-native-port' },
    './oidc-native': { nativeOidcPlatform: verifier => ({ verifier }) },
    './broker-account-native': { nativeBrokerClientLogout: logout }, './settings-native': { nativeF3Enabled: () => true },
    './store-native': { f3PrivateStore: store }, '../wallet-session': { walletSession: { captureRuntime: () => current } },
  });
  assert.equal(await exports.createNativeAccountBindingIntegration(), expected);
  assert.equal(captured.platform, 'android'); assert.equal(captured.build, 22);
  assert.equal(captured.http, http); assert.equal(captured.store, store); assert.equal(captured.logout, logout);
  assert.equal(captured.assertCurrent, current); assert.equal(captured.random(8).length, 8);
  assert.deepEqual(captured.oidc({ discovery: {} }), { verifier: 'verified-native-port' });
  for (const directory of ['app', 'components', 'hooks', 'lib']) {
    for (const entry of fs.readdirSync(path.join(__dirname, '..', directory), { recursive: true })) {
      if (!/\.[cm]?[jt]sx?$/.test(entry) || entry.endsWith('binding-integration-native.ts')) continue;
      const code = ts.transpileModule(read(directory + '/' + entry), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      assert.doesNotMatch(code, /(?:require\s*\(|from\s*)['"][^'"]*binding-integration(?:-native)?['"]/, directory + '/' + entry);
    }
  }
});
test('pending native acceptance is explicit and translated without disabling browser account login', () => {
  const message = opagoUserError(new OpagoError('wallet_session_contract_pending'));
  assert.match(message, /Backend acceptance is pending/);
  assert.match(message, /Browser sign-in and your local wallet remain available/);
  for (const language of ['de', 'fr', 'es', 'it']) assert.notEqual(translate(language, message), message);
  assert.match(read('components/opago/public-account-screen.tsx'), /Wallet linking is not enabled yet\. Backend acceptance is pending/);
});
