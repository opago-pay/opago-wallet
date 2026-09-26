'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
require('./register-typescript.cjs');

const flush = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 5; i++) await flush(); };
const record = (id, timestamp, asset = 'SAT', status = 'confirmed') => ({
  id, txId: 'fixture-' + id, type: 'incoming', amount: 20, asset, status, timestamp,
});

function fixture(data = {}) {
  const states = [];
  const reads = [];
  let cursor = 0;
  const focusEffects = [];
  let cleanups = [];
  const pushes = [];
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
    useCallback: value => value, useMemo: factory => factory(), useEffect: () => {},
  };
  const requests = [];
  const query = label => async (...args) => {
    reads.push(label); requests.push([label, ...args]);
    return typeof data[label] === 'function' ? data[label](...args) : data[label] || [];
  };
  const deps = {
    react: hooks,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      StyleSheet: { create: value => value }, ScrollView: 'scroll', Text: 'text', View: 'view',
      RefreshControl: 'refresh', ActivityIndicator: 'loading', BackHandler: { addEventListener: () => ({ remove() {} }) },
    },
    '@/components/ui/advanced-options': { AdvancedOptions: 'advanced' },
    '@/components/history/payment-details': { PaymentDetailsScreen: 'payment-details' },
    '@/components/ui/wallet-interaction': { TouchableOpacity: 'button', Pressable: 'pressable' },
    '@/lib/i18n': { t: (value, values = {}) => value.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match), appLocale: () => 'en' },
    '@/hooks/useLanguage': { useLanguage: () => {} },
    '@/hooks/useColorMode': { useColorMode: () => ({ mode: 'dark' }) },
    '@/lib/theme-styles': { adaptiveStyles: styles => styles, adaptColor: value => value, themeColor: role => role === 'accentText' ? '#ffb000' : '#fff' },
    'expo-router': { useRouter: () => ({ push: path => pushes.push(path) }), useFocusEffect: callback => { focusEffects.push(callback); } },
    '@expo/vector-icons': { Ionicons: 'icon' },
    'expo-image': { Image: 'image' },
    'expo-haptics': { impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/hooks/useWalletAuth': { useWalletAuth: () => ({
      walletReady: data.walletReady !== false, sparkWallet: {}, hederaPublicKey: 'public fixture',
      loadOrGenerateWallet: async () => { reads.push('wallet init'); },
      refreshHederaAccount: async () => { reads.push('account'); return { accountId: '0.0.123' }; }, error: null,
    }) },
    '@/hooks/useWalletBalances': { useWalletBalances: () => ({
      balances: { spark: data.spark === undefined ? 107 : data.spark, hbarTinybars: 0n },
      balanceStates: { spark: { status: 'ready', updatedAt: 1 }, hedera: { status: 'ready', updatedAt: 1 } },
      secondaryDataReady: data.primaryReady !== false, refreshBalances: query('balances'),
    }) },
    '@/hooks/useHomeBalancePreview': { useHomeBalancePreview: () => null },
    '@/hooks/useBitcoinOperations': { useBitcoinOperations: () => ({ operations: data.bitcoinOperations || [] }) },
    '@/lib/bitcoin/onchain': { bitcoinScope: async () => 'fixture' },
    '@/lib/bitcoin/store-native': { bitcoinStore: { list: async () => [] } },
    '@/hooks/usePendingLightningPayments': { usePendingLightningPayments: (_wallet, _scope, _enabled, onResolved) => {
      data.paymentSettled = onResolved;
      return { pendingCount: data.pendingCount || 0, hiddenPaymentKeys: data.hiddenPaymentKeys || [] };
    } },
    '@/hooks/useExchangeRates': { useExchangeRates: () => ({ btcToEur: 50000, hbarToEur: 0.1, updatedAt: 1 }) },
    '@/lib/config': { appConfig: { isMainnet: true, hederaNetwork: 'mainnet', sparkNetwork: 'MAINNET' } },
    '@/lib/payment-details': require('../lib/payment-details.ts'),
    '@/lib/wallet-session': { walletSession: { capture: () => () => {}, captureRuntime: () => () => {} } },
    '@/lib/portfolio-valuation': require('../lib/portfolio-valuation.ts'),
    '@/lib/wallet-display': {
      formatEurValue: value => String(value),
      bitcoinOperationNotice: () => null,
      paymentHistoryStatus: () => 'Completed',
      paymentHistoryTitle: () => 'Payment',
    },
    '@/lib/database': { getTransactionPage: query('local') },
    '@/lib/hedera/account': { loadHederaHistoryPage: async (...args) => ({
      items: await query('hedera history')(...args), next: null,
    }) },
    '@/lib/hedera/mirror': { normalizeHederaTransactionIdForMirror: value => value },
    '@/lib/hedera/payments': { formatTinybars: value => String(value) },
    '@/lib/hedera/payment-journal-native': { hederaPaymentJournalFor: () => ({
      list: query('hedera journal'), reconcile: async () => { throw new Error('Recovery must not block history'); },
    }) },
    '@/lib/lightning/payment-journal-native': { lightningPaymentJournalFor: () => ({ list: query('lightning journal') }) },
    '@/lib/lightning/spark-history': { loadSparkTransferPage: async (_wallet, limit, offset) => {
      const transfers = await query('lightning history')(limit, offset);
      return { transfers, next: transfers.length === limit ? offset + limit : null };
    }, sparkUserRequestPaymentHash: item => item?.invoice?.paymentHash || null },
    '@/lib/history-pagination': require('../lib/history-pagination.ts'),
    '@/lib/ui-ready': { yieldToUi: async () => {} },
    '@/lib/startup-timing': { recordWalletStartupStage: () => {} },
    '@/lib/performance-trace': require('./performance-trace-stub.cjs'),
    '@/lib/promise-timeout': require('../lib/promise-timeout.ts'),
    '@/lib/operational-health-native': { operationalHealth: {
      recordSuccess: async () => {}, recordFailure: async () => {},
    } },
    '@/lib/moonpay-return-native': { consumeMoonPayReturnNotice: async () => false },
  };
  const source = fs.readFileSync(path.join(__dirname, '../app/(tabs)/index.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'requestAnimationFrame', 'cancelAnimationFrame', code)(
    name => deps[name] || {}, exports, callback => setImmediate(callback), clearImmediate,
  );
  const render = () => { cursor = 0; focusEffects.length = 0; return exports.default(); };
  const blur = () => { cleanups.forEach(cleanup => cleanup?.()); cleanups = []; };
  const refocus = () => { blur(); cleanups = focusEffects.map(focus => focus()); };
  return { reads, requests, pushes, render, refocus, blur };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}
