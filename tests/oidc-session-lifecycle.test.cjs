const test = require('node:test');
const assert = require('node:assert/strict');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { OidcAccountLogin } = require('../lib/opago/oidc.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  const now = Date.now(); let random = 0; let current = true;
  const config = { issuer: 'https://identity.example', clientId: 'synthetic-wallet', redirectUri: 'synthetic:/callback',
    authorizationEndpoint: 'https://identity.example/authorize', tokenEndpoint: 'https://identity.example/token' };
  const trusted = { issuers: [config.issuer], redirectUris: [config.redirectUri], accessAudience: 'synthetic-account' };
  const store = new MemoryPrivateStore(); const slot = 'f3.oidc.' + config.issuer;
  const tokens = subject => ({ access_token: subject, id_token: 'synthetic-id', refresh_token: 'synthetic-refresh-' + subject });
  const platform = {
    start: () => () => { if (!current) throw new Error('Wallet locked'); },
    randomBytes: count => new Uint8Array(count).fill(++random),
    browser: async (url, redirect) => redirect + '?' + new URLSearchParams({ code: 'synthetic-code',
      state: new URL(url).searchParams.get('state'), iss: config.issuer }),
    token: async () => tokens('first-account'),
    verify: async (value, _config, nonce) => ({ issuer: config.issuer, audience: config.clientId, subject: value.access_token,
      expiresAt: now + 300000, accessExpiresAt: now + 300000, authTime: now, nonce, emailVerified: true, accessAudience: trusted.accessAudience }),
  };
  const adapter = () => new OidcAccountLogin(config, trusted, platform, store, () => now);
  return { login: adapter(), adapter, platform, store, slot, tokens, lock: () => { current = false; } };
}

test('concurrent refresh across recreated adapters consumes a rotating token once', async () => {
  const f = fixture(); await f.login.login(false);
  const started = deferred(); const response = deferred(); let calls = 0;
  f.platform.token = async (_url, form) => {
    calls++; assert.equal(form.get('refresh_token'), 'synthetic-refresh-first-account'); started.resolve(); return response.promise;
  };
  const first = f.login.refresh(); const second = f.adapter().refresh(); await started.promise;
  response.resolve(f.tokens('first-account'));
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1); assert.deepEqual(results[0], results[1]);
});

test('logout fences a delayed browser callback before exchanging its code', async () => {
  const f = fixture(); const opened = deferred(); const response = deferred(); let calls = 0;
  const browser = f.platform.browser;
  f.platform.browser = async (...args) => { opened.resolve(); await response.promise; return browser(...args); };
  f.platform.token = async () => { calls++; return f.tokens('first-account'); };
  const rejected = assert.rejects(f.login.login(false), /cancelled/); await opened.promise;
  await f.adapter().logout(); response.resolve(); await rejected;
  assert.equal(calls, 0); assert.equal(await f.store.read(f.slot), null);
});

test('logout fences an already dispatched refresh and leaves no stored tokens', async () => {
  const f = fixture(); await f.login.login(false);
  const started = deferred(); const response = deferred();
  f.platform.token = async () => { started.resolve(); return response.promise; };
  const rejected = assert.rejects(f.login.refresh(), /cancelled/); await started.promise;
  await f.adapter().logout(); response.resolve(f.tokens('first-account')); await rejected;
  assert.equal(await f.store.read(f.slot), null);
});

test('refresh cannot overwrite a newer account login', async () => {
  const f = fixture(); await f.login.login(false);
  const started = deferred(); const response = deferred();
  f.platform.token = async (_url, form) => {
    if (form.get('grant_type') === 'refresh_token') { started.resolve(); return response.promise; }
    return f.tokens('second-account');
  };
  const rejected = assert.rejects(f.login.refresh(), /cancelled/); await started.promise;
  await f.adapter().login(true); response.resolve(f.tokens('first-account')); await rejected;
  assert.equal((await f.store.read(f.slot)).subject, 'second-account');
});

test('a lock during secure storage commit removes the newly written credentials', async () => {
  const f = fixture(); const writing = deferred(); const release = deferred(); const write = f.store.write.bind(f.store);
  f.store.write = async (...args) => { writing.resolve(); await release.promise; await write(...args); };
  const rejected = assert.rejects(f.login.login(false), /locked/); await writing.promise;
  f.lock(); release.resolve(); await rejected;
  assert.equal(await f.store.read(f.slot), null);
});

test('logout during a storage commit does not delete the following successful login', async () => {
  const f = fixture(); const writing = deferred(); const release = deferred(); const write = f.store.write.bind(f.store); let writes = 0;
  f.store.write = async (...args) => { if (++writes === 1) { writing.resolve(); await release.promise; } await write(...args); };
  const rejected = assert.rejects(f.login.login(false), /cancelled/); await writing.promise;
  const logout = f.adapter().logout();
  f.platform.token = async () => f.tokens('second-account');
  const next = f.adapter().login(true); release.resolve();
  await Promise.all([rejected, logout, next]);
  assert.equal((await f.store.read(f.slot)).subject, 'second-account');
});

test('refresh is not dispatched while a replacement login is open', async () => {
  const f = fixture(); await f.login.login(false);
  const opened = deferred(); const release = deferred(); let refreshCalls = 0; const browser = f.platform.browser;
  f.platform.browser = async (...args) => { opened.resolve(); await release.promise; return browser(...args); };
  f.platform.token = async (_url, form) => { if (form.get('grant_type') === 'refresh_token') refreshCalls++; return f.tokens('second-account'); };
  const next = f.login.login(true); await opened.promise;
  await assert.rejects(f.adapter().refresh(), /sign-in is in progress/);
  release.resolve(); await next; assert.equal(refreshCalls, 0);
});

test('failed refresh releases its flight and preserves the previous saved session', async () => {
  const f = fixture(); await f.login.login(false); const before = await f.store.read(f.slot);
  f.platform.token = async () => { throw new Error('Synthetic transport failure'); };
  await assert.rejects(f.login.refresh(), /transport failure/);
  assert.deepEqual(await f.store.read(f.slot), before);
  f.platform.token = async () => f.tokens('first-account');
  assert.equal((await f.login.refresh()).subject, 'first-account');
});
