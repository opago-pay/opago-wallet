'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const existingModules = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { OidcAccountLogin } = require('../lib/opago/oidc.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { F3ContractTestBackend } = require('../lib/opago/test-adapter.ts');
const { OpagoAccount } = require('../lib/opago/account.ts');
const { OpagoApi, OpagoError } = require('../lib/opago/api.ts');
const { assertContract } = require('../lib/opago/contract.ts');
const { WalletSession } = require('../lib/wallet-session.ts');
for (const name of Object.keys(require.cache)) if (name.endsWith('.ts') && !existingModules.has(name)) delete require.cache[name];

const config = { issuer: 'https://identity.example/realms/test', clientId: 'wallet-test', redirectUri: 'opagowallet://oidc-callback',
  authorizationEndpoint: 'https://identity.example/realms/test/protocol/openid-connect/auth', tokenEndpoint: 'https://identity.example/realms/test/protocol/openid-connect/token' };
const trusted = { issuers: [config.issuer], redirectUris: [config.redirectUri], accessAudience: 'https://api.test.example' };
function oidcFixture() {
  const now = Date.now(); let nonce; let authorize; let form; let count = 0;
  const claims = { issuer: config.issuer, audience: config.clientId, subject: 'synthetic-subject', expiresAt: now + 900_000,
    authTime: now, emailVerified: true, accessAudience: trusted.accessAudience, accessExpiresAt: now + 900_000 };
  const platform = {
    randomBytes: n => new Uint8Array(n).fill(++count),
    async browser(url, redirect) { authorize = new URL(url); nonce = authorize.searchParams.get('nonce'); return redirect + '?code=synthetic-code&state=' + authorize.searchParams.get('state'); },
    async token(_url, body) { form = body; return { access_token: 'synthetic-access', id_token: 'synthetic-id', refresh_token: 'synthetic-refresh' }; },
    async verify(_tokens, _config, expectedNonce) { assert.equal(expectedNonce, nonce); return { ...claims, nonce }; },
  };
  return { login: new OidcAccountLogin(config, trusted, platform, new MemoryPrivateStore(), () => now), platform, claims,
    auth: () => authorize, form: () => form };
}
test('F3 OIDC uses external browser, code + PKCE S256, random state/nonce and access token', async () => {
  const f = oidcFixture(); const result = await f.login.login(true);
  assert.equal(result.accessToken, 'synthetic-access'); assert.equal(f.auth().searchParams.get('response_type'), 'code');
  assert.equal(f.auth().searchParams.get('code_challenge_method'), 'S256'); assert.equal(f.auth().searchParams.get('prompt'), 'login');
  assert.notEqual(f.auth().searchParams.get('state'), f.auth().searchParams.get('nonce'));
  assert.equal(f.form().get('grant_type'), 'authorization_code'); assert.equal(f.form().has('client_secret'), false);
  assert.ok(f.form().get('code_verifier')); assert.equal((await f.login.refresh()).subject, result.subject);
  await f.login.logout(); await assert.rejects(f.login.refresh());
});
test('F3 OIDC rejects callback attacks, cancelled browser, unsigned claims, stale auth and unverified contact', async () => {
  for (const callback of [null, config.redirectUri + '?code=a&state=wrong', config.redirectUri + '?code=a&state=a&state=b',
    'opagowallet://other?code=a&state=a', config.redirectUri + '?code=a&state=a#code=b']) {
    const f = oidcFixture(); f.platform.browser = async () => callback; await assert.rejects(f.login.login(false));
  }
  for (const patch of [{ issuer: 'https://other.example' }, { audience: 'other-client' }, { accessAudience: 'other-api' },
    { emailVerified: false }, { expiresAt: 0 }, { authTime: 0 }]) {
    const f = oidcFixture(); Object.assign(f.claims, patch); await assert.rejects(f.login.login(true));
  }
  const invalidSignature = oidcFixture(); invalidSignature.platform.verify = async () => { throw new Error('Synthetic signature rejection'); };
  await assert.rejects(invalidSignature.login.login(false), /signature rejection/);
  assert.throws(() => new OidcAccountLogin({ ...config, issuer: 'https://evil.example' }, trusted, invalidSignature.platform, new MemoryPrivateStore()));
});
test('F3 retryable encrypted error retains key/input with bounded backoff and Retry-After; hard errors do not retry', async () => {
  let now = Date.now(); const delays = []; const store = new MemoryPrivateStore();
  const backend = new F3ContractTestBackend(store, randomUUID, 'regtest', () => now); const original = backend.request.bind(backend);
  let failures = 0;
  backend.request = async req => { if (req.path.endsWith('/auth/challenge') && failures++ < 2) return { status: 503, authenticated: true, retryAfterSeconds: 3,
    body: { error: { code: 'upstream_pending', message: 'Synthetic pending.', retryable: true, details: {} }, request_id: randomUUID() } }; return original(req); };
  const account = new OpagoAccount(new OpagoApi(backend), store, backend.identity, backend.login, randomUUID, () => now,
    async ms => { delays.push(ms); now += ms; });
  await account.load(); await account.proveOwnership(); assert.equal(delays.length, 2); assert.ok(delays.every(ms => ms >= 3000));
  assert.equal(failures, 3); // No changed semantic operation to evade the pending result.
  assert.throws(() => assertContract('Error', { error: { code: 'tme_rejected', message: 'Synthetic rejection.', retryable: true, details: {} }, request_id: randomUUID() }));
  backend.request = async () => { throw new OpagoError('account_mismatch', false, 403); };
  const previous = delays.length; await assert.rejects(account.signIn(), /account_mismatch/); assert.equal(delays.length, previous);
});