const historyButton = screen => find(screen, node => node.type === 'pressable' && node.props.accessibilityLabel === 'Show all activity');
const latestRow = screen => find(screen, node => node.type?.name === 'TransactionRow');
const advanced = screen => find(screen, node => node.type === 'advanced');
const openHistory = app => {
  const screen = app.render();
  historyButton(screen).props.onPress();
  const page = app.render();
  assert.equal(page.type.name, 'HistoryPage');
  return page;
};

test('Home puts the euro amount above SAT and shows the last saved payment before remote history loads', async () => {
  const app = fixture({ primaryReady: false, local: [record(1, '2026-09-23T10:00:00Z')] });
  let screen = app.render(); app.refocus(); await settle(); screen = app.render();
  assert.equal(latestRow(screen).props.transaction.key, 'fixture-1');
  assert.deepEqual(app.reads, ['local']);
  const texts = [];
  const collect = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && typeof node.props.children === 'string') texts.push(node.props.children);
    React.Children.toArray(node.props?.children).forEach(collect);
  };
  collect(screen);
  assert.ok(texts.includes('107 Sats'));
  assert.ok(texts.includes('Latest activity'));
  assert.equal(find(screen, node => node.type?.name === 'BalanceCard' && node.props.asset === 'lightning'), null);
  assert.equal(advanced(screen).props.label, 'More coins');
});

test('latest activity and an unresolved-payment notice open the same details view', async () => {
  const hash = 'ab'.repeat(32);
  const app = fixture({ primaryReady: false, pendingCount: 1,
    local: [record(1, '2026-09-23T10:00:00Z')],
    'lightning journal': [{ paymentHash: hash, amountSats: 20, state: 'pending', hiddenAt: undefined,
      createdAt: '2026-09-23T10:00:00Z', requestId: 'request-1' }],
  });
  app.render(); app.refocus(); await settle();
  let screen = app.render();
  latestRow(screen).props.openTransaction(latestRow(screen).props.transaction);
  screen = app.render();
  assert.equal(screen.type, 'payment-details');
  assert.equal(screen.props.payment.key, 'fixture-1');
  screen.props.onClose();
  screen = app.render();
  const notice = find(screen, node => node.type === 'button' &&
    find(node, child => child.type === 'text' && child.props.children === 'Payment status unknown'));
  assert.ok(notice);
  notice.props.onPress(); await settle();
  screen = app.render();
  assert.equal(screen.type, 'payment-details');
  assert.equal(screen.props.payment.key, 'ln:' + hash);
  assert.equal(screen.props.payment.requestId, 'request-1');
});

test('Receive, Send, and Buy keep their positions regardless of balance', () => {
  for (const spark of [107, 0]) {
    const app = fixture({ spark });
    const screen = app.render();
    const actions = [];
    const collect = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type?.name === 'QuickAction') actions.push(node.props);
      React.Children.toArray(node.props?.children).forEach(collect);
    };
    collect(screen);
    assert.deepEqual(actions.map(action => action.label), ['Receive', 'Send', 'Buy']);
    assert.deepEqual(actions.map(action => !!action.isSend), [false, true, false]);
  }
});

