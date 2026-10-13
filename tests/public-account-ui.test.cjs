const test = require('node:test');
const assert = require('node:assert/strict');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const account = require('../lib/opago/public-account.ts');
const { WalletSession } = require('../lib/wallet-session.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const action = (tree, label) => nodes(tree).find(node => node.type === 'action' && node.props.label === label);
const input = (tree, label) => nodes(tree).find(node => node.type === 'input' && node.props.accessibilityLabel === label);
const session = () => ({ accessToken: 'test-only', expiresAt: Date.now() + 60000, identity: { opago_id: '00000000-0000-4000-8000-000000000001', tenant_id: 'opago', roles: ['PrivateCustomer'], email: 'private@example.test' } });
function screen(t, login = async () => session()) {
  let focused = true, background; const calls = [], navigation = [];
  const auth = { sparkWallet: {}, hederaPublicKey: 'wallet-one', isLocked: false }, wallet = new WalletSession(); wallet.unlock();
  const service = { resume: async () => null, login: async (...args) => { calls.push(args.slice(0, 2)); return login(...args); }, logout: async () => {}, client: { requestPasswordReset: async () => {} } };
  const app = hookFixture('components/opago/public-account-screen.tsx', () => ({
    '@react-navigation/native': { useIsFocused: () => focused },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, fn) => { background = fn; return { remove() {} }; } } },
    'expo-router': { useRouter: () => ({ push: value => navigation.push(value) }) },
    'expo-screen-capture': { usePreventScreenCapture() {} },
    '../../hooks/useWalletAuth': { useWalletAuth: () => auth }, '../../lib/wallet-session': { walletSession: wallet },
    '../../lib/opago/public-account-native': { nativePublicAccount: () => service }, '../../lib/opago/public-account': account,
    '../../lib/i18n': { t: value => value }, '../../lib/i18n/language': { languagePreference: { getSnapshot: () => ({ language: 'de' }) } },
    '../../lib/theme-styles': { themeColor: () => '#fff' }, './opago-ui': { Action: 'action', Card: 'card', Copy: 'copy', OpagoPage: 'page', TextInput: 'input', ui: { input: {} } },
  }), exports => exports.PublicAccountScreen());
  t.after(app.unmount);
  const fill = () => { let tree = app.render(); input(tree, 'Email address').props.onChangeText('private@example.test'); input(tree, 'Password').props.onChangeText(' test-password '); return app.render(); };
  return { ...app, fill, calls, service, auth, wallet, background: value => background(value), blur: () => { focused = false; app.render(); }, navigation };
}
test('native account screen submits once, clears password immediately, exposes only verified profile', async t => {
  let finish; const app = screen(t, () => new Promise(resolve => { finish = resolve; }));
  app.render(); await app.settle(); const tree = app.fill(), button = action(tree, 'Sign in to OPAGO');
  button.props.onPress(); button.props.onPress();
  assert.equal(app.calls.length, 1); assert.equal(input(app.render(), 'Password').props.value, '');
  finish(session()); const signed = await app.settle();
  assert.ok(action(signed, 'Sign out of OPAGO')); assert.equal(action(signed, 'Link this wallet to my OPAGO account'), undefined);
  assert.equal(action(signed, 'Activate my Lightning address'), undefined);
});
for (const event of ['lock', 'background', 'blur', 'wallet']) test('native account screen discards late login after ' + event, async t => {
  let finish; const app = screen(t, () => new Promise(resolve => { finish = resolve; }));
  app.render(); await app.settle(); action(app.fill(), 'Sign in to OPAGO').props.onPress();
  if (event === 'lock') { app.auth.isLocked = true; app.wallet.lock(); }
  if (event === 'background') app.background('background');
  if (event === 'blur') app.blur();
  if (event === 'wallet') { app.auth.hederaPublicKey = 'wallet-two'; app.auth.sparkWallet = {}; }
  app.render(); finish(session()); const tree = await app.settle();
  assert.equal(action(tree, 'Sign out of OPAGO'), undefined);
  const password = input(tree, 'Password'); if (password) assert.equal(password.props.value, '');
});
test('native account screen exposes safe failure and retry, not backend exception details', async t => {
  const app = screen(t, async () => { throw new Error('private credentials from backend'); });
  app.render(); await app.settle(); action(app.fill(), 'Sign in to OPAGO').props.onPress();
  const tree = await app.settle(); assert.match(tree.props.error, /temporarily unavailable/); assert.doesNotMatch(tree.props.error, /credentials/);
  assert.equal(tree.props.busy, false); assert.equal(input(tree, 'Password').props.value, '');
});
test('native account screen offers signup on config outage without photos or wallet mutations', async t => {
  const app = screen(t); app.service.resume = async () => { throw new account.PublicAccountError('unavailable'); };
  app.render(); const tree = await app.settle();
  assert.equal(nodes(tree).some(n => /photo|identity/i.test(n.props?.label || '')), false);
  action(tree, 'Create an OPAGO account').props.onPress();
  assert.deepEqual(app.navigation, ['/opago-signup']); assert.equal(app.calls.length, 0);
});
test('production account route cannot select the old OIDC/contract screen', t => {
  const old = global.__DEV__; global.__DEV__ = false; t.after(() => { global.__DEV__ = old; });
  const app = hookFixture('app/opago-account.tsx', () => ({
    'expo-router': { useLocalSearchParams: () => ({ test: '1' }) },
    '../components/opago/public-account-screen': { PublicAccountScreen: 'public-account' },
  }), exports => exports.default()); t.after(app.unmount);
  assert.equal(app.render().type, 'public-account');
});
