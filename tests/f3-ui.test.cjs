'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const existingModules = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { F3ContractTestBackend } = require('../lib/opago/test-adapter.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { UmaSending } = require('../lib/opago/uma.ts');
const { activeLightningAddress } = require('../lib/opago/address.ts');
const { photoMatchReady } = require('../lib/opago/account.ts');
const { decodeLightningInvoice } = require('../lib/lightning.ts');
const { appConfig } = require('../lib/config.ts');
for (const name of Object.keys(require.cache)) if (name.endsWith('.ts') && !existingModules.has(name)) delete require.cache[name];
const translate = (key, values = {}) => key.replace(/\{([^}]+)\}/g, (_, name) => String(values[name]));
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join(' ');
  return tree && typeof tree === 'object' ? content(tree.props?.children) : typeof tree === 'string' ? tree : '';
}
function action(tree, label) { return nodes(tree).find(n => n.type === 'action' && n.props.label === label); }
async function runtimeFixture(ready = false) {
  const backend = new F3ContractTestBackend(new MemoryPrivateStore(), randomUUID, appConfig.isMainnet ? 'mainnet' : 'regtest');
  const account = backend.createAccount(); await account.load();
  if (ready) { await account.signIn(); await account.proveOwnership(); await account.bind(); await backend.setKya('approved'); await account.refresh(); await account.address('set', 'alice-test'); }
  const uma = new UmaSending(account, backend.disclosure, backend.peer, decodeLightningInvoice); await uma.load(); let payments = 0;
  return { backend, account, uma, testOnly: true, publicAddressOrigin: 'https://opago.com',
    perform: action => account.exclusive(action), prepare: () => uma.consentAndPrepare(uma.payment.disclosure.id, async () => 2),
    confirm: () => uma.confirm(async (_p, dispatch) => { await dispatch(); payments++; return 'synthetic-confirmed'; }),
    payments: () => payments,
  };
}
function screenFixture(t, file, runtime, params = { test: '1' }) {
  const previousDev = global.__DEV__; global.__DEV__ = true; t.after(() => { global.__DEV__ = previousDev; });
  let pending = Promise.resolve();
  const app = hookFixture(file, () => ({
    'expo-router': { useLocalSearchParams: () => params, useRouter: () => ({ push() {} }) },
    '../hooks/useOpagoAccount': { useOpagoAccount: () => ({ runtime, busy: false, error: '', run: action => { pending = runtime.perform(action); return pending; } }) },
    '../components/opago/opago-ui': { Action: 'action', Card: 'card', Copy: 'copy', OpagoPage: 'page', TextInput: 'input', ui: { input: {} } },
    '../lib/opago/account': { photoMatchReady }, '../lib/opago/address': { activeLightningAddress },
    '../lib/theme-styles': { themeColor: () => '#fff' }, '../lib/config': { appConfig }, '../lib/i18n': { t: translate },
    'react-native-qrcode-svg': { default: 'qr', __esModule: true }, 'react-native': { View: 'view' },
  }), exports => exports.default()); t.after(app.unmount); return { ...app, afterAction: async () => { await pending; return app.render(); } };
}

