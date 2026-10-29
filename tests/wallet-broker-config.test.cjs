const test = require('node:test');
const assert = require('node:assert/strict');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { RuntimeConfigClient } = require('../lib/opago/runtime-config.ts');
const { websiteAccountAvailability } = require('../lib/opago/website-account-config.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const app = require('./fixtures/wallet-app-config-2026-10-22.json');
const discovery = require('./fixtures/wallet-broker-discovery-2026-10-22.json');
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  let now = Date.parse('2026-10-22T10:00:00Z'); const calls = [];
  const f = { app: copy(app), discovery: copy(discovery), status: 200, contentType: 'application/json', hook: async () => {} };
  f.client = new RuntimeConfigClient(async (url, options) => {
    calls.push({ url, options }); const isApp = url.endsWith('/app/config');
    if (!isApp) await f.hook();
    return { status: isApp ? 200 : f.status, body: JSON.stringify(isApp ? f.app : f.discovery),
      contentType: isApp ? 'application/json' : f.contentType, cacheControl: isApp ? 'no-store' : 'public, max-age=60' };
  }, 'android', 17, () => now);
  return Object.assign(f, { calls, advance: ms => { now += ms; } });
}
test('published AppConfig and discovery resolve to the Wallet PKCE/verifier configuration', async () => {
  const f = fixture(); const result = await f.client.brokerConfiguration();
  assert.deepEqual(result.config, { issuer: 'https://api.opago.com', clientId: 'opago-wallet',
    redirectUri: 'com.opago.wallet:/oauth/callback', authorizationEndpoint: discovery.authorization_endpoint,
    tokenEndpoint: discovery.token_endpoint });
  assert.equal(result.discovery.jwks_uri, discovery.jwks_uri);
  assert.equal(result.trusted.accessAudience, 'opago-account');
  assert.equal(result.expiresAt, Date.parse('2026-10-22T10:05:00Z'));
  assert.equal(f.calls.length, 2);
  for (const { url, options } of f.calls) {
    assert.equal(new URL(url).origin, 'https://api.opago.com'); assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, undefined); assert.equal(options.body, undefined);
  }
});
for (const [label, change] of [
  ['internal issuer', f => { f.app.oidc.issuer = 'https://keycloak.opago.com/realm'; }],
  ['another client', f => { f.app.oidc.client_id = 'opago-dashboard'; }],
  ['another callback', f => { f.app.oidc.redirect_uris = ['evil:/callback']; }],
  ['ambiguous callback', f => { f.app.oidc.redirect_uris.push('other:/callback'); }],
  ['missing scope', f => { f.app.oidc.scopes = ['openid']; }],
  ['duplicate scopes', f => { f.app.oidc.scopes = ['openid', 'email', 'email']; }],
  ['minimum build', f => { f.app.min_supported_build.android = 18; }],
]) test(label + ' is rejected before discovery', async () => {
  const f = fixture(); change(f); await assert.rejects(f.client.brokerConfiguration()); assert.equal(f.calls.length, 1);
});
for (const field of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
  test('discovery rejects substituted ' + field, async () => {
    const f = fixture(); f.discovery[field] = 'https://keycloak.opago.com/other';
    await assert.rejects(f.client.brokerConfiguration()); assert.equal(f.calls.length, 2);
  });
}
for (const field of ['code_challenge_methods_supported', 'response_types_supported', 'response_modes_supported',
  'grant_types_supported', 'id_token_signing_alg_values_supported', 'token_endpoint_auth_methods_supported', 'scopes_supported']) {
  test('discovery requires ' + field, async () => {
    const f = fixture(); f.discovery[field] = []; await assert.rejects(f.client.brokerConfiguration());
  });
}
test('issuer-bound callback responses are required', async () => {
  const f = fixture(); f.discovery.authorization_response_iss_parameter_supported = false;
  await assert.rejects(f.client.brokerConfiguration());
});
for (const status of [302, 401, 503]) test('discovery status ' + status + ' remains unavailable', async () => {
  const f = fixture(); f.status = status; await assert.rejects(f.client.brokerConfiguration());
});
test('HTML, expired configuration during discovery, and cancellation are rejected', async () => {
  let f = fixture(); f.contentType = 'text/html'; await assert.rejects(f.client.brokerConfiguration());
  f = fixture(); f.hook = async () => f.advance(300001); await assert.rejects(f.client.brokerConfiguration());
  f = fixture(); const abort = new AbortController(); f.hook = async () => abort.abort();
  await assert.rejects(f.client.brokerConfiguration(abort.signal), error => error.problem === 'cancelled');
});
test('config validity caps the discovery lease and each attempt refetches config', async () => {
  const f = fixture(); f.app.valid_until = '2026-10-22T10:00:30Z';
  assert.equal((await f.client.brokerConfiguration()).expiresAt, Date.parse(f.app.valid_until));
  f.app.oidc.client_id = 'opago-dashboard'; await assert.rejects(f.client.brokerConfiguration());
  assert.equal(f.calls.length, 3);
});
test('broker readiness does not invent Portal signup/handover availability', async () => {
  const f = fixture(); await f.client.brokerConfiguration();
  assert.deepEqual(await websiteAccountAvailability(signal => f.client.configuration(signal), new AbortController().signal), { status: 'unavailable' });
});
