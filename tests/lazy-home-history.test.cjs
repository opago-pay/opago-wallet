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
  const intervals = new Map();
  const appStateListeners = new Set();
  const rateListeners = new Set();
  const savedQuotes = data.transactionQuotes || {};
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
      AppState: { get currentState() { return data.appState ?? 'active'; }, addEventListener: (_event, listener) => {
        appStateListeners.add(listener); return { remove: () => appStateListeners.delete(listener) };
      } },
    },
    '@/components/ui/advanced-options': { AdvancedOptions: 'advanced' },
    '@/components/ui/asset-icon': { AssetIcon: 'asset-icon' },
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
      walletReady: data.walletReady !== false, sparkWallet: {}, hederaPublicKey: data.publicKey ?? 'public fixture',
      loadOrGenerateWallet: async () => { reads.push('wallet init'); },
      refreshHederaAccount: async () => { reads.push('account'); return { accountId: '0.0.123' }; }, error: null,
    }) },
    '@/hooks/useWalletBalances': { useWalletBalances: params => { data.balanceParams = params; return ({
      balances: { spark: data.spark === undefined ? 107 : data.spark, hbarTinybars: data.hbarTinybars === undefined ? 0n : data.hbarTinybars },
      balanceStates: { spark: { status: data.sparkStatus ?? 'ready', updatedAt: 1, error: data.sparkError }, hedera: { status: data.hederaStatus ?? 'ready', updatedAt: 1 } },
      bitcoinIncoming: data.bitcoinIncoming ?? null,
      secondaryDataReady: data.primaryReady !== false, refreshBalances: query('balances'),
    }); } },
    '@/hooks/useHomeBalancePreview': { useHomeBalancePreview: () => null },
    '@/hooks/useBitcoinOperations': { useBitcoinOperations: () => ({ operations: data.bitcoinOperations || [] }) },
    '@/lib/bitcoin/onchain': { bitcoinScope: async () => 'fixture' },
    '@/lib/bitcoin/store-native': { bitcoinStore: { list: async () => [], listHistoryPage: async () => ({ items: [], next: null }) } },
    '@/lib/bitcoin/amount': require('../lib/bitcoin/amount.ts'),
    '@/lib/bitcoin/holdings': require('../lib/bitcoin/holdings.ts'),
    '@/hooks/usePendingLightningPayments': { usePendingLightningPayments: (_wallet, _scope, _enabled, onResolved) => {
      data.paymentSettled = onResolved;
      return { pendingCount: data.pendingCount || 0, hiddenPaymentKeys: data.hiddenPaymentKeys || [] };
    } },
    '@/hooks/useExchangeRates': { useExchangeRates: () => ({ btcToEur: data.btcRate ?? 50000, hbarToEur: data.hbarRate ?? 0.1,
      btcUpdatedAt: data.btcRatesAt ?? data.ratesAt ?? Date.now(), hbarUpdatedAt: data.hbarRatesAt ?? data.ratesAt ?? Date.now(),
      updatedAt: data.ratesAt ?? Date.now(), refresh: query('rates') }) },
    '@/lib/config': { appConfig: { isMainnet: true, hederaNetwork: 'mainnet', sparkNetwork: 'MAINNET' } },
    '@/lib/payment-details': require('../lib/payment-details.ts'),
    '@/lib/wallet-session': { walletSession: { capture: () => () => {}, captureRuntime: () => () => {} } },
    '@/lib/portfolio-valuation': require('../lib/portfolio-valuation.ts'),
    '@/lib/wallet-display': {
      formatEurValue: value => String(value),
      formatCoinUnitPrice: value => String(value),
      bitcoinOperationNotice: () => null,
      paymentHistoryStatus: () => 'Completed',
      paymentHistoryTitle: () => 'Payment',
    },
    '@/lib/wallet-assets': require('../lib/wallet-assets.ts'),
    '@/lib/database': { getTransactionPage: query('local') },
    '@/lib/hedera/account': { loadHederaHistoryPage: async (...args) => ({
      items: await query('hedera history')(...args), next: null,
    }) },
    '@/lib/hedera/mirror': require('../lib/hedera/mirror.ts'),
    '@/lib/hedera/payments': { formatTinybars: value => String(Number(value) / 100_000_000) },
    '@/lib/hedera/payment-journal-native': { hederaPaymentJournalFor: () => ({
      list: query('hedera journal'), reconcile: async () => { throw new Error('Recovery must not block history'); },
    }) },
    '@/lib/lightning/payment-journal-native': { lightningPaymentJournalFor: () => ({ list: query('lightning journal') }) },
    '@/lib/lightning/spark-history': { loadSparkTransferPage: async (_wallet, limit, offset) => {
      const transfers = await query('lightning history')(limit, offset);
      return { transfers, next: transfers.length === limit ? offset + limit : null };
    }, sparkUserRequestPaymentHash: item => item?.invoice?.paymentHash || null },
    '@/lib/history-pagination': require('../lib/history-pagination.ts'),
    '@/lib/transaction-rates': require('../lib/transaction-rates.ts'),
    '@/lib/transaction-rates-native': { transactionRates: {
      subscribe: listener => { rateListeners.add(listener); return () => rateListeners.delete(listener); },
      process: async () => {},
      enrich: async (items, _identity, assertCurrent) => {
        if(data.beforeEnrich) await data.beforeEnrich();
        assertCurrent();return items.map(item=>({...item,transactionRate:savedQuotes[item.key]||null,transactionRatePending:!savedQuotes[item.key]}));
      },
    } },
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
  new Function('require', 'exports', 'requestAnimationFrame', 'cancelAnimationFrame', 'setInterval', 'clearInterval', code)(
    name => deps[name] || {}, exports, callback => setImmediate(callback), clearImmediate,
    (callback, ms) => { const id={};intervals.set(id,{callback,ms});return id; }, id=>intervals.delete(id),
  );
  const render = () => { cursor = 0; focusEffects.length = 0; return exports.default(); };
  const blur = () => { cleanups.forEach(cleanup => cleanup?.()); cleanups = []; };
  const refocus = () => { blur(); cleanups = focusEffects.map(focus => focus()); };
  return { reads, requests, pushes, render, refocus, blur,
    storeRate: (key,quote) => { savedQuotes[key]=quote;for(const listener of rateListeners)listener(); },
    poll: () => { for(const {callback} of [...intervals.values()])callback(); },
    appState: state => { data.appState=state;for(const listener of appStateListeners)listener(state); },
  };
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

