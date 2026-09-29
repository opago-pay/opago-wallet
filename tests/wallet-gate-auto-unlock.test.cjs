'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { hookFixture } = require('./react-hooks-fixture.cjs');

const waitForPrompt = () => new Promise(resolve => setTimeout(resolve, 260));

function gateFixture(t, os = 'ios') {
  const listeners = new Set();
  const appState = { currentState: 'active', addEventListener: (_name, listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  } };
  let unlocks = 0;
  const auth = {
    securityReady: true, hasStoredWallet: true, isLocked: true, walletReady: false,
    recoveryRequired: false, error: null,
    unlockWallet: async () => { unlocks++; throw new Error('Face ID cancelled'); },
    loadOrGenerateWallet: async () => {},
  };
  const app = hookFixture('components/security/wallet-gate.tsx', () => ({
    'react-native': { AppState: appState, Platform: { OS: os }, ActivityIndicator: 'spinner',
      ScrollView: 'scroll', Text: 'text', View: 'view', StyleSheet: { create: value => value, absoluteFill: {} } },
    '@/lib/i18n': { t: value => value },
    '@/hooks/useLanguage': { useLanguage() {} },
    '@/hooks/useWalletAuth': { useWalletAuth: () => auth },
    '@/components/ui/wallet-interaction': { TouchableOpacity: 'button', WalletActivityBoundary: 'boundary' },
    '@/components/legal/legal-links': { LegalLinks: 'legal' },
    '@expo/vector-icons': { Ionicons: 'icon' },
    'expo-router': { useRouter: () => ({ replace() {} }), useSegments: () => ['(tabs)'] },
  }), exports => exports.WalletGate({ children: 'wallet' }));
  t.after(app.unmount);
  return { ...app, auth, unlocks: () => unlocks, changeState: state => {
    appState.currentState = state;
    for (const listener of listeners) listener(state);
  } };
}

test('iOS opens Face ID once on launch and once on a later foreground visit, without looping after cancellation', async t => {
  const app = gateFixture(t);
  assert.equal(app.render().type, 'view');
  await waitForPrompt();
  assert.equal((await app.settle()).type, 'scroll');
  assert.equal(app.unlocks(), 1);
  await waitForPrompt();
  app.render();
  assert.equal(app.unlocks(), 1);

  app.changeState('background');
  app.render();
  app.changeState('active');
  app.render();
  await waitForPrompt();
  await app.settle();
  assert.equal(app.unlocks(), 2);
});

test('Android does not start an unlock prompt automatically', async t => {
  const app = gateFixture(t, 'android');
  app.render();
  await waitForPrompt();
  assert.equal(app.unlocks(), 0);
});

test('locking an already open wallet while still foreground does not summon Face ID', async t => {
  const app = gateFixture(t);
  app.auth.isLocked = false;
  app.auth.walletReady = true;
  app.render();
  app.auth.isLocked = true;
  app.auth.walletReady = false;
  app.render();
  await waitForPrompt();
  assert.equal(app.unlocks(), 0);
});
