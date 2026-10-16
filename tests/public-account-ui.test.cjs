const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const { nativeFixture, ready, account, tick } = require('./website-account-fixture.cjs');
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const content = value => Array.isArray(value) ? value.map(content).join(' ') : value && typeof value === 'object' ? content(value.props?.children) : typeof value === 'string' ? value : '';
const action = (tree, label) => nodes(tree).find(node => node.type === 'action' && node.props.label === label);
function screen(t, options = {}) {
  const f = nativeFixture(options), navigation = [];
  const auth = { sparkWallet: {}, hederaPublicKey: 'wallet-one', isLocked: false }; let focused = true;
  const app = hookFixture('components/opago/public-account-screen.tsx', () => ({
    '@react-navigation/native': { useIsFocused: () => focused }, 'react-native': { AppState: f.AppState },
    'expo-router': { useRouter: () => ({ replace: value => navigation.push(value) }) },
    'expo-screen-capture': { usePreventScreenCapture() {} }, '../../hooks/useWalletAuth': { useWalletAuth: () => auth },
    '../../lib/wallet-session': { walletSession: f.wallet }, '../../lib/opago/website-account-native': { nativeWebsiteAccount: () => f.flow },
    '../../lib/opago/website-account': account, '../../lib/i18n': { t: value => value },
    './opago-ui': { Action: 'action', Card: 'card', Copy: 'copy', OpagoPage: 'page' },
  }), exports => exports.PublicAccountScreen());
  t.after(app.unmount);
  return { ...app, ...f, auth, navigation, blur: () => { focused = false; app.render(); } };
}
test('actual production screen has both website actions, retry and independent local wallet entry, with no native inputs', async t => {
  const f = screen(t); const original = { ...f.auth }; f.render(); const tree = await f.settle();
  assert.equal(action(tree, 'Sign in').props.disabled, true); assert.equal(action(tree, 'Create account').props.disabled, true);
  assert.equal(action(tree, 'Check again').props.disabled, false); assert.equal(action(tree, 'Reset password'), undefined);
  assert.equal(nodes(tree).some(node => node.type === 'input'), false);
  assert.match(tree.props.error, /temporarily unavailable/); assert.match(content(tree), /BTC, Lightning and HBAR.*12 recovery words/);
  // Even a saved handler cannot bypass the fresh configuration gate.
  action(tree, 'Sign in').props.onPress(); await f.settle(); assert.equal(f.opened.length, 0);
  action(f.render(), 'Check again').props.onPress(); await f.settle(); assert.equal(f.http.length, 3);
  assert.ok(f.http.every(call => call.method === 'GET' && !call.body && call.url.endsWith('/app/config')));
  action(f.render(), 'Continue using my wallet').props.onPress(); assert.deepEqual(f.navigation, ['/']); assert.deepEqual(f.auth, original);
});
for (const label of ['Sign in', 'Create account']) test('screen ' + label + ' uses real flow and Expo adapter with synthetic confirmed availability', async t => {
  const f = screen(t, { availability: async () => ready() }); f.render(); let tree = await f.settle();
  assert.equal(action(tree, label).props.disabled, false);
  const button = action(tree, label); button.props.onPress(); button.props.onPress(); await tick();
  assert.deepEqual(f.opened, [ready().destinations[label === 'Sign in' ? 'login' : 'signup']]);
  f.change('background'); f.render(); assert.equal(f.wallet.isUnlocked(), true);
  f.change('active'); tree = await f.settle();
  assert.match(content(tree), /Sign-in has not been completed/); assert.equal(action(tree, 'Sign out of OPAGO'), undefined);
  assert.equal(action(tree, 'Link this wallet to my OPAGO account'), undefined); assert.equal(action(tree, 'Activate my Lightning address'), undefined);
  assert.deepEqual(f.http, []); // Synthetic resolver bypasses only config, never a password request.
});
for (const event of ['lock', 'unlock', 'blur', 'wallet', 'spark', 'unmount', 'local', 'cancel']) test('screen ignores delayed browser results after ' + event, async t => {
  let finish; const f = screen(t, { availability: async () => ready(), open: () => new Promise(r => { finish = r; }) });
  f.render(); await f.settle(); action(f.render(), 'Sign in').props.onPress(); await tick();
  if (event === 'lock') { f.auth.isLocked = true; f.wallet.lock(); }
  if (event === 'unlock') f.wallet.unlock();
  if (event === 'blur') f.blur();
  if (event === 'wallet') f.auth.hederaPublicKey = 'wallet-two';
  if (event === 'spark') f.auth.sparkWallet = {};
  if (event === 'local') action(f.render(), 'Continue using my wallet').props.onPress();
  if (event === 'cancel') action(f.render(), 'Cancel sign-in').props.onPress();
  if (event === 'unmount') f.unmount(); else f.render();
  finish({ type: 'cancel' }); await tick();
  if (event !== 'unmount') {
    const tree = await f.settle(); assert.doesNotMatch(content(tree), /Sign-in has not been completed|Signed in to OPAGO/);
    assert.equal(action(tree, 'Sign out of OPAGO'), undefined);
  }
  assert.equal(f.opened.length, 1);
});
test('background during configuration aborts and cannot open a website later', async t => {
  let resolve; const f = screen(t, { availability: () => new Promise(r => { resolve = r; }) });
  f.render(); f.change('inactive'); f.render(); resolve(ready()); await f.settle();
  assert.equal(f.opened.length, 0); f.change('active');
  assert.equal(action(f.render(), 'Sign in').props.disabled, true);
});
test('browser failure is safe, retryable and keeps local wallet navigation available', async t => {
  const f = screen(t, { availability: async () => ready(), open: async () => { throw new Error('private backend error'); } });
  f.render(); await f.settle(); action(f.render(), 'Sign in').props.onPress(); const tree = await f.settle();
  assert.match(tree.props.error, /temporarily unavailable/); assert.doesNotMatch(tree.props.error, /private backend/);
  assert.equal(action(tree, 'Check again').props.disabled, false); assert.ok(action(tree, 'Continue using my wallet'));
});
test('production account route ignores test and arbitrary callback parameters', t => {
  const old = global.__DEV__; global.__DEV__ = false; t.after(() => { global.__DEV__ = old; });
  const f = hookFixture('app/opago-account.tsx', () => ({
    'expo-router': { useLocalSearchParams: () => ({ test: '1', code: 'fake', access_token: 'fake', success: 'true' }) },
    '../components/opago/public-account-screen': { PublicAccountScreen: 'website-account' },
  }), exports => exports.default()); t.after(f.unmount); assert.equal(f.render().type, 'website-account');
});
test('direct signup route redirects to common account screen without consuming parameters', t => {
  const f = hookFixture('app/opago-signup.tsx', () => ({ 'expo-router': { Redirect: 'redirect' } }), exports => exports.default());
  t.after(f.unmount); assert.equal(f.render().type, 'redirect'); assert.equal(f.render().props.href, '/opago-account');
});
test('production website module graph cannot access passwords, account/session storage or F3 authority', () => {
  const root = path.resolve(__dirname, '..'), visited = new Set();
  function visit(relative) {
    const file = path.resolve(root, relative); if (visited.has(file)) return; visited.add(file);
    assert.doesNotMatch(file.replaceAll('\\', '/'), /\/(public-account(?:-session)?|signup|store-native|oidc-native|bootstrap-native)\.ts$/);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
    for (const [, name] of compiled.matchAll(/require\("([^"\n]+)"\)/g)) {
      if (!name.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), name);
      // UI, wallet unlocking and common HTTP dependencies have independent coverage;
      // follow the entire account implementation, including erased type imports.
      if (target.includes(path.join('lib', 'opago'))) {
        for (const extension of ['.ts', '.tsx']) if (fs.existsSync(target + extension)) visit(path.relative(root, target + extension));
      }
    }
  }
  visit('components/opago/public-account-screen.tsx');
  assert.ok([...visited].some(file => file.endsWith('website-account-native.ts')));
});
test('new browser copy is translated for every supported non-English language', () => {
  const { signupMessages } = require('../lib/i18n/signup-messages.ts');
  const source = fs.readFileSync(path.join(__dirname, '../components/opago/public-account-screen.tsx'), 'utf8');
  const copy = [...source.matchAll(/(?:label=|setNotice\()["']([^"']+)["']/g)].map(match => match[1]);
  copy.push(account.websiteAccountMessage(), 'Sign in or create your account on the OPAGO website. Your browser handles your password and security checks.');
  for (const language of ['de', 'fr', 'es', 'it']) for (const key of copy) assert.ok(signupMessages(language)[key], language + ': ' + key);
});