test('Home keeps its primary balance and reads HBAR activity without waiting for Bitcoin', async () => {
  const app = fixture({ primaryReady: false, local: [record(1, '2026-09-23T10:00:00Z')] });
  let screen = app.render(); app.refocus(); await settle(); screen = app.render();
  assert.equal(latestRow(screen).props.transaction.key, 'fixture-1');
  assert.ok(app.reads.includes('hedera history'));
  assert.equal(app.reads.includes('lightning history'),false);
  const texts = [];
  const collect = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && typeof node.props.children === 'string') texts.push(node.props.children);
    React.Children.toArray(node.props?.children).forEach(collect);
  };
  collect(screen);
  assert.ok(texts.includes('Bitcoin balance: 107 Sats'));
  assert.ok(texts.includes('Latest activity'));
  assert.equal(find(screen, node => node.type?.name === 'BalanceCard' && node.props.asset === 'lightning'), null);
  assert.equal(advanced(screen).props.label, 'All coins');
});

test('Home headline adds every displayed coin and waits for missing holdings', () => {
  const data = { spark: 150_000_000, hbarTinybars: 2_000_000_000n };
  const app = fixture(data);
  let screen = app.render();
  assert.equal(data.balanceParams.enableHedera, true);
  const headline = find(screen, node => node.type === 'text' && node.props.accessibilityLabel?.startsWith('Total estimated balance:'));
  assert.equal(headline.props.accessibilityLabel, 'Total estimated balance: 75002');
  assert.equal(find(screen, node => node.type?.name === 'BalanceCard' && node.props.asset === 'bitcoin').props.fiatValue, '≈ 75000');

  data.hbarTinybars = null;
  screen = app.render();
  assert.equal(find(screen, node => node.type === 'text' && node.props.accessibilityLabel === 'Balance unavailable').props.children, '—');

  data.hbarTinybars = 2_000_000_000n;
  data.hbarRate = 0;
  screen = app.render();
  assert.equal(find(screen, node => node.type === 'text' && node.props.accessibilityLabel === 'Balance unavailable').props.children, '—');
  assert.ok(find(screen, node => node.type === 'text' && node.props.children === 'EUR estimate unavailable'));

  data.hbarTinybars = 0n;
  screen = app.render();
  assert.equal(find(screen, node => node.type === 'text' && node.props.accessibilityLabel === 'Total estimated balance: 75000').props.accessibilityLabel, 'Total estimated balance: 75000');
});