test('F3 update action opens only the configured distribution URL after an explicit tap', async t => {
  const opened = [];
  const app = hookFixture('components/opago/update-account-app.tsx', () => ({
    'react-native': { Platform: { OS: 'android' }, Linking: { openURL: async url => { opened.push(url); } } },
    '../../lib/opago/settings-native': { nativeF3UpdateUrl: () => 'https://opago.com/download' },
    '../../lib/i18n': { t: translate }, './opago-ui': { Action: 'action', Copy: 'copy' },
  }), exports => exports.UpdateAccountApp()); t.after(app.unmount);
  const tree = app.render(); assert.equal(opened.length, 0); action(tree, 'Update app').props.onPress(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(opened, ['https://opago.com/download']);
});
test('F3 account UI keeps local recovery optional, separates binding, and hides address QR until activation', async t => {
  const runtime = await runtimeFixture(); const app = screenFixture(t, 'app/opago-account.tsx', runtime);
  let tree = app.render(); assert.match(content(tree), /12 recovery words/); assert.equal(nodes(tree).some(n => n.type === 'qr'), false);
  assert.equal(action(tree, 'Link this wallet to my OPAGO account').props.disabled, true);
  action(tree, 'Sign in to OPAGO').props.onPress(); tree = await app.afterAction();
  assert.equal(runtime.account.state.session, null); assert.equal(action(tree, 'Link this wallet to my OPAGO account').props.disabled, true);
  action(tree, 'Prove wallet ownership').props.onPress(); tree = await app.afterAction();
  assert.equal(action(tree, 'Link this wallet to my OPAGO account').props.disabled, false);
  action(tree, 'Link this wallet to my OPAGO account').props.onPress(); await app.afterAction();
  await runtime.backend.setKya('approved'); await runtime.account.refresh();
  tree = app.render(); nodes(tree).find(n => n.type === 'input').props.onChangeText('alice-test'); tree = app.render();
  action(tree, 'Activate my Lightning address').props.onPress(); tree = await app.afterAction();
  assert.equal(action(tree, 'Open identity onboarding'), undefined);
  assert.doesNotMatch(content(tree), /Identity details submitted|fully verified identity/); assert.match(content(tree), /Synthetic test address/);
  assert.equal(nodes(tree).some(n => n.type === 'qr'), false); assert.equal(action(tree, 'Send with UMA').props.disabled, false);
  // Live display uses only a fresh, backend-confirmed canonical address.
  const liveScreen = screenFixture(t, 'app/opago-account.tsx', runtime, {});
  assert.equal(nodes(liveScreen.render()).find(n => n.type === 'qr').props.value, runtime.account.state.wallet.address.qr_payload);
  runtime.account.state.wallet.address.status = 'pending_kyc';
  assert.equal(nodes(liveScreen.render()).some(n => n.type === 'qr'), false);
});
test('F3 UMA UI shows receiver, amount, fees and provider data before consent and a separate payment confirmation', async t => {
  const runtime = await runtimeFixture(true); const app = screenFixture(t, 'app/uma-send.tsx', runtime);
  let tree = app.render(); nodes(tree).find(n => n.type === 'input' && n.props.accessibilityLabel === 'Amount in SAT').props.onChangeText('100');
  tree = app.render(); action(tree, 'Review identity disclosure').props.onPress(); tree = await app.afterAction();
  assert.match(content(tree), /\$alice@receiver.example/); assert.match(content(tree), /100 SAT/); assert.match(content(tree), /Maximum fee/);
  assert.match(content(tree), /receiver.example/); assert.match(content(tree), /Given name/); assert.match(content(tree), /Document number/);
  assert.equal(runtime.backend.peerCalls, 0); assert.equal(action(tree, 'Simulate confirmed payment'), undefined);
  action(tree, 'I consent to this data transfer').props.onPress(); tree = await app.afterAction();
  assert.equal(runtime.backend.peerCalls, 2); assert.equal(runtime.payments(), 0); assert.match(content(tree), /Payment fee limit: 2 SAT/);
  action(tree, 'Simulate confirmed payment').props.onPress(); tree = await app.afterAction();
  assert.equal(runtime.payments(), 1); assert.equal(action(tree, 'Simulate confirmed payment'), undefined); assert.match(content(tree), /No funds were transferred/);
});
test('F3 account deletion UI requires an explicit typed confirmation and displays the receipt', async t => {
  const runtime = await runtimeFixture(true); const app = screenFixture(t, 'app/opago-account.tsx', runtime);
  let tree = app.render(); assert.equal(action(tree, 'Delete OPAGO account').props.disabled, true);
  nodes(tree).find(n => n.type === 'input' && n.props.accessibilityLabel === 'Type DELETE to confirm account deletion').props.onChangeText('DELETE');
  tree = app.render(); assert.equal(action(tree, 'Delete OPAGO account').props.disabled, false);
  action(tree, 'Delete OPAGO account').props.onPress(); tree = await app.afterAction();
  assert.match(content(tree), /Account deletion is pending/); assert.equal(action(tree, 'Start new OPAGO onboarding').props.disabled, true);
  assert.equal(runtime.account.state.wallet, null); assert.equal(nodes(tree).some(n => n.type === 'qr'), false);
});

test('F3 Receive shows the confirmed personal QR first and never loads account services without an integration', async t => {
  const runtime = await runtimeFixture(true); let integrated = false; let accountLoads = 0;
  const app = hookFixture('components/opago/lightning-address-receive.tsx', () => ({
    'react-native': { Text: 'text', View: 'view' }, '../receive/wallet-qr-code': { WalletQrCode: 'qr' },
    '../../hooks/useOpagoAccount': { useOpagoAccount: () => { accountLoads++; return { runtime, run: action => runtime.perform(action) }; } },
    '../../lib/opago/runtime-native': { f3IntegrationAvailable: () => integrated }, '../../lib/opago/address': { activeLightningAddress },
    '../../lib/theme-styles': { themeColor: () => '#fff' }, '../../lib/i18n': { t: translate },
  }), exports => {
    const result = exports.PersonalLightningAddressReceive({ focused: true, size: 210 });
    return typeof result?.type === 'function' ? result.type(result.props) : result;
  }); t.after(app.unmount);
  assert.equal(app.render(), null); assert.equal(accountLoads, 0);
  integrated = true; let tree = await app.settle();
  assert.equal(nodes(tree).find(n => n.type === 'qr').props.value, runtime.account.state.wallet.address.qr_payload);
  assert.match(content(tree), /One-time Lightning invoice/);
  runtime.account.verifiedAt = 0; tree = app.render(); assert.equal(nodes(tree).some(n => n.type === 'qr'), false);
  assert.match(content(tree), /confirmed by the backend/);
});