function nativeStoreFixture(t) {
  const secure = new Map(); const local = new Map(); let failChunk = false;
  const filename = require.resolve('../lib/opago/store-native.ts'); delete require.cache[filename];
  const originalLoad = Module._load;
  Module._load = function(name, parent, main) {
    if (parent?.filename === filename) {
      if (name === 'react-native') return { Platform: { OS: 'ios' } };
      if (name === 'expo-crypto') return { randomUUID };
      if (name === 'expo-secure-store') return { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
        getItemAsync: async key => secure.get(key) || null,
        setItemAsync: async (key, value, options) => {
          assert.ok(Buffer.byteLength(value) <= 2000); assert.equal(options.keychainAccessible, 1);
          if (failChunk && key.endsWith('.1')) { failChunk = false; throw new Error('Synthetic interrupted chunk write'); }
          secure.set(key, value);
        }, deleteItemAsync: async key => { secure.delete(key); } };
      if (name === '@react-native-async-storage/async-storage') return { getItem: async k => local.get(k) || null,
        setItem: async (k,v) => { local.set(k,v); }, removeItem: async k => { local.delete(k); } };
      // Encoding is dependency-free; do not load unrelated native HTTP configuration here.
      if (name === './peer-native') return { encodeBase64url: b => Buffer.from(b).toString('base64url'), decodeBase64url: s => new Uint8Array(Buffer.from(s, 'base64url')) };
    }
    return originalLoad.call(this, name, parent, main);
  };
  let api; try { api = require(filename); } finally { Module._load = originalLoad; }
  t.after(() => delete require.cache[filename]);
  return { ...api, secure, local, interrupt() { failChunk = true; } };
}
test('F3 private native store chunks account tokens and exact peer bytes without leaking them to AsyncStorage', async t => {
  const f = nativeStoreFixture(t); const data = { secret: 'Synthetic personal data é '.repeat(12000), accessToken: 'synthetic-access' };
  await f.f3PrivateStore.write('account-test', data); assert.deepEqual(await f.f3PrivateStore.read('account-test'), data);
  assert.ok(f.secure.size > 100); assert.equal([...f.local.values()].join('').includes('Synthetic personal'), false);
  f.interrupt(); await assert.rejects(f.f3PrivateStore.write('account-test', { secret: 'Synthetic replacement'.repeat(200) }), /interrupted/);
  assert.deepEqual(await f.f3PrivateStore.read('account-test'), data);
  await f.clearF3PrivateStore(); assert.equal(f.secure.size, 0); assert.equal(f.local.size, 0);
});

test('F3 native external login preserves the current wallet session across browser backgrounding and invalidates payment approval', async t => {
  const filename = require.resolve('../lib/opago/oidc-native.ts'); delete require.cache[filename];
  const session = new WalletSession(); session.unlock(); const priorApproval = session.capture();
  const originalLoad = Module._load;
  Module._load = function(name, parent, main) {
    if (parent?.filename === filename) {
      if (name === 'expo-web-browser') return { openAuthSessionAsync: async (_url, redirect) => { session.handleAppState('background'); assert.equal(session.isUnlocked(), true); session.handleAppState('active'); return { type: 'success', url: redirect + '?code=synthetic' }; } };
      if (name === 'expo-crypto') return { getRandomValues: bytes => bytes.fill(1) };
      if (name === '../wallet-session') return { walletSession: session };
      if (name === './hka-http-native') return { nativeHkaHttp: async () => { throw new Error('No token request in browser test'); } };
    }
    return originalLoad.call(this, name, parent, main);
  };
  let platform; try { platform = require(filename).nativeOidcPlatform(async () => {}); } finally { Module._load = originalLoad; }
  t.after(() => delete require.cache[filename]);
  const active = platform.start(); await platform.browser(config.authorizationEndpoint, config.redirectUri); active();
  assert.throws(priorApproval); session.capture()();
  session.lock(); assert.throws(active);
});