test('activity rows show the same EUR quote or unavailable message as payment details', async () => {
  const bitcoin = fixture({ primaryReady: false, transactionQuotes: { 'fixture-1': { asset:'BTC',eurPerCoin:50000 } }, local: [
    { ...record(1, '2026-09-23T10:00:00Z'), btcEurRate: 50_000 },
  ] });
  bitcoin.render(); bitcoin.refocus(); await settle();
  let row = latestRow(bitcoin.render());
  let rendered = row.type(row.props);
  assert.ok(find(rendered, node => node.type === 'text' && node.props.children === '≈ 0.01'));
  assert.match(rendered.props.accessibilityLabel, /≈ 0\.01/);

  const hedera = fixture({ primaryReady: false, transactionQuotes: { 'hedera:fixture-2': { asset:'HBAR',eurPerCoin:0.1 }, 'fixture-2': { asset:'HBAR',eurPerCoin:0.1 } }, local: [record(2, '2026-09-23T10:00:00Z', 'HBAR')] });
  hedera.render(); hedera.refocus(); await settle();
  row = latestRow(hedera.render());
  rendered = row.type(row.props);
  assert.ok(find(rendered, node => node.type === 'text' && node.props.children === '≈ 2'));

  const oldBitcoin = fixture({ primaryReady: false, local: [record(3, '2026-09-23T10:00:00Z')] });
  oldBitcoin.render(); oldBitcoin.refocus(); await settle();
  row = latestRow(oldBitcoin.render());
  rendered = row.type(row.props);
  const pendingValue=find(rendered,node=>node.type==='text'&&node.props.accessibilityLabel==='Historical rate is being retrieved');
  assert.equal(pendingValue.props.children,'—');
  assert.equal(pendingValue.props.numberOfLines,1);
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

test('History loads other assets while waiting for Bitcoin, then pages twenty payments at a time', async () => {
  const transfers = Array.from({ length: 45 }, (_, i) => ({
    id: 'transfer-' + i, status: 'COMPLETED', totalValue: 10, transferDirection: 'INCOMING',
    createdTime: new Date(1800000000000 - i * 1000).toISOString(),
  }));
  const data = { primaryReady: false, 'lightning history': (limit, offset) => transfers.slice(offset, offset + limit) };
  const app = fixture(data);
  let page = openHistory(app); app.refocus(); await settle();
  assert.equal(page.props.waitingForSpark, true);
  assert.ok(app.reads.includes('hedera history'));
  assert.equal(app.reads.includes('lightning history'),false);
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

test('Home shows the newest HBAR receipt before Activity opens, using a small first page', async () => {
  const app = fixture({
    local: [record(1, '2026-09-21T08:00:00Z')],
    'hedera history': [{ transactionId: '0.0.123@100.000000001', direction: 'received', amountHbar: '2',
      result: 'SUCCESS', occurredAt: '2026-09-21T09:00:00Z', hashscanUrl: 'https://hashscan.io/mainnet/transaction/fixture' }],
  });
  app.render(); app.refocus(); await settle();
  let screen = app.render();
  assert.equal(latestRow(screen).props.transaction.asset, 'HBAR');
  assert.equal(advanced(screen).props.expanded, false);
  assert.equal(app.reads.includes('hedera history'), true);
  assert.equal(app.requests.find(item=>item[0]==='hedera history')[2],5);
  assert.equal(app.requests.find(item=>item[0]==='lightning history')[1],5);
  openHistory(app); app.refocus(); await settle();
  const page = app.render();
  assert.deepEqual(page.props.transactions.map(item => item.asset), ['HBAR', 'SAT']);
  page.props.onClose();
  screen = app.render();
  assert.equal(latestRow(screen).props.transaction.asset, 'HBAR');
});

test('pull-to-refresh updates Home HBAR activity and rates without opening all activity', async () => {
  const data = { 'hedera history': [] };
  const app = fixture(data);
  app.render(); app.refocus(); await settle();
  data['hedera history'] = [{ transactionId: '0.0.123@100.000000001', direction: 'received',
    amountHbar: '2', result: 'SUCCESS', occurredAt: '2026-09-30T10:00:00Z' }];
  app.reads.length = 0;
  let release;
  data.balances = () => new Promise(resolve => { release = resolve; });
  app.render().props.refreshControl.props.onRefresh();
  await settle();
  assert.equal(app.render().props.refreshControl.props.refreshing, true);
  release(); await settle();
  const screen = app.render();
  assert.equal(screen.type, 'scroll');
  assert.equal(latestRow(screen).props.transaction.asset, 'HBAR');
  assert.ok(app.reads.includes('balances'));
  assert.ok(app.reads.includes('hedera history'));
  assert.ok(app.reads.includes('rates'));
  assert.equal(screen.props.refreshControl.props.refreshing, false);
  app.blur();
});

test('pull-to-refresh releases the spinner after balance or exchange-rate failure', async () => {
  for (const service of ['balances', 'rates']) {
    const data = {};
    const app = fixture(data);
    app.render(); app.refocus(); await settle();
    data[service] = async () => { throw new Error('temporary service outage'); };
    app.render().props.refreshControl.props.onRefresh();
    await settle();
    assert.equal(app.render().props.refreshControl.props.refreshing, false, service);
    app.blur();
  }
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
  assert.equal(advanced(screen).props.label, 'All coins');
  button.props.onPress();
  const page = app.render();
  assert.equal(page.type.name, 'HistoryPage');
  page.props.onClose();
  screen = app.render();
  assert.equal(screen.type, 'scroll');
  assert.deepEqual(app.pushes, []);
});

test('Home polls for new HBAR receipts, pauses in background, refreshes on resume and stops on blur', async () => {
  const receipt=time=>({transactionId:'0.0.123@100.000000001',direction:'received',amountHbar:'2',result:'SUCCESS',occurredAt:time});
  const data={'hedera history':[]};const app=fixture(data);
  app.render();app.refocus();await settle();
  data['hedera history']=[receipt('2026-09-30T10:00:00Z')];
  app.appState('background');const reads=app.reads.length;
  app.poll();await settle();assert.equal(app.reads.length,reads);
  app.appState('active');await settle();
  assert.equal(latestRow(app.render()).props.transaction.asset,'HBAR');
  data['hedera history']=[receipt('2026-09-30T11:00:00Z')];
  app.poll();await settle();
  assert.equal(latestRow(app.render()).props.transaction.timestamp,'2026-09-30T11:00:00Z');
  app.blur();const stopped=app.reads.length;
  app.poll();app.appState('active');await settle();assert.equal(app.reads.length,stopped);
});

test('a failed HBAR refresh preserves the last known receipt while another asset succeeds', async () => {
  const data={'hedera history':[{transactionId:'0.0.123@100.000000001',direction:'received',amountHbar:'2',result:'SUCCESS',occurredAt:'2026-09-30T10:00:00Z'}]};
  const app=fixture(data);app.render();app.refocus();await settle();app.render();
  data['hedera history']=async()=>{throw Error('temporary mirror outage');};
  app.poll();await settle();
  assert.equal(latestRow(app.render()).props.transaction.asset,'HBAR');
  app.blur();
});

test('a local HBAR payment and its mirror receipt deduplicate across SDK and mirror ID formats', async () => {
  const app=fixture({local:[{...record(1,'2026-09-30T10:00:01Z','HBAR'),txId:'0.0.123@100.000000001'}],
    'hedera history':[{transactionId:'0.0.123-100-000000001',direction:'received',amountHbar:'2',result:'SUCCESS',occurredAt:'2026-09-30T10:00:00Z'}]});
  app.render();app.refocus();await settle();
  openHistory(app);app.refocus();await settle();
  assert.equal(app.render().props.transactions.length,1);
  assert.equal(app.render().props.transactions[0].key,'hedera:0.0.123-100-000000001');
  app.blur();
});

test('Home and incoming Bitcoin amounts render without Intl.formatToParts on iOS Hermes',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype,'formatToParts');
  Object.defineProperty(Intl.NumberFormat.prototype,'formatToParts',{...descriptor,value:undefined});
  try {
    for(const incoming of [false,true]) {
      const app=fixture({spark:107,bitcoinIncoming:incoming?100:null,bitcoinOperations:incoming?[
        {id:'pending-deposit',kind:'deposit',state:'pending',amountSats:200},
      ]:[]});
      const screen=app.render();
      const btc=find(screen,node=>node.type?.name==='BalanceCard'&&node.props.asset==='bitcoin');
      assert.ok(btc);
      assert.equal(btc.props.value,'0.00000107 BTC');
      assert.deepEqual(btc.props.notes,incoming?['Incoming Bitcoin: 0.000001 BTC','Onchain deposits awaiting credit: 0.000002 BTC']:[]);
    }
  } finally { Object.defineProperty(Intl.NumberFormat.prototype,'formatToParts',descriptor); }
});

test('All coins shows available BTC and HBAR holdings, EUR values, unit prices and separate incoming amounts', async () => {
  const app=fixture({spark:150_000_000,hbarTinybars:2_000_000_000n,bitcoinIncoming:100,
    bitcoinOperations:[{id:'pending-deposit',kind:'deposit',state:'action_required',amountSats:200}],
  });
  let screen=app.render();
  assert.equal(advanced(screen).props.label,'All coins');
  const btc=find(screen,node=>node.type?.name==='BalanceCard'&&node.props.asset==='bitcoin');
  const hbar=find(screen,node=>node.type?.name==='BalanceCard'&&node.props.asset==='hedera');
  assert.equal(btc.props.value,'1.5 BTC');assert.equal(btc.props.fiatValue,'≈ 75000');
  assert.equal(btc.props.subtitle,'1 BTC = 50000');
  assert.equal(btc.props.description,undefined);
  assert.deepEqual(btc.props.notes,['Incoming Bitcoin: 0.000001 BTC','Onchain deposits awaiting credit: 0.000002 BTC']);
  assert.equal(hbar.props.value,'20 HBAR');assert.equal(hbar.props.fiatValue,'≈ 2');
  assert.equal(hbar.props.subtitle,'1 HBAR = 0.1');
  const unavailable=fixture({spark:null,btcRate:0,hbarRate:0,sparkStatus:'error',sparkError:'unavailable'});screen=unavailable.render();
  const unknown=find(screen,node=>node.type?.name==='BalanceCard'&&node.props.asset==='bitcoin');
  assert.equal(unknown.props.value,'— BTC');assert.equal(unknown.props.fiatValue,'EUR estimate unavailable');
});

test('known coin holdings keep their values and layout during background balance refresh',()=>{
  const app=fixture({sparkStatus:'loading',hederaStatus:'loading'});const screen=app.render();
  for(const asset of ['bitcoin','hedera']) {
    const card=find(screen,node=>node.type?.name==='BalanceCard'&&node.props.asset===asset);
    assert.equal(card.props.loading,false);
    assert.equal(card.props.statusText,undefined);
    const rendered=card.type(card.props);
    assert.ok(find(rendered,node=>node.type==='text'&&node.props.children===card.props.subtitle));
    assert.ok(find(rendered,node=>node.type==='text'&&node.props.children===card.props.value));
    assert.equal(find(rendered,node=>node.type==='loading'),null);
  }
});

test('BTC and HBAR activities have one matching detail arrow beside the amount column',async()=>{
  for(const asset of ['SAT','HBAR']) {
    const app=fixture({local:[record(1,'2026-09-23T10:00:00Z',asset)]});
    app.render();app.refocus();await settle();
    const row=latestRow(app.render());
    const rendered=row.type({...row.props,transaction:{...row.props.transaction,
      ...(asset==='HBAR'?{explorerUrl:'https://hashscan.io/mainnet/transaction/synthetic'}:{}),
    }});
    const children=React.Children.toArray(rendered.props.children);
    assert.equal(children.filter(node=>node.type==='icon'&&node.props.name==='chevron-forward').length,1);
    assert.equal(find(children[2],node=>node.type==='icon'&&node.props.name==='chevron-forward'),null);
    rendered.props.onPress();
    assert.equal(app.render().type,'payment-details');
    app.blur();
  }
});

test('background activity refresh retains an existing EUR quote while enrichment is still loading',async()=>{
  const pending=[];
  const data={local:[record(1,'2026-09-23T10:00:00Z')],
    transactionQuotes:{'fixture-1':{asset:'BTC',eurPerCoin:50000}}};
  const app=fixture(data);app.render();app.refocus();await settle();app.render();
  data.beforeEnrich=()=>new Promise(resolve=>pending.push(resolve));
  app.poll();await settle();
  const row=latestRow(app.render());
  assert.equal(row.props.transaction.transactionRate.eurPerCoin,50000);
  assert.equal(row.props.transaction.transactionRatePending,false);
  assert.ok(pending.length>0);
  pending.forEach(resolve=>resolve());await settle();app.blur();
});

test('coin unit prices use their own timestamps when only the other asset was refreshed',()=>{
  const now=Date.now();
  const app=fixture({btcRatesAt:now-301_000,hbarRatesAt:now});
  const screen=app.render();
  assert.match(find(screen,node=>node.type?.name==='BalanceCard'&&node.props.asset==='bitcoin').props.subtitle,/last known/);
  assert.doesNotMatch(find(screen,node=>node.type?.name==='BalanceCard'&&node.props.asset==='hedera').props.subtitle,/last known/);
});

test('a known HBAR receipt stays visible while a slower fresh page is still loading',async()=>{
  const receipt={transactionId:'0.0.123@100.000000001',direction:'received',amountHbar:'2',result:'SUCCESS',occurredAt:'2026-09-30T10:00:00Z'};
  const data={'hedera history':[receipt]};const app=fixture(data);
  app.render();app.refocus();await settle();app.render();
  let release;data['hedera history']=()=>new Promise(resolve=>{release=resolve;});
  app.poll();await settle();
  assert.equal(latestRow(app.render()).props.transaction.asset,'HBAR');
  release([receipt]);await settle();app.blur();
});

test('changing wallet identity does not expose the previous wallet latest activity',async()=>{
  const data={publicKey:'first wallet',local:[record(1,'2026-09-30T10:00:00Z')]};const app=fixture(data);
  app.render();app.refocus();await settle();
  assert.equal(latestRow(app.render()).props.transaction.key,'fixture-1');
  data.publicKey='second wallet';data.local=[];
  assert.equal(latestRow(app.render()),null);
  app.refocus();await settle();assert.equal(latestRow(app.render()),null);app.blur();
});

test('a historical HBAR quote arriving later updates an already opened detail view and stays fixed when today price changes', async () => {
  const data={primaryReady:false,local:[record(7,'2026-09-23T10:00:00Z','HBAR')]};
  const app=fixture(data);app.render();app.refocus();await settle();
  const row=latestRow(app.render());row.props.openTransaction(row.props.transaction);
  let details=app.render();assert.equal(details.type,'payment-details');
  assert.equal(details.props.payment.transactionRatePending,true);
  const key=details.props.payment.key;
  app.storeRate(key,{asset:'HBAR',eurPerCoin:0.05});await settle();
  data.hbarRate=100;details=app.render();
  assert.equal(require('../lib/payment-details.ts').paymentEurQuote(details.props.payment,details.props.rates).eurValue,1);
  assert.equal(details.props.payment.transactionRatePending,false);
  app.blur();
});
