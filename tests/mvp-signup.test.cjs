// Legacy API client compatibility tests; not a production signup path.
const test = require('node:test');
const assert = require('node:assert/strict');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const signup = require('../lib/opago/signup.ts');
const { signupMessages } = require('../lib/i18n/signup-messages.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object' ? text(tree.props?.children) : typeof tree === 'string' ? tree : '';
const fields = { email: ' PRIVATE@example.test ', phone: ' +49123456789 ', password: '  secret-test  ' };
const success = { status: 'created', account_state: 'active', email_verification: 'pending' };
const response = (data = success, status = 201, extra = {}) => ({ status, body: JSON.stringify(data), contentType: 'application/json', ...extra });
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

test('contract account screen offers signup even when services are unavailable, with no photo onboarding entry', t => {
  const old = global.__DEV__; global.__DEV__ = false; t.after(() => { global.__DEV__ = old; });
  const navigation = [];
  const app = hookFixture('app/opago-account.tsx', () => ({
    'expo-router': { useLocalSearchParams: () => ({}), useRouter: () => ({ push: path => navigation.push(path) }) },
    '../hooks/useOpagoAccount': { useOpagoAccount: () => ({ runtime: null, busy: false, error: '', run() {} }) },
    '../lib/opago/address': { activeLightningAddress: () => null }, '../lib/opago/account': { photoMatchReady: () => false },
    '../lib/theme-styles': { themeColor: () => '#fff' }, '../lib/i18n': { t: s => s },
    '../components/opago/opago-ui': { Action: 'action', Copy: 'copy', Card: 'card', OpagoPage: 'page', TextInput: 'input', ui: { input: {} } },
  }), module => module.ContractAccountScreen());
  t.after(() => app.unmount());
  const actions = nodes(app.render()).filter(n => n.type === 'action');
  assert.equal(actions.some(n => /identity|photo/i.test(n.props.label)), false);
  actions.find(n => n.props.label === 'Create an OPAGO account').props.onPress();
  assert.deepEqual(navigation, ['/opago-signup']);
  assert.match(text(app.render()), /local BTC, Lightning and HBAR wallet works without an OPAGO account/);
});

test('contract signed-in pending email is shown as a binding prerequisite and account status can refresh without a wallet session', async t => {
  const old = global.__DEV__; global.__DEV__ = false; t.after(() => { global.__DEV__ = old; });
  let reads = 0;
  const state = { credential: {}, account: { email_verified: false }, wallet: null, session: null };
  const account = { state, walletAvailable: true, addressReady: () => false, refreshAccount: async () => { reads++; state.account.email_verified = true; } };
  const app = hookFixture('app/opago-account.tsx', () => ({
    'expo-router': { useLocalSearchParams: () => ({}), useRouter: () => ({ push() {} }) },
    '../hooks/useOpagoAccount': { useOpagoAccount: () => ({ runtime: { account }, busy: false, error: '', run: fn => fn() }) },
    '../lib/opago/address': { activeLightningAddress: () => null }, '../lib/opago/account': { photoMatchReady: () => false },
    '../lib/theme-styles': { themeColor: () => '#fff' }, '../lib/i18n': { t: s => s },
    '../components/opago/opago-ui': { Action: 'action', Copy: 'copy', Card: 'card', OpagoPage: 'page', TextInput: 'input', ui: { input: {} } },
  }), module => module.ContractAccountScreen());
  t.after(() => app.unmount());
  const action = label => nodes(app.render()).find(n => n.type === 'action' && n.props.label === label);
  assert.match(text(app.render()), /You are signed in. Confirm your email before linking/);
  assert.equal(action('Sign in again').props.disabled, false);
  assert.equal(action('Link this wallet to my OPAGO account').props.disabled, true);
  action('Refresh account details').props.onPress(); await app.settle();
  assert.equal(reads, 1); assert.doesNotMatch(text(app.render()), /Confirm your email before linking/);
  assert.equal(state.wallet, null); assert.equal(state.session, null);
});
