'use strict';
/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
require('./register-typescript.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(data = {}) {
  const states = [];
  const reads = [];
  let cursor = 0;
  let focus;
  let cleanup;
  const hooks = { ...React,
    useState: initial => {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef: initial => {
      const i = cursor++;
      if (!(i in states)) states[i] = { current: initial };
      return states[i];
    },
    useCallback: value => value, useEffect: () => {},
  };
  const query = label => async () => { reads.push(label); return data[label] || []; };
  const deps = {
    react: hooks,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { StyleSheet: { create: value => value }, ScrollView: 'scroll', Text: 'text', View: 'view', RefreshControl: 'refresh', ActivityIndicator: 'loading' },
    '@/components/ui/advanced-options': { AdvancedOptions: 'advanced' },
    '@/components/ui/wallet-interaction': { TouchableOpacity: 'button' },
    '@/lib/i18n': { t: value => value, appLocale: () => 'en' },
    '@/components/bitcoin/payment-ui': { bitcoinStyles: {}, BitcoinButton: 'bitcoin-button', BitcoinInfo: 'bitcoin-info', BitcoinMoney: 'bitcoin-money' },
    '@/lib/bitcoin/amount': require('../lib/bitcoin/amount.ts'),
    '@/hooks/useLanguage': { useLanguage: () => {} },
    'expo-router': { useRouter: () => ({}), useFocusEffect: callback => { focus = callback; } },
    '@expo/vector-icons': { Ionicons: 'icon' },
    'expo-image': { Image: 'image' },
    'expo-haptics': { impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    '@/hooks/useWalletAuth': { useWalletAuth: () => ({ walletReady: true, sparkWallet: {}, hederaAccount: null, hederaPublicKey: 'public fixture', loadOrGenerateWallet: async () => {}, refreshHederaAccount: async () => { reads.push('account'); return { accountId: '0.0.123' }; }, error: null }) },
    '@/hooks/useWalletBalances': { useWalletBalances: () => ({ balances: { spark: 0, hbarTinybars: 0n }, balanceStates: { spark: { status: 'ready', updatedAt: 1 }, hedera: { status: 'ready', updatedAt: 1 } }, balanceError: null, secondaryDataReady: data.primaryReady !== false, refreshBalances: query('balances') }) },
    '@/hooks/useHomeBalancePreview': { useHomeBalancePreview: () => null },
    '@/hooks/useBitcoinOperations': { useBitcoinOperations: () => ({ operations: [] }) },
    '@/lib/bitcoin/onchain': { bitcoinScope: async () => 'fixture' },
    '@/lib/bitcoin/store-native': { bitcoinStore: { list: async () => [] } },
    '@/hooks/usePendingLightningPayments': { usePendingLightningPayments: () => ({ pendingCount: 0, hiddenPaymentKeys: data.hiddenPaymentKeys || [] }) },
    '@/hooks/useExchangeRates': { useExchangeRates: () => ({ btcToEur: 50000, hbarToEur: 0.1, updatedAt: 1 }) },
    '@/lib/config': { appConfig: { isMainnet: true, hederaNetwork: 'mainnet' } },
    '@/lib/portfolio-valuation': require('../lib/portfolio-valuation.ts'),
    '@/lib/wallet-display': { formatEurValue: value => String(value) },
    '@/lib/database': { getTransactions: query('local') },
    '@/lib/hedera/account': { loadHederaHistory: query('hedera history') },
    '@/lib/hedera/mirror': { normalizeHederaTransactionIdForMirror: value => value },
    '@/lib/hedera/payments': { formatTinybars: value => String(value) },
    '@/lib/hedera/payment-journal-native': { hederaPaymentJournal: { reconcile: query('hedera journal') } },
    '@/lib/lightning/reconcile-native': { reconcileLightningPayments: query('lightning journal') },
    '@/lib/lightning/spark-history': { loadSparkTransfersPaginated: query('lightning history') },
    '@/lib/progressive-refresh': require('../lib/progressive-refresh.ts'),
    '@/lib/ui-ready': { yieldToUi: async () => {} },
    '@/lib/startup-timing': { recordWalletStartupStage: () => {} },
    '@/lib/promise-timeout': require('../lib/promise-timeout.ts'),
    '@/lib/operational-health-native': { operationalHealth: { recordSuccess: async () => {}, recordFailure: async () => {} } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../app/(tabs)/index.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => deps[name] || {}, exports);
  const render = () => { cursor = 0; return exports.default(); };
  const refocus = () => { cleanup?.(); cleanup = focus(); };
  return { reads, render, refocus };
}

function findToggle(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type?.name === 'ActivitySection') return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = findToggle(child);
    if (found) return found;
  }
  return null;
}

test('Home starts collapsed with no history reads; opening loads, closing and refreshing do not', async () => {
  const app = fixture();
  let screen = app.render();
  app.refocus();
  await flush();
  assert.deepEqual(app.reads, []);
  assert.equal(findToggle(screen).props.activityExpanded, false);
  screen.props.refreshControl.props.onRefresh();
  await flush();
  assert.deepEqual(app.reads, ['balances']);
  app.reads.length = 0;
  findToggle(screen).props.onToggle();
  screen = app.render();
  app.refocus();
  await flush();
  assert.equal(findToggle(screen).props.activityExpanded, true);
  assert.deepEqual(app.reads.sort(), ['account', 'hedera history', 'hedera journal', 'lightning history', 'lightning journal', 'local']);
  app.reads.length = 0;
  findToggle(screen).props.onToggle();
  screen = app.render();
  app.refocus();
  screen.props.refreshControl.props.onRefresh();
  await flush();
  assert.deepEqual(app.reads, ['balances']);
  assert.equal(findToggle(screen).props.activityExpanded, false);
});

test('Advanced options precede the single shared history and do not control its expansion', async () => {
  const app = fixture();
  let screen = app.render();
  const advanced = node => React.Children.toArray(node.props.children).find(child => child.type === 'advanced');
  const children = React.Children.toArray(screen.props.children);
  assert.ok(children.findIndex(child => child.type === 'advanced') < children.findIndex(child => child.type?.name === 'ActivitySection'));
  assert.equal(children.filter(child => child.type?.name === 'ActivitySection').length, 1);
  assert.equal(findToggle(advanced(screen)), null);
  assert.equal(advanced(screen).props.expanded, false);
  advanced(screen).props.onChange(true);
  screen = app.render(); app.refocus(); await flush();
  assert.deepEqual(app.reads, []);
  findToggle(screen).props.onToggle();
  screen = app.render(); app.refocus(); await flush();
  assert.deepEqual(app.reads.sort(), ['account', 'hedera history', 'hedera journal', 'lightning history', 'lightning journal', 'local']);
  app.reads.length = 0;
  advanced(screen).props.onChange(false);
  screen = app.render();
  assert.equal(findToggle(screen).props.activityExpanded, true);
  assert.equal(advanced(screen).props.expanded, false);
  assert.deepEqual(app.reads, []);
});

test('Shared history includes Bitcoin and remote HBAR payments in date order with advanced options closed', async () => {
  const app = fixture({
    local: [{ id: 1, txId: 'ln:fixture', type: 'outgoing', amount: 20, asset: 'SAT', status: 'confirmed', timestamp: '2026-09-21T08:00:00Z' }],
    'hedera history': [{ transactionId: '0.0.123@100.000000001', direction: 'received', amountHbar: '2', result: 'SUCCESS', occurredAt: '2026-09-21T09:00:00Z', hashscanUrl: 'https://hashscan.io/mainnet/transaction/fixture' }],
  });
  let screen = app.render();
  findToggle(screen).props.onToggle();
  screen = app.render(); app.refocus(); await flush();
  screen = app.render();
  assert.deepEqual(findToggle(screen).props.transactions.map(item => item.asset), ['HBAR', 'SAT']);
  assert.equal(React.Children.toArray(screen.props.children).find(child => child.type === 'advanced').props.expanded, false);
});

test('Early history expansion queues both assets until Spark is ready', async () => {
  const data = { primaryReady: false };
  const app = fixture(data);
  let screen = app.render();
  findToggle(screen).props.onToggle();
  screen = app.render(); app.refocus(); await flush();
  assert.equal(findToggle(screen).props.waitingForSpark, true);
  assert.deepEqual(app.reads, []);
  data.primaryReady = true;
  screen = app.render(); app.refocus(); await flush();
  assert.equal(findToggle(screen).props.waitingForSpark, false);
  assert.deepEqual(app.reads.sort(), ['account', 'hedera history', 'hedera journal', 'lightning history', 'lightning journal', 'local']);
});

test('Closing history before Spark is ready cancels the queued reads', async () => {
  const data = { primaryReady: false };
  const app = fixture(data);
  let screen = app.render();
  findToggle(screen).props.onToggle();
  screen = app.render(); app.refocus(); await flush();
  findToggle(screen).props.onToggle();
  data.primaryReady = true;
  screen = app.render(); app.refocus(); await flush();
  assert.equal(findToggle(screen).props.activityExpanded, false);
  assert.deepEqual(app.reads, []);
});

test('hidden pending rows stay hidden without a reveal toggle and terminal outcomes become visible', async () => {
  const key = 'ln:' + 'a'.repeat(64);
  const data = { hiddenPaymentKeys: [key], local: [
    { id: 1, txId: key, type: 'outgoing', amount: 20, asset: 'SAT', status: 'pending', timestamp: '2026-09-22T09:45:00Z' },
    { id: 2, txId: 'ln:other', type: 'incoming', amount: 10, asset: 'SAT', status: 'confirmed', timestamp: '2026-09-22T09:13:00Z' },
  ] };
  const app = fixture(data);
  let screen = app.render(); findToggle(screen).props.onToggle();
  screen = app.render(); app.refocus(); await flush(); screen = app.render();
  assert.deepEqual(findToggle(screen).props.transactions.map(item => item.key), ['ln:other']);
  const hiddenToggle = React.Children.toArray(screen.props.children).find(node => node.type === 'button' &&
    React.Children.toArray(node.props.children).some(child => child.props?.children === 'Show hidden entries ({count})'));
  assert.equal(hiddenToggle, undefined);
  data.local[0].status = 'confirmed';
  screen = app.render(); app.refocus(); await flush(); screen = app.render();
  assert.equal(findToggle(screen).props.transactions.length, 2);
});
