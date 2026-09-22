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
function fixture(options = {}) {
  const calls = [];
  const saved = options.saved;
  const client = { createLightningInvoice: async () => { calls.push('create'); return options.create(); } };
  const auth = { walletReady: true, backupStatus: 'verified', sparkWallet: client };
  const app = hookFixture('app/(tabs)/receive.tsx', () => ({
    'react-native': { View: 'view', Text: 'text', ScrollView: 'scroll', ActivityIndicator: 'loading', Alert: { alert: () => calls.push('alert') }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '@/lib/i18n': { t: (key, vars = {}) => key.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`) },
    '@/components/bitcoin/payment-ui': { bitcoinStyles: {}, BitcoinButton: 'bitcoin-button', BitcoinInfo: 'bitcoin-info', BitcoinMoney: 'bitcoin-money' },
    '@/lib/bitcoin/amount': require('../lib/bitcoin/amount.ts'),
    '@/hooks/useLanguage': { useLanguage() {} },
    'expo-router': { useRouter: () => ({}) }, '@react-navigation/native': { useIsFocused: () => true },
    '@/hooks/useWalletAuth': { useWalletAuth: () => auth }, '@/hooks/useExchangeRates': { useExchangeRates: () => ({ btcToEur: 50000, updatedAt: Date.now() }) },
    '@/components/ui/wallet-interaction': { TouchableOpacity: 'button', TextInput: 'input' },
    '@/components/ui/advanced-options': { AdvancedOptions: 'advanced' },
    '@/components/send/payment-back-button': { PaymentBackButton: 'back' },
    '@expo/vector-icons': { Ionicons: 'icon' }, 'expo-image': { Image: 'image' }, 'react-native-qrcode-svg': 'qr',
    '@/styles/send-styles': { sendStyles: {} }, '@/lib/wallet-assets': require('../lib/wallet-assets.ts'),
    '@/lib/config': { appConfig: { isMainnet: false, hederaNetwork: 'testnet' } },
    '@/lib/lightning': require('../lib/lightning.ts'), '@/lib/promise-timeout': require('../lib/promise-timeout.ts'),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    '@/lib/bitcoin/onchain': { bitcoinScope: async () => 'fixture-scope' },
    '@/lib/bitcoin/receive-archive': { archiveBitcoinRequest: async () => {} },
    '@/lib/wallet-session': { walletSession: { captureRuntime: () => () => {} } },
    '@/lib/payment-input': require('../lib/payment-input.ts'),
    '@/lib/retry': { exponentialBackoffDelay: () => 30000 },
    '@/lib/lightning/receive-status': { resolveLightningReceive: async () => options.status || 'waiting' },
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
  return { ...app, calls };
}
const request = expiresAt => ({ requestId: 'synthetic', paymentHash: 'a'.repeat(64), amountSats: 20, invoice: invoice(20, Math.floor(expiresAt / 1000) - 3600, { paymentHash: 'a'.repeat(64), expiry: false }), expiresAt, createdAt: new Date().toISOString() });

test('an expired restored request hides its QR, explains the status and offers a new request', async t => {
  const app = fixture({ saved: request(Date.now() - 1) }); t.after(app.unmount);
  app.render(); const screen = await app.settle();
  assert.match(text(screen), /request has expired/);
  assert.match(text(screen), /Create a new request/);
  assert.equal(nodes(screen).some(node => node.type === 'qr'), false);
  assert.equal(app.calls.includes('clear'), false);
});

test('proof-backed receive success survives activity/storage errors and dismisses after three seconds', async t => {
  const app = fixture({ saved: request(Date.now() + 60000), status: 'confirmed', storageFailure: true }); t.after(app.unmount);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  app.render(); const screen = await app.settle(); assert.match(text(screen), /Payment received/);
  t.mock.timers.tick(3001); const after = await app.settle();
  assert.doesNotMatch(text(after), /Payment received/);
  assert.match(text(after), /Receive Bitcoin/);
});

test('rapid double-tap creates one invoice; a result arriving after unmount cannot persist into another session', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const app = fixture({ create: () => pending });
  app.render(); let screen = await app.settle();
  nodes(screen).find(node => node.type === 'button' && text(node) === 'SAT').props.onPress();
  screen = app.render();
  nodes(screen).find(node => node.type === 'input').props.onChangeText('20');
  screen = app.render();
  const create = nodes(screen).find(node => node.type === 'button' && text(node) === 'Create request').props.onPress;
  create(); create(); assert.equal(app.calls.filter(call => call === 'create').length, 1);
  app.unmount(); resolve({ id: 'late', invoice: invoice(20) });
  await new Promise(done => setImmediate(done)); await new Promise(done => setImmediate(done));
  assert.equal(app.calls.includes('save'), false);
});
