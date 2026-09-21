'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
require('./register-typescript.cjs');
const { calculateBitcoinEur, calculateHederaEur } = require('../lib/portfolio-valuation.ts');
const { parseHomeBalancePreview } = require('../lib/home-balance-preview.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(file, overrides = {}) {
  const state = [];
  let cursor = 0;
  const translate = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
  const deps = {
    react: { ...React, useState: initial => {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
    }, useRef: initial => {
      const i = cursor++;
      if (!(i in state)) state[i] = { current: initial };
      return state[i];
    }, useCallback: fn => fn, useMemo: fn => fn(), useEffect: () => {} },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { StyleSheet: { create: value => value }, ScrollView: 'scroll', Text: 'text', View: 'view', ActivityIndicator: 'loading', AppState: { currentState: 'active' } },
    '@/components/ui/wallet-interaction': { TouchableOpacity: 'button', TextInput: 'input' },
    './wallet-interaction': { TouchableOpacity: 'button' },
    '@/components/ui/advanced-options': { AdvancedOptions: 'advanced' },
    '@/components/send/payment-back-button': { PaymentBackButton: 'back' },
    './payment-back-button': { PaymentBackButton: 'back' },
    '@/lib/i18n': { t: translate, appLocale: () => 'en' },
    '@/hooks/useLanguage': { useLanguage: () => {} },
    'expo-router': { useRouter: () => ({}) },
    '@react-navigation/native': { useIsFocused: () => true },
    '@expo/vector-icons': { Ionicons: 'icon' },
    'expo-image': { Image: 'image' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    '@/hooks/useWalletAuth': { useWalletAuth: () => ({ walletReady: true, backupStatus: 'verified', sparkWallet: null }) },
    '@/hooks/useExchangeRates': { useExchangeRates: () => ({ btcToEur: 50000, hbarToEur: 0.1 }) },
    '@/lib/config': { appConfig: { isMainnet: true, isHederaMainnet: true, hederaNetwork: 'mainnet' } },
    '@/lib/wallet-assets': require('../lib/wallet-assets.ts'),
    '@/lib/hedera/payments': { formatTinybars: value => String(Number(value) / 1e8) },
    '@/lib/lightning/receive-store-native': { lightningReceiveStore: { clear: async () => {} } },
    '@/styles/send-styles': { sendStyles: {} },
    ...overrides,
  };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => deps[name] || {}, exports);
  return { render: (name = 'default', props) => { cursor = 0; return exports[name](props); } };
}

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  // The actual disclosure has a separate mounting test below.
  const children = node.type === 'advanced' && !node.props.expanded ? [] : React.Children.toArray(node.props?.children);
  return [node, ...children.flatMap(nodes)];
}
const text = node => nodes(node).filter(item => item.type === 'text').map(item => React.Children.toArray(item.props.children).filter(value => typeof value === 'string').join('')).join(' ');
const advanced = node => nodes(node).find(item => item.type === 'advanced');

test('Bitcoin valuation is independent of HBAR; unknown amounts and rates never become zero', () => {
  assert.equal(calculateBitcoinEur(100_000_000, 50_000), 50_000);
  assert.equal(calculateBitcoinEur(0, 50_000), 0);
  for (const value of [null, -1, 0.5, NaN, Infinity]) assert.equal(calculateBitcoinEur(value, 50_000), null);
  for (const value of [0, -1, NaN, Infinity]) assert.equal(calculateBitcoinEur(1, value), null);
  assert.equal(calculateHederaEur(4_000_000_000n, 0.2), 8);
  assert.equal(calculateHederaEur(null, 0.2), null);
  assert.equal(calculateHederaEur(4_000_000_000n, 0), null);
});

test('Bitcoin-only exchange-rate previews survive without an HBAR rate', () => {
  const rates = { btcToEur: 50000, hbarToEur: 0, at: Date.now() };
  const value = parseHomeBalancePreview(JSON.stringify({ version: 1, scope: 'fixture', rates }), 'fixture');
  assert.deepEqual(value.rates, rates);
});

