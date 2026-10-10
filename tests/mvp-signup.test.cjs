const test = require('node:test');
const assert = require('node:assert/strict');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const signup = require('../lib/opago/signup.ts');
const { WalletSession } = require('../lib/wallet-session.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object' ? text(tree.props?.children) : typeof tree === 'string' ? tree : '';
function screen(t) {
  let focused = true, background;
  const auth = { hederaPublicKey: 'existing-wallet', sparkWallet: {}, isLocked: false };
  const session = new WalletSession(); session.unlock();
  const navigation = [];
  const app = hookFixture('app/opago-signup.tsx', () => ({
    '@react-navigation/native': { useIsFocused: () => focused },
    'expo-router': { useRouter: () => ({ replace: path => navigation.push(path) }) },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, fn) => { background = fn; return { remove() {} }; } } },
    'expo-screen-capture': { usePreventScreenCapture() {} },
    '../hooks/useWalletAuth': { useWalletAuth: () => auth },
    '../lib/wallet-session': { walletSession: session }, '../lib/opago/signup': signup,
    '../lib/theme-styles': { themeColor: () => '#fff' }, '../lib/i18n': { t: s => s },
    '../components/opago/opago-ui': { Action: 'action', Card: 'card', Copy: 'copy', OpagoPage: 'page', TextInput: 'input', ui: { input: {} } },
    '../components/legal/legal-links': { LegalLinks: 'legal' },
  }), module => module.default());
  app.render(); t.after(() => app.unmount());
  return { app, auth, session, navigation, background: state => background(state), focus: value => { focused = value; },
    inputs: () => nodes(app.render()).filter(node => node.type === 'input'),
    action: label => nodes(app.render()).find(node => node.type === 'action' && node.props.label === label),
    fill: () => { const values = ['new@example.test', '+49123456789', 'synthetic-password']; nodes(app.render()).filter(node => node.type === 'input').forEach((node, i) => node.props.onChangeText(values[i])); app.render(); },
  };
}

test('three-field preparation validates known constraints without guessing phone format or IdP rules', () => {
  assert.deepEqual(Object.keys(signup.validateSignup(signup.emptySignup())), ['email', 'phone', 'password']);
  assert.ok(signup.validateSignup({ email: 'invalid', phone: ' ', password: 'short' }).email);
  const fields = { email: ' PRIVATE@example.test ', phone: ' 0123456 ', password: '  secret-test  ' };
  assert.deepEqual(signup.preparePrivateSignup(fields), { username: 'private@example.test', phone: '0123456', pw_signup: fields.password, customer_kind: 'private' });
  assert.equal(signup.signupAvailable, false);
  assert.throws(() => signup.preparePrivateSignup(signup.emptySignup()), /Invalid signup fields/);
});

test('actual signup screen exposes exactly three fields and cannot submit or claim successful registration', t => {
  const f = screen(t); f.fill();
  assert.deepEqual(f.inputs().map(n => n.props.accessibilityLabel), ['Email address', 'Mobile number', 'Password']);
  assert.equal(f.inputs()[2].props.secureTextEntry, true);
  assert.equal(f.action('Create private account').props.disabled, true);
  assert.match(text(f.app.render()), /does not send or save your details and cannot create an account/);
  assert.match(text(f.app.render()), /does not verify it/);
  assert.match(text(f.app.render()), /No identity photos are required/);
  assert.match(text(f.app.render()), /do not submit it again/);
  f.inputs()[0].props.onChangeText('bad'); f.app.render(); f.inputs()[0].props.onBlur();
  assert.match(text(f.app.render()), /Enter a valid email/);
});

test('lock, logout, account/wallet change, navigation and background clear transient credentials', t => {
  const f = screen(t);
  for (const invalidate of [() => f.session.lock(), () => { f.auth.hederaPublicKey = 'other-wallet'; },
    () => { f.auth.sparkWallet = {}; }, () => { f.auth.isLocked = true; }, () => f.focus(false), () => f.background('background')]) {
    f.fill(); invalidate(); f.app.render();
    f.focus(true); f.background('active'); f.auth.isLocked = false; f.app.render();
    assert.ok(f.inputs().every(n => n.props.value === ''));
  }
  f.fill(); f.action('Already have an account? Sign in').props.onPress();
  assert.deepEqual(f.navigation, ['/opago-account']); assert.ok(f.inputs().every(n => n.props.value === ''));
  f.fill(); f.action('Continue using my wallet').props.onPress();
  assert.deepEqual(f.navigation, ['/opago-account', '/(tabs)']); assert.ok(f.inputs().every(n => n.props.value === ''));
});

test('historical identity deep link redirects without importing photo intake or account runtime', () => {
  const app = hookFixture('app/identity.tsx', () => ({ 'expo-router': { Redirect: 'redirect' } }), module => module.default());
  assert.equal(app.render().type, 'redirect'); assert.equal(app.render().props.href, '/opago-signup'); app.unmount();
});

test('account screen offers signup even when services are unavailable, with no photo onboarding entry', t => {
  const old = global.__DEV__; global.__DEV__ = false; t.after(() => { global.__DEV__ = old; });
  const navigation = [];
  const app = hookFixture('app/opago-account.tsx', () => ({
    'expo-router': { useLocalSearchParams: () => ({}), useRouter: () => ({ push: path => navigation.push(path) }) },
    '../hooks/useOpagoAccount': { useOpagoAccount: () => ({ runtime: null, busy: false, error: '', run() {} }) },
    '../lib/opago/address': { activeLightningAddress: () => null }, '../lib/opago/account': { photoMatchReady: () => false },
    '../lib/theme-styles': { themeColor: () => '#fff' }, '../lib/i18n': { t: s => s },
    '../components/opago/opago-ui': { Action: 'action', Copy: 'copy', Card: 'card', OpagoPage: 'page', TextInput: 'input', ui: { input: {} } },
  }), module => module.default());
  t.after(() => app.unmount());
  const actions = nodes(app.render()).filter(n => n.type === 'action');
  assert.equal(actions.some(n => /identity|photo/i.test(n.props.label)), false);
  actions.find(n => n.props.label === 'Create an OPAGO account').props.onPress();
  assert.deepEqual(navigation, ['/opago-signup']);
  assert.match(text(app.render()), /local BTC, Lightning and HBAR wallet works without an OPAGO account/);
});
