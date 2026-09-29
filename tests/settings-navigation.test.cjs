'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { hookFixture } = require('./react-hooks-fixture.cjs');

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (Array.isArray(tree)) {
    for (const child of tree) { const result = find(child, predicate); if (result) return result; }
    return null;
  }
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}

function text(tree) {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return tree?.props ? text(tree.props.children) : '';
}

function settingsFixture(t, initialSection = 'overview') {
  let section = initialSection;
  let focused = true;
  let back;
  let authorize = async () => 'test recovery words never from a real wallet';
  let authCalls = 0;
  const alerts = [];
  const native = {
    ActivityIndicator: 'Spinner', Text: 'Text', View: 'View', ScrollView: 'ScrollView', Modal: 'Modal',
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    StyleSheet: { create: value => value, hairlineWidth: 1 },
    Platform: { OS: 'android' },
    AppState: { addEventListener: () => ({ remove() {} }) },
    AccessibilityInfo: { setAccessibilityFocus() {} }, findNodeHandle: () => null,
    Keyboard: { dismiss() {} }, Alert: { alert: (...args) => alerts.push(args) },
    BackHandler: { addEventListener: (_name, handler) => { back = handler; return { remove() {} }; } },
  };
  const oldFrame = global.requestAnimationFrame;
  const oldCancel = global.cancelAnimationFrame;
  global.requestAnimationFrame = callback => { callback(); return 1; };
  global.cancelAnimationFrame = () => {};
  const router = { setParams: value => { section = value.section; }, replace() {} };
  const auth = {
    backupStatus: 'verified', hederaPublicKey: 'test-public-key',
    wipeWallet: async () => {}, refreshHederaAccount: async () => {}, markBackupVerified: async () => {}, lockWallet() {},
  };
  let menuExports;
  const menu = hookFixture('components/settings/settings-menu.tsx', () => ({
    'react-native': native,
    '@/lib/i18n': { t: message => message },
  }), exports => { menuExports = exports; });
  menu.render();
  const fixture = hookFixture('app/(tabs)/settings.tsx', hooks => ({
    'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/lib/i18n': { t: message => message },
    '@/hooks/useLanguage': { useLanguage() {} },
    '@/hooks/useWalletAuth': { useWalletAuth: () => auth },
    '@/lib/wallet-session': { walletSession: { capture: () => () => {} } },
    '@/lib/recovery-access': { readRecoveryPhraseForDisplay: () => { authCalls++; return authorize(); } },
    '@/lib/auth-diagnostics': { recordAuthDiagnostic() {}, categorizeAuthFailure: () => 'unknown' },
    '@/lib/storage': { getSecureItem: async () => 'test recovery words never from a real wallet', MNEMONIC_STORE_KEY: 'test' },
    '@/lib/config': { appConfig: {} },
    '@/components/ui/wallet-interaction': { TouchableOpacity: 'Button', TextInput: 'Input', WalletActivityBoundary: 'Boundary' },
    '@/components/navigation/close-wallet-screen': { CloseWalletScreen: 'Close' },
    '@/components/settings/settings-menu': { ...menuExports, SettingsMenu: 'Menu' },
    '@/components/settings/settings-transition': { SettingsTransition: 'Transition' },
    '@/components/settings/color-mode-picker': { ColorModePicker: 'Appearance' },
    '@/components/settings/language-picker': { LanguagePicker: 'Language' },
    '@/components/legal/legal-links': { LegalLinks: 'Legal' },
    '@/components/security/recovery-phrase': { ProtectedRecoveryPhrase: 'Recovery' },
    '@/components/security/backup-prompt': { BackupStatusNotice: 'BackupStatus' },
    '@/components/security/legacy-payment-review': { LegacyPaymentReview: 'Legacy' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-router': {
      useRouter: () => router,
      useLocalSearchParams: () => ({ section }),
      useFocusEffect: callback => hooks.useEffect(() => focused ? callback() : undefined, [callback, focused]),
    },
  }), exports => exports.default());
  t.after(() => {
    fixture.unmount(); menu.unmount();
    global.requestAnimationFrame = oldFrame;
    global.cancelAnimationFrame = oldCancel;
  });
  return {
    ...fixture, getSection: () => section, back: () => back(), alerts,
    setSection: value => { section = value; }, setFocused: value => { focused = value; },
    setAuthorization: value => { authorize = value; }, authCalls: () => authCalls,
  };
}

test('settings overview mounts only the selected page and Android back returns to the menu', t => {
  const ui = settingsFixture(t);
  let screen = ui.render();
  assert.equal(ui.authCalls(), 0);
  assert.equal(find(screen, node => node.type === 'Appearance'), null);
  assert.equal(find(screen, node => node.type === 'Recovery'), null);
  find(screen, node => node.type === 'Menu').props.onSelect('appearance');
  screen = ui.render();
  assert.ok(find(screen, node => node.type === 'Appearance'));
  assert.equal(find(screen, node => node.type === 'Menu'), null);
  assert.equal(ui.back(), true);
  screen = ui.render();
  assert.equal(ui.getSection(), 'overview');
  assert.ok(find(screen, node => node.type === 'Menu'));
  assert.equal(ui.back(), false);
});

test('help page no longer exposes the temporary diagnostic report action', t => {
  const ui = settingsFixture(t, 'help');
  const screen = ui.render();
  assert.ok(find(screen, node => node.type === 'Legal'));
  assert.equal(find(screen, node => node.type === 'Diagnostics'), null);
});

test('backup deep link requires explicit authorization and leaving clears revealed words', async t => {
  const ui = settingsFixture(t, 'security');
  let screen = ui.render();
  assert.equal(ui.authCalls(), 0);
  find(screen, node => node.type === 'Button' && text(node) === 'Show recovery words').props.onPress();
  screen = await ui.settle();
  assert.equal(ui.authCalls(), 1);
  assert.ok(find(screen, node => node.type === 'Recovery'));
  find(screen, node => node.props?.accessibilityLabel === 'Back to settings').props.onPress();
  ui.render();
  ui.setSection('security');
  screen = ui.render();
  assert.equal(find(screen, node => node.type === 'Recovery'), null);
  assert.ok(find(screen, node => node.type === 'Button' && text(node) === 'Show recovery words'));
});

test('late recovery authorization cannot reveal words after the settings tab loses focus', async t => {
  const ui = settingsFixture(t, 'security');
  let complete;
  ui.setAuthorization(() => new Promise(resolve => { complete = resolve; }));
  let screen = ui.render();
  find(screen, node => node.type === 'Button' && text(node) === 'Show recovery words').props.onPress();
  ui.render();
  ui.setFocused(false);
  ui.render();
  complete('test recovery words never from a real wallet');
  await ui.settle();
  ui.setFocused(true);
  screen = ui.render();
  assert.equal(find(screen, node => node.type === 'Recovery'), null);
  assert.equal(find(screen, node => node.type === 'Modal').props.visible, false);
  assert.equal(ui.alerts.length, 0);
});