test('Advanced options mounts children only after expansion and exposes its accessible state', () => {
  const ui = fixture('components/ui/advanced-options.tsx');
  let expanded = false;
  const props = () => ({ expanded, onChange: value => { expanded = value; }, children: React.createElement('text', null, 'HBAR') });
  let screen = ui.render('AdvancedOptions', props());
  assert.doesNotMatch(text(screen), /HBAR/);
  const toggle = nodes(screen).find(node => node.type === 'button');
  assert.equal(toggle.props.accessibilityState.expanded, false);
  toggle.props.onPress();
  screen = ui.render('AdvancedOptions', props());
  assert.match(text(screen), /HBAR/);
});

test('Send offers only Bitcoin by default and HBAR only after opening advanced options', () => {
  const ui = fixture('components/send/payment-form.tsx');
  const props = { source: 'spark', sourceSelected: false, advancedExpanded: false, balances: { spark: 120, hbarTinybars: 200000000n }, balanceLoading: {}, walletReady: true, destination: '', amountInput: '', currency: 'SAT', onAdvancedChange: value => { props.advancedExpanded = value; }, onSourceChange: value => { props.source = value; props.sourceSelected = true; } };
  let screen = ui.render('PaymentForm', props);
  assert.match(text(screen), /Bitcoin/);
  assert.doesNotMatch(text(screen), /HBAR/);
  advanced(screen).props.onChange(true);
  screen = ui.render('PaymentForm', props);
  const hbar = nodes(screen).find(node => node.type === 'button' && node.props.accessibilityLabel?.startsWith('HBAR,'));
  hbar.props.onPress();
  screen = ui.render('PaymentForm', props);
  assert.match(text(screen), /Send HBAR/);
  assert.equal(nodes(screen).some(node => node.type === 'back'), true);
});

test('Receive hides HBAR initially and returns to collapsed Bitcoin after leaving HBAR', async () => {
  const ui = fixture('app/(tabs)/receive.tsx');
  let screen = ui.render();
  assert.doesNotMatch(text(screen), /HBAR/);
  advanced(screen).props.onChange(true);
  screen = ui.render();
  nodes(screen).find(node => node.type === 'button' && node.props.accessibilityLabel?.startsWith('HBAR,')).props.onPress();
  await flush();
  screen = ui.render();
  assert.match(text(screen), /Receive HBAR/);
  nodes(screen).find(node => node.type === 'back').props.onPress();
  await flush();
  screen = ui.render();
  assert.match(text(screen), /Receive Bitcoin/);
  assert.doesNotMatch(text(screen), /HBAR/);
  assert.equal(advanced(screen).props.expanded, false);
});

test('Balance refresh never resolves an HBAR account until explicitly enabled', async t => {
  const { balanceFixture } = require('./wallet-balances-fixture.cjs');
  const app = balanceFixture({ params: { prioritizeSpark: false } });
  t.after(app.unmount);
  app.render(); await app.settle();
  assert.deepEqual(app.reads, ['spark']);
  app.params.enableHedera = true; app.render();
  const result = await app.settle();
  assert.equal(result.balances.hbarTinybars, 200000000n);
  app.params.enableHedera = false; app.render(); await app.settle();
  assert.deepEqual(app.reads, ['spark', 'hedera']);
});

test('A valid Bitcoin price remains available when the rate service omits HBAR', async () => {
  let effect;
  const ui = fixture('hooks/useExchangeRates.ts', {
    react: { useState: initial => { const key = state.length; state.push(typeof initial === 'function' ? initial() : initial); return [state[key], value => { state[key] = value; }]; }, useEffect: callback => { effect = callback; }, useMemo: fn => fn() },
    '@/lib/http': { fetchJson: async () => ({ bitcoin: { eur: 50000 } }) },
  });
  const state = [];
  ui.render('useExchangeRates'); effect(); await flush();
  assert.deepEqual(state[0], { btcToEur: 50000, hbarToEur: 0 });
  assert.equal(state[2], false);
});
