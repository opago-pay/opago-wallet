'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes, randomUUID } = require('node:crypto');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { createAccountBindingIntegration } = require('../lib/opago/binding-integration.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { OpagoApi } = require('../lib/opago/api.ts');
const { OpagoAccount } = require('../lib/opago/account.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const origin = 'https://api.opago.com';
const callback = 'com.opago.wallet:/oauth/callback';
const subject = '00000000-0000-4000-8000-000000000011';
const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const state = { now: Date.parse('2026-10-22T09:00:00Z'), active: true, outage: false,
    app: clone(require('./fixtures/wallet-app-config-2026-10-22.json')),
    keys: clone(require('./fixtures/hpke-root-1-public-document.json')), requests: [], logout: 0, oidc: 0 };
  const store = new MemoryPrivateStore();
  const discovery = require('./fixtures/wallet-broker-discovery-2026-10-22.json');
  const assertCurrent = () => { if (!state.active) throw Error('wallet changed'); };
  const ports = {
    platform: 'android', build: 18, store, now: () => state.now, assertCurrent,
    random: size => new Uint8Array(randomBytes(size)),
    http: async (url, options) => {
      state.requests.push({ url, options });
      if (state.outage) throw Error('offline');
      let body;
      if (url === origin + '/api/v2/app/config') body = state.app;
      else if (url === origin + '/.well-known/openid-configuration') body = discovery;
      else if (url === origin + '/api/v2/auth/hpke-key') body = state.keys;
      else return { status: 404, contentType: 'application/json', cacheControl: 'no-store', body: '{"status":"ok"}' };
      return { status: 200, contentType: 'application/json', cacheControl: 'no-store', body: JSON.stringify(body) };
    },
    oidc: configuration => {
      state.oidc++;
      assert.equal(configuration.config.issuer, origin);
      assert.equal(configuration.trusted.accessAudience, 'opago-account');
      return {
        start: () => assertCurrent,
        randomBytes: size => new Uint8Array(randomBytes(size)),
        async browser(url) {
          const request = new URL(url); state.nonce = request.searchParams.get('nonce');
          assert.equal(request.searchParams.get('client_id'), 'opago-wallet');
          assert.equal(request.searchParams.get('redirect_uri'), callback);
          if (state.fresh) assert.equal(request.searchParams.get('prompt'), 'login');
          return callback + '?' + new URLSearchParams({ code: 'synthetic-code', state: request.searchParams.get('state'), iss: origin });
        },
        async token() { return { access_token: 'synthetic-broker-access', id_token: 'synthetic-id', refresh_token: 'synthetic-refresh' }; },
        // Native wiring supplies createWalletBrokerVerifier; these are explicit test ports.
        async verify() {
          return { issuer: origin, audience: 'opago-wallet', accessAudience: 'opago-account', subject,
            nonce: state.nonce, emailVerified: true, authTime: state.now,
            expiresAt: state.now + 300000, accessExpiresAt: state.now + 300000 };
        },
      };
    },
    async logout() { state.logout++; },
  };
  return { state, ports, store };
}

test('binding bootstrap validates the real public signing-root fixture without creating authority or enabling other rails', async () => {
  const f = fixture(); const integration = await createAccountBindingIntegration(f.ports);
  assert.equal(integration.hka.mode, 'hka');
  assert.equal(integration.accountLogin.mode, 'oidc');
  assert.equal(integration.publicAddressOrigin, 'https://opago.com');
  assert.equal(integration.posLinkSource, undefined);
  assert.equal(integration.transactionSync, undefined);
  assert.equal(integration.disclosure, undefined);
  assert.equal(f.state.oidc, 0);
  assert.ok(f.state.requests.every(({ options }) => options.method === 'GET' && !options.headers.Authorization));
});

test('binding adapter rejects legacy issuers, unknown signing roots, revoked keys and update-required builds before account operations', async () => {
  for (const alter of [
    f => { f.state.app.oidc.issuer = 'https://keycloak.internal/realms/opago'; },
    f => { f.state.keys.signing_key_id = 'untrusted-server-root'; },
    f => { f.state.app.revoked_kids.push(f.state.keys.document.active_kid); },
    f => { f.state.app.min_supported_build.android = 19; },
  ]) {
    const f = fixture(); alter(f);
    await assert.rejects(createAccountBindingIntegration(f.ports));
    assert.equal(f.state.oidc, 0);
    assert.ok(f.state.requests.every(({ url, options }) => url.startsWith(origin + '/') && options.method === 'GET'));
  }
});

test('metadata success never fabricates a binding or signs when the real F3 backend is unavailable', async () => {
  const f = fixture(); const integration = await createAccountBindingIntegration(f.ports);
  let signed = 0;
  const account = new OpagoAccount(new OpagoApi(integration.hka), f.store, {
    publicKey: '02' + '11'.repeat(32), network: 'regtest',
    async sign() { signed++; throw Error('must not sign an unauthenticated challenge'); },
  }, integration.accountLogin, randomUUID, () => f.state.now);
  await account.load();
  await assert.rejects(account.signIn());
  assert.equal(account.state.credential.accessToken, 'synthetic-broker-access');
  assert.equal(account.state.credential.subject, subject);
  assert.equal(account.state.account, null); assert.equal(account.state.wallet, null); assert.equal(account.state.session, null);
  await assert.rejects(account.proveOwnership());
  assert.equal(signed, 0); assert.equal(account.state.session, null);
  const calls = f.state.requests.filter(({ options }) => options.headers.Authorization);
  assert.ok(calls.length >= 2);
  assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer synthetic-broker-access'));
  assert.ok(calls.some(({ url }) => url === origin + '/api/v2/account'));
  assert.ok(calls.some(({ url }) => url === origin + '/api/v2/wallet/auth/challenge'));
});

test('binding login revalidates configuration and honors fresh authentication; logout needs no fresh metadata', async () => {
  const f = fixture(); const integration = await createAccountBindingIntegration(f.ports);
  f.state.fresh = true;
  const credential = await integration.accountLogin.login(true);
  assert.equal(credential.accessToken, 'synthetic-broker-access'); assert.equal(credential.subject, subject);
  const before = f.state.requests.length;
  f.state.outage = true;
  await assert.rejects(integration.accountLogin.refresh());
  const failedRefresh = f.state.requests.length;
  assert.ok(failedRefresh > before);
  await integration.accountLogin.logout();
  assert.equal(f.state.logout, 1); assert.equal(f.state.requests.length, failedRefresh);
});

test('a replaced or locked wallet cannot construct or reuse its old binding adapter', async () => {
  const f = fixture(); f.state.active = false;
  await assert.rejects(createAccountBindingIntegration(f.ports), /wallet changed/);
  assert.equal(f.state.requests.length, 0);
  f.state.active = true; const integration = await createAccountBindingIntegration(f.ports);
  const before = f.state.requests.length; f.state.active = false;
  await assert.rejects(integration.accountLogin.login(false), /wallet changed/);
  await assert.rejects(integration.accountLogin.refresh(), /wallet changed/);
  assert.equal(f.state.requests.length, before); assert.equal(f.state.oidc, 0);
});
