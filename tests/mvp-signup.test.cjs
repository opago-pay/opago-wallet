const test = require('node:test');
const assert = require('node:assert/strict');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const signup = require('../lib/opago/signup.ts');
const { WalletSession } = require('../lib/wallet-session.ts');
const { signupMessages } = require('../lib/i18n/signup-messages.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object' ? text(tree.props?.children) : typeof tree === 'string' ? tree : '';
const fields = { email: ' PRIVATE@example.test ', phone: ' +49123456789 ', password: '  secret-test  ' };
const success = { status: 'created', account_state: 'active', email_verification: 'pending' };
const response = (data = success, status = 201, extra = {}) => ({ status, body: JSON.stringify(data), contentType: 'application/json', ...extra });
function screen(t, send = async () => success) {
  let focused = true, background;
  const auth = { hederaPublicKey: 'existing-wallet', sparkWallet: {}, isLocked: false };
  const session = new WalletSession(); session.unlock();
  const navigation = [], calls = [];
  const app = hookFixture('app/opago-signup.tsx', () => ({
    '@react-navigation/native': { useIsFocused: () => focused },
    'expo-router': { useRouter: () => ({ replace: path => navigation.push(path) }) },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, fn) => { background = fn; return { remove() {} }; } } },
    'expo-screen-capture': { usePreventScreenCapture() {} },
    '../hooks/useWalletAuth': { useWalletAuth: () => auth },
    '../lib/wallet-session': { walletSession: session }, '../lib/opago/signup': signup,
    '../lib/opago/signup-native': { submitPrivateSignup: (...args) => { calls.push({ fields: { ...args[0] }, language: args[1], signal: args[2] }); return send(...args); } },
    '../lib/i18n/language': { languagePreference: { getSnapshot: () => ({ language: 'de' }) } },
    '../lib/theme-styles': { themeColor: () => '#fff' }, '../lib/i18n': { t: s => s },
    '../components/opago/opago-ui': { Action: 'action', Card: 'card', Copy: 'copy', OpagoPage: 'page', TextInput: 'input', ui: { input: {} } },
    '../components/legal/legal-links': { LegalLinks: 'legal' },
  }), module => module.default());
  app.render(); t.after(() => app.unmount());
  return { app, auth, session, navigation, calls, background: state => background(state), focus: value => { focused = value; },
    inputs: () => nodes(app.render()).filter(node => node.type === 'input'),
    action: label => nodes(app.render()).find(node => node.type === 'action' && node.props.label === label),
    fill: () => { const values = [fields.email, fields.phone, fields.password]; nodes(app.render()).filter(node => node.type === 'input').forEach((node, i) => node.props.onChangeText(values[i])); app.render(); },
  };
}

test('validation normalizes contact data only, preserves password and counts API Unicode characters', () => {
  assert.deepEqual(Object.keys(signup.validateSignup(signup.emptySignup())), ['email', 'phone', 'password']);
  assert.deepEqual(signup.preparePrivateSignup(fields), { username: 'private@example.test', phone: '+49123456789', pw_signup: fields.password, customer_kind: 'private' });
  for (const phone of ['0123456', '0049123456', '+0123456', '+49 123456', '+49-123456', '+1234567890123456', '+4', '+４９１２３']) {
    assert.ok(signup.validateSignup({ ...fields, phone }).phone);
    assert.throws(() => signup.preparePrivateSignup({ ...fields, phone }));
  }
  assert.ok(signup.validateSignup({ ...fields, email: 'a'.repeat(321) + '@example.test' }).email);
  assert.ok(signup.validateSignup({ ...fields, password: '😀'.repeat(4) }).password);
  assert.deepEqual(signup.validateSignup({ ...fields, password: '😀'.repeat(8) }), {});
  assert.deepEqual(signup.validateSignup({ ...fields, password: '        ' }), {});
});

