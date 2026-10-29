const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { PublicAccountClient, PublicAccountError, PUBLIC_API_ORIGIN, CUSTOMER_CONTEXT } = require('../lib/opago/public-account.ts');
const { PublicAccountSessionStore } = require('../lib/opago/public-account-session.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { hpkeSuite } = require('../lib/opago/hpke-crypto.ts');
const { base64url, unbase64url, utf8 } = require('../lib/opago/encoding.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const reply = (value, status = 200, extra = {}) => ({ status, body: JSON.stringify(value), contentType: 'application/json', cacheControl: 'no-store', ...extra });
const stamp = value => new Date(value).toISOString().replace('.000Z', 'Z');
async function fixture() {
  const now = Math.floor(Date.now() / 1000) * 1000, calls = [], keyPair = await hpkeSuite.kem.generateKeyPair();
  const info = utf8('opago-api:auth:hpke:v1\0' + PUBLIC_API_ORIGIN + '\0test-key');
  const config = { contract_version: '0.2.0', audience: PUBLIC_API_ORIGIN, issued_at: stamp(now - 1000), valid_until: stamp(now + 299000), cache_max_age: 300,
    min_supported_build: { ios: 14, android: 14 }, revoked_signing_key_ids: [], revoked_kids: [],
    oidc: { issuer: 'https://keycloak.opago.com/auth/realms/internal', client_id: 'old-client', redirect_uris: ['opagowallet://oidc-callback'], scopes: ['openid', 'email', 'profile'] },
    limits: { min_sendable_msat: 1000, max_sendable_msat: 1000000000, photo_bytes: 10485760, photo_pixels: 24000000 } };
  const metadata = { encryption: 'hpke-v1', kid: 'test-key', public_key: base64url(new Uint8Array(await hpkeSuite.kem.serializePublicKey(keyPair.publicKey))),
    mode: 0, kem_id: 32, kdf_id: 1, aead_id: 2, audience: PUBLIC_API_ORIGIN, info: base64url(info), server_time: now / 1000, max_age_seconds: 300, future_skew_seconds: 30 };
  const me = { opago_id: '00000000-0000-4000-8000-000000000001', tenant_id: 'opago', roles: ['PrivateCustomer'], email: 'private@example.test' };
  const token = { access_token: 'synthetic-public-session', token_type: 'bearer', expires_at: stamp(now + 3600000), tenant_id: 'opago', roles: ['PrivateCustomer'] };
  const f = { now, calls, config, metadata, me, token, fault: null, plaintext: null };
  f.http = async (url, options) => {
    assert.equal(new URL(url).origin, PUBLIC_API_ORIGIN); const path = new URL(url).pathname;
    calls.push({ path, ...options });
    const replaced = await f.fault?.(path, options); if (replaced) return replaced;
    if (path === '/api/v2/app/config') return reply(config);
    if (path === '/api/v2/auth/login/hpke-key') { assert.equal(options.headers['X-OPAGO-Login-Context'], CUSTOMER_CONTEXT); return reply({ ...metadata, login_context: CUSTOMER_CONTEXT }); }
    if (path === '/api/v2/auth/token') {
      assert.equal(options.headers['X-OPAGO-Login-Context'], CUSTOMER_CONTEXT);
      assert.doesNotMatch(options.body, /synthetic-password/);
      const env = JSON.parse(options.body);
      const recipient = await hpkeSuite.createRecipientContext({ recipientKey: keyPair.privateKey, enc: unbase64url(env.enc).buffer, info: info.buffer });
      f.plaintext = JSON.parse(new TextDecoder().decode(await recipient.open(unbase64url(env.ciphertext).buffer)));
      return reply(token);
    }
    if (path === '/api/v2/auth/me') { assert.equal(options.headers.Authorization, 'Bearer synthetic-public-session'); return reply(me); }
    if (path === '/api/v2/auth/logout') return reply({}, 204);
    if (path === '/api/v2/auth/password-reset/request') return reply({ status: 'accepted' }, 202);
    throw new Error('Unexpected network destination');
  };
  f.client = new PublicAccountClient(f.http, 'android', 14, n => new Uint8Array(randomBytes(n)), () => f.now);
  f.login = signal => f.client.login(' Private@Example.Test ', '  synthetic-password  ', signal);
  return f;
}
test('public account uses runtime config and real HPKE; only /me supplies identity, no Keycloak calls', async () => {
  const f = await fixture(); const session = await f.login();
  assert.equal(f.plaintext.username, 'private@example.test'); assert.equal(f.plaintext.password, '  synthetic-password  ');
  assert.equal(session.identity.opago_id, f.me.opago_id); assert.equal(session.expiresAt, f.now + 3600000);
  assert.deepEqual(f.calls.map(c => c.path), ['/api/v2/app/config', '/api/v2/auth/login/hpke-key', '/api/v2/auth/token', '/api/v2/auth/me']);
  assert.equal(Object.hasOwn(session, 'subject'), false); assert.equal(Object.hasOwn(session, 'authTime'), false);
});

test('public account uses fresh server time when the device clock is two minutes ahead', async () => {
  const f = await fixture(); f.now += 120000;
  await f.login();
  assert.equal(f.plaintext.issued_at, f.metadata.server_time);
});
for (const [name, mutate] of [
  ['wrong audience', f => { f.config.audience = 'https://api.opago-pay.com'; }],
  ['expired config', f => { f.config.valid_until = stamp(f.now - 1); }],
  ['future config', f => { f.config.issued_at = stamp(f.now + 400000); }],
  ['unsupported build', f => { f.config.min_supported_build.android = 15; }],
  ['wrong contract', f => { f.config.contract_version = '0.3.0'; }],
  ['missing config', f => { f.fault = path => path === '/api/v2/app/config' && reply({}, 503); }],
  ['HTML config', f => { f.fault = path => path === '/api/v2/app/config' && reply({}, 200, { contentType: 'text/html' }); }],
  ['no server acknowledgement', f => { f.fault = path => path.endsWith('/login/hpke-key') && reply(f.metadata); }],
  ['wrong HPKE audience', f => { f.metadata.audience = 'https://keycloak.opago.com'; }],
  ['wrong HPKE info', f => { f.metadata.info = base64url(utf8('arbitrary')); }],
  ['weak HPKE suite', f => { f.metadata.aead_id = 1; }],
  ['invalid key', f => { f.metadata.public_key = base64url(new Uint8Array(32)); }],
]) test('public account refuses ' + name + ' before sending credentials', async () => {
  const f = await fixture(); mutate(f); await assert.rejects(f.login(), PublicAccountError);
  assert.equal(f.calls.some(c => c.method === 'POST'), false);
});
for (const status of [401, 403, 409, 429, 500, 503]) test('public account never retries credential failure ' + status, async () => {
  const f = await fixture(); f.fault = path => path === '/api/v2/auth/token' && reply({ error: 'private backend details' }, status, { retryAfter: '17' });
  await assert.rejects(f.login(), error => error instanceof PublicAccountError && !error.message.includes('private backend'));
  assert.equal(f.calls.filter(c => c.path === '/api/v2/auth/token').length, 1);
  assert.equal(f.calls.some(c => c.path === '/api/v2/auth/me'), false);
});
for (const roles of [[], ['Admin'], ['Merchant', 'PrivateCustomer'], ['PrivateCustomer', 'Operator']]) test('public account rejects unauthorized roles ' + roles, async () => {
  const f = await fixture(); f.me.roles = roles; await assert.rejects(f.login(), PublicAccountError);
});
test('public account requires matching role, tenant, stable UUID and unexpired session', async () => {
  for (const patch of [{ roles: ['Merchant'] }, { tenant_id: 'foreign' }, { opago_id: 'email@example.test' }]) {
    const f = await fixture(); Object.assign(f.me, patch); await assert.rejects(f.login(), PublicAccountError);
  }
  const f = await fixture(); const session = await f.login(); f.calls.length = 0; f.now = session.expiresAt;
  await assert.rejects(f.client.verify(session), /expired/); assert.equal(f.calls.length, 0);
});
test('public account cancellation never emits a credential POST or retries', async () => {
  const f = await fixture(), controller = new AbortController();
  f.fault = path => { if (path.endsWith('/login/hpke-key')) controller.abort(); };
  await assert.rejects(f.login(controller.signal), /cancelled/); assert.equal(f.calls.some(c => c.method === 'POST'), false);
});
test('public account restore revalidates identity and isolates credentials from F3 storage', async () => {
  const f = await fixture(), store = new MemoryPrivateStore(), sessions = new PublicAccountSessionStore(f.client, store), signal = new AbortController().signal;
  await store.write('f3.sentinel', 'unchanged');
  await sessions.login('private@example.test', 'synthetic-password', signal, () => {});
  assert.equal((await sessions.resume(signal, () => {})).identity.opago_id, f.me.opago_id);
  f.me.opago_id = '00000000-0000-4000-8000-000000000002';
  await assert.rejects(sessions.resume(signal, () => {}), /expired/);
  assert.equal(await store.read('opago.public-customer-session.v1'), null);
  assert.equal(await store.read('f3.sentinel'), 'unchanged');
});
test('public account logout deletes local token even when backend logout fails', async () => {
  const f = await fixture(), store = new MemoryPrivateStore(), sessions = new PublicAccountSessionStore(f.client, store);
  const session = await sessions.login('private@example.test', 'synthetic-password', new AbortController().signal, () => {});
  f.fault = path => path.endsWith('/logout') && reply({}, 503);
  await assert.rejects(sessions.logout(session)); assert.equal(await store.read('opago.public-customer-session.v1'), null);
});
test('late login after lock or account switch cannot write a session', async () => {
  const f = await fixture(), store = new MemoryPrivateStore(), sessions = new PublicAccountSessionStore(f.client, store);
  f.fault = path => { if (path === '/api/v2/auth/me') sessions.invalidate(); };
  await assert.rejects(sessions.login('private@example.test', 'synthetic-password', new AbortController().signal, () => {}), /cancelled/);
  assert.equal(await store.read('opago.public-customer-session.v1'), null);
});
test('password reset uses neutral existing contract, one write and runtime config', async () => {
  const f = await fixture(); await f.client.requestPasswordReset(' PRIVATE@example.test ', 'de');
  assert.deepEqual(f.calls.map(c => c.path), ['/api/v2/app/config', '/api/v2/auth/password-reset/request']);
  assert.deepEqual(JSON.parse(f.calls[1].body), { email: 'private@example.test', language: 'de' });
});