test('Cold start uses one loading view instead of showing a temporary zero or a loading balance on Home', () => {
  const app = fixture({ spark: null });
  assert.equal(app.render().type.name, 'StartupLoadingScreen');
});

test('Home starts wallet initialization immediately while remote history remains unopened', async () => {
  const app = fixture({ walletReady: false, spark: null });
  app.render(); app.refocus(); await settle();
  assert.deepEqual(app.reads, ['wallet init']);
});

test('History waits for Bitcoin, then shows twenty mixed-asset payments and loads older rows at the footer', async () => {
  const transfers = Array.from({ length: 45 }, (_, i) => ({
    id: 'transfer-' + i, status: 'COMPLETED', totalValue: 10, transferDirection: 'INCOMING',
    createdTime: new Date(1800000000000 - i * 1000).toISOString(),
  }));
  const data = { primaryReady: false, 'lightning history': (limit, offset) => transfers.slice(offset, offset + limit) };
  const app = fixture(data);
  let page = openHistory(app); app.refocus(); await settle();
  assert.equal(page.props.waitingForSpark, true);
  assert.deepEqual(app.reads, ['local']);
  data.primaryReady = true;
  page = app.render(); app.refocus(); await settle(); page = app.render();
  assert.equal(page.props.waitingForSpark, false);
  assert.equal(page.props.transactions.length, 20);
  assert.equal(page.props.hasMore, true);
  assert.deepEqual(app.requests.filter(x => x[0] === 'lightning history'), [['lightning history', 20, 0]]);
  page.props.onLoadMore(); await settle(); page = app.render();
  assert.equal(page.props.transactions.length, 40);
  page.props.onLoadMore(); await settle(); page = app.render();
  assert.equal(page.props.transactions.length, 45);
  assert.equal(page.props.hasMore, false);
  assert.deepEqual(app.requests.filter(x => x[0] === 'lightning history'),
    [['lightning history', 20, 0], ['lightning history', 20, 20], ['lightning history', 20, 40]]);
});

test('Home avoids remote history until Activity opens, then orders HBAR and local payments', async () => {
  const app = fixture({
    local: [record(1, '2026-09-21T08:00:00Z')],
    'hedera history': [{ transactionId: '0.0.123@100.000000001', direction: 'received', amountHbar: '2',
      result: 'SUCCESS', occurredAt: '2026-09-21T09:00:00Z', hashscanUrl: 'https://hashscan.io/mainnet/transaction/fixture' }],
  });
  app.render(); app.refocus(); await settle();
  let screen = app.render();
  assert.equal(latestRow(screen).props.transaction.asset, 'SAT');
  assert.equal(advanced(screen).props.expanded, false);
  assert.equal(app.reads.includes('hedera history'), false);
  openHistory(app); app.refocus(); await settle();
  const page = app.render();
  assert.deepEqual(page.props.transactions.map(item => item.asset), ['HBAR', 'SAT']);
  page.props.onClose();
  screen = app.render();
  assert.equal(latestRow(screen).props.transaction.asset, 'HBAR');
});

test('A hidden pending payment is absent from the latest card and history', async () => {
  const key = 'ln:' + 'a'.repeat(64);
  const app = fixture({ hiddenPaymentKeys: [key], local: [
    { ...record(1, '2026-09-22T09:45:00Z', 'SAT', 'pending'), txId: key },
    record(2, '2026-09-22T09:13:00Z'),
  ] });
  app.render(); app.refocus(); await settle();
  const screen = app.render();
  assert.equal(latestRow(screen).props.transaction.key, 'fixture-2');
  openHistory(app); app.refocus(); await settle();
  assert.deepEqual(app.render().props.transactions.map(item => item.key), ['fixture-2']);
});

test('Leaving Home discards a late history response and refreshes on return', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const data = { local: (limit) => limit === 10 ? [] : delayed };
  const app = fixture(data);
  app.render(); app.refocus(); await flush();
  app.blur(); release([record(1, '2026-09-23T10:00:00Z')]); await settle();
  data.local = (limit) => limit === 10 ? [record(2, '2026-09-23T11:00:00Z')] : [];
  app.render(); app.refocus(); await settle();
  assert.equal(latestRow(app.render()).props.transaction.key, 'fixture-2');
});

test('The history page opens from one large button and closes without changing wallet navigation', () => {
  const app = fixture();
  let screen = app.render();
  const button = historyButton(screen);
  assert.ok(button);
  assert.equal(advanced(screen).props.label, 'More coins');
  button.props.onPress();
  const page = app.render();
  assert.equal(page.type.name, 'HistoryPage');
  page.props.onClose();
  screen = app.render();
  assert.equal(screen.type, 'scroll');
  assert.deepEqual(app.pushes, []);
});