test('actual public client sends only private contract fields over one HTTPS POST', async () => {
  const calls = [];
  const client = new signup.PublicSignupClient('https://api.example.test', async (...args) => { calls.push(args); return response(); });
  assert.deepEqual(await client.signup({ ...fields, role: 'Staff', customer_kind: 'merchant' }, 'fr'), success);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://api.example.test/api/v2/user/signup');
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body), { ...signup.preparePrivateSignup(fields), language: 'en' });
  assert.equal(Object.keys(calls[0][1].headers).some(key => /authorization|tenant|cookie/i.test(key)), false);
  for (const origin of ['http://api.example.test', 'https://api.example.test/path', 'https://user@api.example.test']) assert.throws(() => new signup.PublicSignupClient(origin, () => {}));
});

test('only a complete closed success schema is accepted; account/contact states remain separate', async () => {
  for (const status of ['created', 'resumed']) for (const email_verification of ['pending', 'confirmed', 'not_required']) {
    const value = { ...success, status, email_verification };
    assert.deepEqual(await new signup.PublicSignupClient('https://api.example.test', async () => response(value)).signup(fields, 'de'), value);
  }
  for (const invalid of [{}, { status: 'created' }, { ...success, account_state: 'pending' }, { ...success, email_verification: 'verified' }, { ...success, access_token: 'secret' }]) {
    await assert.rejects(new signup.PublicSignupClient('https://api.example.test', async () => response(invalid)).signup(fields, 'de'), e => e.problem === 'unknown');
  }
  for (const invalid of [response(success, 200), response(success, 201, { contentType: 'text/html' }), response(success, 201, { body: '{"status":"created","status":"resumed","account_state":"active","email_verification":"pending"}' })]) {
    await assert.rejects(new signup.PublicSignupClient('https://api.example.test', async () => invalid).signup(fields, 'de'), e => e.problem === 'unknown');
  }
});

test('safe error classifications never retry or retain server data and honor numeric Retry-After', async () => {
  for (const [status, problem] of [[404, 'closed'], [409, 'conflict'], [422, 'invalid'], [429, 'rateLimited'], [401, 'unavailable'], [403, 'unavailable'], [502, 'unavailable'], [503, 'unavailable'], [504, 'unknown']]) {
    let calls = 0;
    const client = new signup.PublicSignupClient('https://api.example.test', async () => { calls++; return response({ detail: 'sensitive-raw-detail' }, status, { retryAfter: '60' }); });
    await assert.rejects(client.signup(fields, 'en'), e => e.problem === problem && !JSON.stringify(e).includes('sensitive') && !e.message.includes('sensitive') && (status !== 429 || e.retryAfterSeconds === 60));
    assert.equal(calls, 1);
  }
  let calls = 0;
  const client = new signup.PublicSignupClient('https://api.example.test', async () => { calls++; throw new Error('sensitive-transport-detail'); });
  await assert.rejects(client.signup(fields, 'en'), e => e.problem === 'unknown' && !e.message.includes('sensitive'));
  assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.signup(fields, 'en', controller.signal)); assert.equal(calls, 1);
});

test('screen single-flight and pending email success transition do not log in or mutate an existing wallet', async t => {
  let resolve; const f = screen(t, () => new Promise(r => { resolve = r; }));
  const original = { ...f.auth }; f.fill();
  const action = f.action('Create private account'); action.props.onPress(); action.props.onPress();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].fields.password, fields.password);
  assert.equal(f.inputs()[2].props.value, ''); assert.ok(f.inputs().every(n => n.props.editable === false));
  resolve(success); await f.app.settle();
  assert.match(text(f.app.render()), /Email confirmation is pending.*You can sign in now/);
  assert.match(text(f.app.render()), /does not sign you in, link your wallet/);
  assert.deepEqual(f.navigation, []); assert.deepEqual(f.auth, original);
  f.action('Sign in to OPAGO').props.onPress();
  assert.deepEqual(f.navigation, ['/opago-account']); assert.ok(f.inputs().every(n => n.props.value === ''));
});

