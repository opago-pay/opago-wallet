'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
require('./register-typescript.cjs');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const { invoice } = require('./lightning-invoice-fixture.cjs');
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
}
const text = node => nodes(node).filter(item => item.type === 'text').map(item => React.Children.toArray(item.props.children).filter(value => typeof value === 'string').join('')).join(' ');
const isQr = node => node.type === 'qr' || node.type?.type === 'qr';
function selectRoute(app, label) {
  let screen = app.render();
  nodes(screen).find(node => node.type === 'button' && node.props.accessibilityLabel?.startsWith('Via ')).props.onPress();
  screen = app.render();
  nodes(screen).find(node => node.type === 'button' && node.props.accessibilityRole === 'radio' && text(node).startsWith(label)).props.onPress();
  return app.render();
}
function openAmount(app) {
  const screen = app.render();
  nodes(screen).find(node => node.type === 'button' && node.props.accessibilityLabel === 'Add amount').props.onPress();
  return app.render();
}
function fixture(options = {}) {
  const calls = [];
  const saved = options.saved;
  const cache = options.cache || { address: null };
  const client = {
    createLightningInvoice: async ({ amountSats, memo }) => {
      calls.push(['create', amountSats]);
      calls.push(['memo', memo]);
      return options.create ? options.create(amountSats) : { id: `request-${amountSats}`, invoice: invoice(amountSats || null) };
    },
    getStaticDepositAddress: async () => { calls.push('fetch address'); return 'test-bitcoin-address'; },
  };
  const hederaAccount = { accountId: '0.0.123456' };
  const auth = { walletReady: true, backupStatus: 'verified', sparkWallet: client, hederaPublicKey: 'fixture-owner',
    hederaAccount, refreshHederaAccount: async () => hederaAccount };
  const app = hookFixture('app/(tabs)/receive.tsx', () => ({
    'react-native': { View: 'view', Text: 'text', ScrollView: 'scroll', ActivityIndicator: 'loading', Keyboard: { dismiss: () => {} }, useWindowDimensions: () => ({ width: 390 }), Alert: { alert: () => calls.push('alert') }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '@/lib/i18n': { t: (key, vars = {}) => key.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`), appLocale: () => 'en' },
    '@/components/bitcoin/payment-ui': { bitcoinStyles: {}, BitcoinButton: 'bitcoin-button', BitcoinInfo: 'bitcoin-info', BitcoinMoney: 'bitcoin-money' },
    '@/lib/bitcoin/amount': require('../lib/bitcoin/amount.ts'),
    '@/hooks/useLanguage': { useLanguage() {} },
    'expo-router': { useRouter: () => ({ replace: route => calls.push(['replace', route]) }) }, '@react-navigation/native': { useIsFocused: () => true },
    '@/hooks/useWalletAuth': { useWalletAuth: () => auth }, '@/hooks/useExchangeRates': { useExchangeRates: () => ({ btcToEur: 50000, updatedAt: Date.now() }) },
    '@/components/ui/wallet-interaction': { TouchableOpacity: 'button', TextInput: 'input' },
    '@/components/send/payment-back-button': { PaymentBackButton: 'back' },
    '@expo/vector-icons': { Ionicons: 'icon' }, 'expo-image': { Image: 'image' },
    'expo-clipboard': { setStringAsync: async value => { calls.push(['copied', value]); } },
    '@/components/receive/wallet-qr-code': { WalletQrCode: 'qr' },
    '@/styles/send-styles': { sendStyles: {} }, '@/lib/wallet-assets': require('../lib/wallet-assets.ts'),
    '@/lib/config': { appConfig: { isMainnet: false, hederaNetwork: 'testnet', sparkNetwork: 'REGTEST' } },
    '@/lib/lightning': require('../lib/lightning.ts'), '@/lib/promise-timeout': require('../lib/promise-timeout.ts'),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    '@/lib/bitcoin/onchain': { bitcoinScope: async () => 'REGTEST:fixture-scope' },
    '@/lib/bitcoin/destination': { validateBitcoinAddress: value => value },
    '@/lib/bitcoin/store-native': {
      bitcoinDepositWatch: { enable: async () => {} },
      bitcoinStaticAddressCache: {
        load: async () => cache.address,
        save: async (_scope, address) => { cache.address = address; },
      },
    },
    '@/lib/hedera/account': { loadHederaHistory: async () => [], findNewConfirmedIncomingHederaTransaction: () => null },
    '@/lib/hedera/payments': { buildHederaReceiveRequest: accountId => accountId,
      buildHederaWalletQrValue: accountId => accountId,
      parseHederaTransferTinybars: value => BigInt(Math.round(Number(value) * 1e8)) },
    '@/lib/hedera/config': { HEDERA_NETWORK: 'testnet', HEDERA_NETWORK_BADGE: 'TESTNET' },
    '@/lib/bitcoin/receive-archive': { archiveBitcoinRequest: async () => {} },
    '@/lib/wallet-session': { walletSession: { captureRuntime: () => () => {} } },
    '@/lib/payment-input': require('../lib/payment-input.ts'),
    '@/lib/payment-errors': { friendlyPaymentMessage: cause => cause instanceof Error ? cause.message : 'Unavailable' },
    '@/lib/retry': { exponentialBackoffDelay: () => 30000 },
    '@/lib/lightning/receive-status': { resolveLightningReceiveOutcome: async (_, savedRequest) => ({
      state: savedRequest.requestId === 'synthetic' ? options.status || 'waiting' : 'waiting',
      amountSats: savedRequest.amountSats || 34,
    }) },
    '@/lib/lightning/receive-store-native': { lightningReceiveStore: {
      load: async () => saved || null,
      save: async () => { calls.push('save'); },
      clear: async () => { calls.push('clear'); if (options.storageFailure) throw new Error('disk error'); },
    } },
    '@/lib/database': { addTransaction: async () => { calls.push('activity'); if (options.storageFailure) throw new Error('disk error'); } },
    '@/lib/optional-haptics': { notifyPaymentHaptics: async () => {} },
    'expo-haptics': { NotificationFeedbackType: { Success: 'success' } },
    'expo-notifications': { getPermissionsAsync: async () => ({ granted: false }) },
  }), exports => exports.default());
  return { ...app, calls, auth, cache };
}
const request = expiresAt => ({ scope: 'REGTEST:fixture-scope', requestId: 'synthetic', paymentHash: 'a'.repeat(64), amountSats: 20, invoice: 'lightning:' + invoice(20, Math.floor(expiresAt / 1000) - 3600, { paymentHash: 'a'.repeat(64), expiry: false }), expiresAt, createdAt: new Date().toISOString() });

test('Receive opens on the QR, with optional amount and payment routes behind small controls', async t => {
  const app = fixture(); t.after(app.unmount);
  app.render(); await app.settle();
  await new Promise(done => setTimeout(done, 10));
  let screen = await app.settle();
  assert.match(text(screen), /Receive Bitcoin/);
  assert.ok(nodes(screen).some(isQr));
  assert.equal(nodes(screen).some(node => node.type === 'input'), false);
  assert.ok(nodes(screen).some(node => node.type === 'button' && node.props.accessibilityLabel === 'Add amount'));
  assert.ok(nodes(screen).findIndex(node => node.props?.accessibilityLabel === 'Add amount') > nodes(screen).findIndex(isQr));
  assert.ok(nodes(screen).some(node => node.props?.style?.borderRadius === 24 && node.props?.style?.backgroundColor === '#fff'));
  assert.ok(app.calls.some(call => Array.isArray(call) && call[0] === 'memo' && call[1] === 'Opago'));
  assert.ok(nodes(screen).some(node => node.type === 'button' && node.props.accessibilityLabel === 'Via Lightning'));
  assert.equal(nodes(screen).some(node => node.type === 'advanced'), false);

  nodes(screen).find(node => node.type === 'button' && node.props.accessibilityLabel === 'Via Lightning').props.onPress();
  screen = app.render();
  assert.match(text(screen), /Receive from a Lightning wallet/);
  assert.match(text(screen), /Receive to a Bitcoin address/);
  assert.doesNotMatch(text(screen), /Receive to your Hedera account/);
  assert.ok(nodes(screen).some(node => node.props?.accessibilityLabel === 'Show all coins'));
  nodes(screen).find(node => node.type === 'button' && node.props.accessibilityLabel === 'Via Lightning').props.onPress();

  screen = openAmount(app);
  assert.ok(nodes(screen).findIndex(node => node.type === 'input') < nodes(screen).findIndex(isQr));
  assert.ok(nodes(screen).findIndex(node => node.type === 'button' && node.props.accessibilityRole === 'radio' && text(node).includes('SAT')) < nodes(screen).findIndex(node => node.type === 'input'));
  assert.equal(nodes(screen).some(node => node.type === 'button' && text(node) === 'Done'), false);
  nodes(screen).find(node => node.type === 'button' && node.props.accessibilityRole === 'radio' && text(node).includes('SAT')).props.onPress();
  screen = app.render();
  nodes(screen).find(node => node.type === 'input').props.onChangeText('20');
  screen = app.render();
  await new Promise(done => setTimeout(done, 550));
  screen = await app.settle();
  assert.ok(nodes(screen).some(node => node.type === 'input'));
  assert.equal(nodes(screen).find(isQr).props.value.startsWith('lightning:'), true);
  assert.deepEqual(app.calls.filter(call => Array.isArray(call) && call[0] === 'create'), [['create', 0], ['create', 20]]);
  assert.equal(require('../lib/lightning.ts').decodeLightningInvoice(nodes(screen).find(isQr).props.value).amountSats, 20);
});

test('switching between Lightning and Bitcoin keeps the same unpaid request and prepared address', async t => {
  const app = fixture(); t.after(app.unmount);
  app.render(); await app.settle();
  await new Promise(done => setTimeout(done, 10));
  let screen = await app.settle();
  const lightningCode = nodes(screen).find(isQr).props.value;
  selectRoute(app, 'Bitcoin network');
  screen = await app.settle();
  assert.equal(nodes(screen).find(isQr).props.value, 'bitcoin:test-bitcoin-address');
  selectRoute(app, 'Lightning');
  screen = await app.settle();
  assert.equal(nodes(screen).find(isQr).props.value, lightningCode);
  assert.deepEqual(app.calls.filter(call => Array.isArray(call) && call[0] === 'create'), [['create', 0]]);
  assert.equal(app.calls.includes('clear'), false);
});

test('reopening restores a valid wallet-bound unpaid Lightning request without creating another', async t => {
  const saved = request(Date.now() + 120_000);
  const app = fixture({ saved }); t.after(app.unmount);
  app.render(); let screen = await app.settle();
  assert.equal(nodes(screen).find(isQr).props.value, saved.invoice);
  assert.equal(app.calls.some(call => Array.isArray(call) && call[0] === 'create'), false);
  selectRoute(app, 'Bitcoin network');
  screen = await app.settle();
  selectRoute(app, 'Lightning');
  screen = await app.settle();
  assert.equal(nodes(screen).find(isQr).props.value, saved.invoice);
});

test('a wallet change hides the previous QR before asynchronous restoration finishes', async t => {
  const app = fixture(); t.after(app.unmount);
  app.render(); await app.settle();
  await new Promise(done => setTimeout(done, 10));
  let screen = await app.settle();
  assert.ok(nodes(screen).some(isQr));
  app.auth.hederaPublicKey = 'another-wallet';
  app.auth.sparkWallet = { ...app.auth.sparkWallet };
  screen = app.render();
  assert.equal(nodes(screen).some(isQr), false);
});

test('a cached on-chain address is reused after the Receive screen is reopened', async t => {
  const cache = { address: null };
  const first = fixture({ cache });
  first.render(); await first.settle();
  await new Promise(done => setTimeout(done, 10));
  let screen = await first.settle();
  selectRoute(first, 'Bitcoin network');
  screen = await first.settle();
  assert.equal(nodes(screen).find(isQr).props.value, 'bitcoin:test-bitcoin-address');
  assert.equal(first.calls.filter(call => call === 'fetch address').length, 1);
  first.unmount();
  const second = fixture({ cache }); t.after(second.unmount);
  second.render(); screen = await second.settle();
  selectRoute(second, 'Bitcoin network');
  screen = await second.settle();
  assert.equal(nodes(screen).find(isQr).props.value, 'bitcoin:test-bitcoin-address');
  assert.equal(second.calls.includes('fetch address'), false);
});

test('an expired restored request is replaced by an open Lightning QR without tapping a button', async t => {
  const app = fixture({ saved: request(Date.now() - 1) }); t.after(app.unmount);
  app.render(); await app.settle();
  await new Promise(done => setTimeout(done, 20));
  const screen = await app.settle();
  assert.match(text(screen), /Show this code to receive Bitcoin/);
  assert.equal(nodes(screen).find(isQr).props.value.startsWith('lightning:'), true);
  assert.deepEqual(app.calls.filter(call => Array.isArray(call) && call[0] === 'create'), [['create', 0]]);
  assert.equal(app.calls.includes('clear'), false);
});

test('proof-backed receive success survives activity/storage errors and returns Home after three seconds', async t => {
  const app = fixture({ saved: request(Date.now() + 60000), status: 'confirmed', storageFailure: true }); t.after(app.unmount);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  app.render(); const screen = await app.settle(); assert.match(text(screen), /Payment received/);
  t.mock.timers.tick(3001); const after = await app.settle();
  assert.doesNotMatch(text(after), /Payment received/);
  assert.deepEqual(app.calls.filter(call => Array.isArray(call) && call[0] === 'replace'), [['replace', '/(tabs)']]);
});

test('Request another payment stays on Receive instead of returning Home', async t => {
  const app = fixture({ saved: request(Date.now() + 60000), status: 'confirmed' }); t.after(app.unmount);
  app.render(); const screen = await app.settle();
  nodes(screen).find(node => node.type === 'button' && text(node) === 'Request another payment').props.onPress();
  const after = await app.settle();
  assert.match(text(after), /Receive Bitcoin/);
  assert.equal(app.calls.some(call => Array.isArray(call) && call[0] === 'replace'), false);
});

test('a pending open invoice cannot persist after amount change and unmount', async t => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const app = fixture({ create: () => pending });
  t.after(() => { app.unmount(); resolve({ id: 'late', invoice: invoice(null) }); });
  app.render(); let screen = await app.settle();
  await new Promise(done => setTimeout(done, 10)); screen = await app.settle();
  assert.deepEqual(app.calls.filter(call => Array.isArray(call) && call[0] === 'create'), [['create', 0]]);
  screen = openAmount(app);
  nodes(screen).find(node => node.type === 'input').props.onChangeText('20');
  screen = app.render();
  assert.equal(nodes(screen).some(isQr), false);
  app.unmount(); resolve({ id: 'late', invoice: invoice(null) });
  await new Promise(done => setImmediate(done)); await new Promise(done => setImmediate(done));
  assert.equal(app.calls.includes('save'), false);
});

test('typing SAT replaces the visible Lightning QR with an invoice for exactly that amount', async t => {
  const app = fixture(); t.after(app.unmount);
  app.render(); let screen = await app.settle();
  await new Promise(done => setTimeout(done, 10)); screen = await app.settle();
  assert.equal(nodes(screen).find(isQr).props.value.startsWith('lightning:'), true);
  screen = openAmount(app);
  nodes(screen).find(node => node.type === 'button' && node.props.accessibilityRole === 'radio' && text(node).includes('SAT')).props.onPress();
  screen = app.render();
  nodes(screen).find(node => node.type === 'input').props.onChangeText('20');
  screen = app.render();
  assert.equal(nodes(screen).some(isQr), false);
  await new Promise(done => setTimeout(done, 550));
  screen = await app.settle();
  assert.deepEqual(app.calls.filter(call => Array.isArray(call) && call[0] === 'create'), [['create', 0], ['create', 20]]);
  assert.equal(require('../lib/lightning.ts').decodeLightningInvoice(nodes(screen).find(isQr).props.value).amountSats, 20);
});

test('Bitcoin network selection exposes the on-chain QR immediately and encodes an entered SAT amount', async t => {
  const app = fixture(); t.after(app.unmount);
  app.render(); let screen = await app.settle();
  selectRoute(app, 'Bitcoin network');
  screen = await app.settle();
  assert.equal(nodes(screen).find(isQr).props.value, 'bitcoin:test-bitcoin-address');
  screen = openAmount(app);
  nodes(screen).find(node => node.type === 'button' && node.props.accessibilityRole === 'radio' && text(node).includes('SAT')).props.onPress();
  screen = app.render();
  nodes(screen).find(node => node.type === 'input').props.onChangeText('200');
  screen = app.render();
  assert.equal(nodes(screen).find(isQr).props.value, 'bitcoin:test-bitcoin-address?amount=0.00000200');
  nodes(screen).find(node => node.type === 'button' && text(node) === 'Copy').props.onPress();
  await app.settle();
  assert.deepEqual(app.calls.find(call => Array.isArray(call) && call[0] === 'copied'), ['copied', 'bitcoin:test-bitcoin-address?amount=0.00000200']);
});

test('Show all coins reveals HBAR in the network picker and opens its account QR', async t => {
  const app = fixture(); t.after(app.unmount);
  app.render(); let screen = await app.settle();
  nodes(screen).find(node => node.props.accessibilityLabel === 'Via Lightning').props.onPress();
  screen = app.render();
  assert.doesNotMatch(text(screen), /Receive to your Hedera account/);
  nodes(screen).find(node => node.props.accessibilityLabel === 'Show all coins').props.onPress();
  screen = app.render();
  assert.match(text(screen), /Receive from a Lightning wallet/);
  assert.match(text(screen), /Receive to a Bitcoin address/);
  assert.match(text(screen), /Receive to your Hedera account/);
  nodes(screen).find(node => node.type === 'button' && text(node).startsWith('HBAR')).props.onPress();
  screen = await app.settle();
  assert.equal(nodes(screen).find(isQr).props.value, '0.0.123456');
  assert.match(text(screen), /Enter the amount in the sending wallet/);
  assert.equal(nodes(screen).some(node => node.type === 'button' && node.props.accessibilityLabel === 'Add amount'), false);
});