test('lost response permits only explicit continuation using original contact data and reentered password', async t => {
  let attempts = 0;
  const f = screen(t, async () => { if (++attempts === 1) throw new signup.SignupError('unknown'); return { ...success, status: 'resumed' }; });
  f.fill(); f.action('Create private account').props.onPress(); await f.app.settle();
  assert.equal(attempts, 1); assert.match(text(f.app.render()), /result is unknown/);
  assert.equal(f.inputs()[2].props.value, ''); assert.equal(f.inputs()[0].props.editable, false);
  f.inputs()[2].props.onChangeText(fields.password); f.app.render();
  f.action('Continue registration with the same details').props.onPress(); await f.app.settle();
  assert.equal(attempts, 2); assert.deepEqual(f.calls[0].fields, f.calls[1].fields);
  assert.match(text(f.app.render()), /registration has been resumed/);
});

test('closed signup and conflict direct to login; rate limit blocks premature resubmission', async t => {
  for (const problem of ['closed', 'conflict', 'rateLimited']) {
    const f = screen(t, async () => { throw new signup.SignupError(problem, problem === 'rateLimited' ? 60 : 0); });
    f.fill(); f.action('Create private account').props.onPress(); await f.app.settle();
    assert.equal(f.action(problem === 'rateLimited' ? 'Continue registration with the same details' : 'Create private account').props.disabled, true);
    assert.equal(f.action('Already have an account? Sign in').props.disabled, undefined);
  }
});

test('abort, background, lock, session and wallet changes erase inputs and ignore delayed success', async t => {
  for (const invalidate of [f => f.session.lock(), f => f.session.unlock(), f => { f.auth.hederaPublicKey = 'other'; },
    f => { f.auth.sparkWallet = {}; }, f => { f.auth.isLocked = true; }, f => f.focus(false), f => f.background('inactive'),
    f => f.background('background'), f => f.action('Continue using my wallet').props.onPress()]) {
    let resolve; const f = screen(t, () => new Promise(r => { resolve = r; }));
    f.fill(); f.action('Create private account').props.onPress(); invalidate(f); f.app.render();
    assert.equal(f.calls[0].signal.aborted, true);
    resolve(success); await f.app.settle();
    assert.doesNotMatch(text(f.app.render()), /Your private account has been created/);
    f.focus(true); f.background('active'); f.auth.isLocked = false; f.app.render();
    assert.ok(f.inputs().every(n => n.props.value === ''));
  }
});

test('every new signup UI/error message has all supported translations', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../app/opago-signup.tsx'), 'utf8');
  const messages = [...source.matchAll(/(?:\bt\(|label=|title=)["']([^"']+)["']/g)].map(m => m[1]);
  for (const problem of ['invalid', 'closed', 'conflict', 'rateLimited', 'unavailable', 'unknown']) messages.push(signup.signupErrorMessage(new signup.SignupError(problem)));
  for (const lang of ['de', 'fr', 'es', 'it']) for (const message of messages) assert.ok(signupMessages(lang)[message], lang + ': ' + message);
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

test('unmount aborts transport and an older response cannot replace a later wallet registration', async t => {
  const replies = [];
  const f = screen(t, () => new Promise(resolve => replies.push(resolve)));
  f.fill(); f.action('Create private account').props.onPress();
  f.session.unlock(); f.app.render();
  f.fill(); f.action('Create private account').props.onPress();
  assert.equal(f.calls.length, 2); assert.equal(f.calls[0].signal.aborted, true);
  replies[0](success); await f.app.settle();
  assert.equal(f.action('Create private account').props.disabled, true);
  assert.doesNotMatch(text(f.app.render()), /Your private account has been created/);
  replies[1]({ ...success, status: 'resumed' }); await f.app.settle();
  assert.match(text(f.app.render()), /registration has been resumed/);
  let finish;
  const unmounted = screen(t, () => new Promise(resolve => { finish = resolve; }));
  unmounted.fill(); unmounted.action('Create private account').props.onPress();
  unmounted.app.unmount(); assert.equal(unmounted.calls[0].signal.aborted, true);
  finish(success); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unmounted.navigation, []);
});
