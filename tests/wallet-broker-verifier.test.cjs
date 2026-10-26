const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, createHash } = require('node:crypto');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { createWalletBrokerVerifier } = require('../lib/opago/oidc-verifier.ts');
const { OidcAccountLogin } = require('../lib/opago/oidc.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];

function fixture() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'synthetic-broker', alg: 'ES256', use: 'sig' };
  const now = Math.floor(Date.now() / 1000);
  const config = { issuer: 'https://api.opago.com', clientId: 'opago-wallet', redirectUri: 'com.opago.wallet:/oauth/callback',
    authorizationEndpoint: 'https://api.opago.com/api/v2/auth/authorize', tokenEndpoint: 'https://api.opago.com/api/v2/auth/oauth/token' };
  const discovery = { issuer: config.issuer, authorization_endpoint: config.authorizationEndpoint, token_endpoint: config.tokenEndpoint,
    jwks_uri: config.issuer + '/api/v2/auth/oauth/jwks' };
  const common = { iss: config.issuer, sub: '12345678-1234-4234-8234-123456789abc', azp: config.clientId,
    iat: now, exp: now + 300, auth_time: now - 10, amr: ['pwd'] };
  const access = { ...common, aud: 'opago-account', client_id: config.clientId, roles: ['PrivateCustomer'],
    jti: '87654321-1234-4234-8234-123456789abc', scope: 'openid email profile' };
  const id = { ...common, aud: config.clientId, nonce: 'synthetic-nonce', email: 'synthetic@example.test', email_verified: false };
  const headers = { access: { typ: 'at+jwt' }, id: { typ: 'JWT' } };
  const jwt = (claims, header) => {
    const body = Buffer.from(JSON.stringify({ alg: 'ES256', kid: jwk.kid, ...header })).toString('base64url') + '.' + Buffer.from(JSON.stringify(claims)).toString('base64url');
    return body + '.' + sign('sha256', Buffer.from(body), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  };
  const calls = [];
  const ports = { json: async url => { calls.push(url); assert.equal(url, discovery.jwks_uri); return { keys: [jwk] }; },
    verifyRs256: async () => { throw new Error('RSA must not be used'); } };
  const tokens = () => {
    const access_token = jwt(access, headers.access);
    const at_hash = createHash('sha256').update(access_token).digest().subarray(0, 16).toString('base64url');
    return { access_token, id_token: jwt({ at_hash, ...id }, headers.id) };
  };
  return { config, discovery, access, id, headers, tokens, now, calls, ports,
    verify: createWalletBrokerVerifier(discovery, ports, () => now * 1000) };
}

test('Wallet broker verifies real ES256 token pair and preserves unverified email', async () => {
  const f = fixture(); const claims = await f.verify(f.tokens(), f.config, f.id.nonce);
  assert.equal(claims.subject, f.access.sub); assert.equal(claims.emailVerified, false);
  assert.equal(claims.accessAudience, 'opago-account'); assert.equal(claims.authTime, f.access.auth_time * 1000);
  assert.deepEqual(f.calls, [f.discovery.jwks_uri]);
});

for (const [label, mutate] of [
  ['wrong issuer', f => { f.access.iss = 'https://other.example'; }],
  ['dashboard client', f => { f.access.azp = 'opago-dashboard'; }],
  ['missing client_id', f => { delete f.access.client_id; }],
  ['POS audience', f => { f.access.aud = 'opago-identification'; }],
  ['multiple audiences', f => { f.access.aud = ['opago-account', 'other']; }],
  ['staff role', f => { f.access.roles = ['PrivateCustomer', 'Admin']; }],
  ['missing roles', f => { delete f.access.roles; }],
  ['empty roles', f => { f.access.roles = []; }],
  ['string roles', f => { f.access.roles = 'PrivateCustomer'; }],
  ['duplicate roles', f => { f.access.roles = ['PrivateCustomer', 'PrivateCustomer']; }],
  ['non UUID subject', f => { f.access.sub = f.id.sub = 'synthetic-party'; }],
  ['uppercase UUID', f => { f.access.sub = f.id.sub = f.access.sub.toUpperCase(); }],
  ['different subject', f => { f.id.sub = '87654321-1234-4234-8234-123456789abc'; }],
  ['missing auth_time', f => { delete f.access.auth_time; }],
  ['different auth_time', f => { f.id.auth_time--; }],
  ['future auth_time', f => { f.access.auth_time = f.now + 1; }],
  ['expired token', f => { f.access.exp = f.now - 1; }],
  ['excess lifetime', f => { f.access.exp = f.now + 901; }],
  ['missing amr', f => { delete f.access.amr; }],
  ['missing jti', f => { delete f.access.jti; }],
  ['tenant claim', f => { f.access.tenant_id = 'other'; }],
  ['missing at_hash', f => { f.id.at_hash = undefined; }],
  ['mismatched at_hash', f => { f.id.at_hash = 'incorrect'; }],
  ['missing email assurance', f => { delete f.id.email_verified; }],
  ['wrong nonce', f => { f.id.nonce = 'wrong'; }],
  ['access token type', f => { f.headers.access.typ = 'JWT'; }],
  ['missing ID token type', f => { f.headers.id.typ = undefined; }],
  ['unknown signing key', f => { f.headers.access.kid = 'unknown'; }],
  ['unexpected algorithm', f => { f.headers.access.alg = 'RS256'; }],
  ['token supplied keys', f => { f.headers.access.jku = 'https://other.example/keys'; }],
]) test('Wallet broker refuses ' + label, async () => {
  const f = fixture(); mutate(f);
  await assert.rejects(f.verify(f.tokens(), f.config, 'synthetic-nonce'));
});

test('Wallet broker rejects modified signature and swapped signed access token', async () => {
  const f = fixture(); const first = f.tokens(); const segments = first.access_token.split('.');
  const bytes = Buffer.from(segments[2], 'base64url'); bytes[0] ^= 1; segments[2] = bytes.toString('base64url');
  await assert.rejects(f.verify({ ...first, access_token: segments.join('.') }, f.config, f.id.nonce));
  f.access.jti = 'new-synthetic-jti';
  await assert.rejects(f.verify({ ...first, access_token: f.tokens().access_token }, f.config, f.id.nonce));
});

test('Wallet broker rejects unapproved endpoints or callback before fetching keys', async () => {
  for (const patch of [{ clientId: 'opago-dashboard' }, { redirectUri: 'opagowallet://oidc-callback' },
    { tokenEndpoint: 'https://api.opago.com/api/v2/auth/token' }]) {
    const f = fixture(); await assert.rejects(f.verify(f.tokens(), { ...f.config, ...patch }, f.id.nonce));
    assert.deepEqual(f.calls, []);
  }
  const f = fixture(); const verify = createWalletBrokerVerifier({ ...f.discovery, jwks_uri: 'https://other.example/keys' }, f.ports);
  await assert.rejects(verify(f.tokens(), f.config, f.id.nonce)); assert.deepEqual(f.calls, []);
});

test('Actual PKCE login exchanges a bound callback and accepts the signed Wallet broker pair', async () => {
  const f = fixture(); let authorize; let count = 0; const store = new MemoryPrivateStore();
  const platform = { randomBytes: n => new Uint8Array(n).fill(++count), verify: f.verify,
    browser: async (url, redirect) => {
      authorize = new URL(url); f.id.nonce = authorize.searchParams.get('nonce');
      return redirect + '?' + new URLSearchParams({ code: 'synthetic-code', state: authorize.searchParams.get('state'), iss: f.config.issuer });
    },
    token: async (url, form) => {
      assert.equal(url, f.config.tokenEndpoint);
      assert.deepEqual([...form.keys()].sort(), ['client_id', 'code', 'code_verifier', 'grant_type', 'redirect_uri']);
      assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'), authorize.searchParams.get('code_challenge'));
      assert.equal(form.get('redirect_uri'), f.config.redirectUri);
      return f.tokens();
    },
  };
  const login = new OidcAccountLogin(f.config, { issuers: [f.config.issuer], redirectUris: [f.config.redirectUri], accessAudience: 'opago-account' }, platform, store, () => f.now * 1000);
  const credential = await login.login(false);
  assert.equal(credential.subject, f.access.sub); assert.equal(credential.expiresAt, f.access.exp * 1000);
});

// Exercise Expo's actual native config transforms, not only app.json values.
test('Native manifests retain legacy links and register the broker callback scheme', () => {
  const config = require('../app.json').expo;
  const { AndroidConfig, IOSConfig } = require('@expo/config-plugins');
  const manifest = { manifest: { application: [{ activity: [{ $: { 'android:name': '.MainActivity', 'android:launchMode': 'singleTask' },
    'intent-filter': [{ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }, { $: { 'android:name': 'android.intent.category.BROWSABLE' } }] }] }] }] } };
  const android = AndroidConfig.Scheme.getSchemesFromManifest(AndroidConfig.Scheme.setScheme(config, manifest));
  const ios = IOSConfig.Scheme.getSchemesFromPlist(IOSConfig.Scheme.setScheme(config, {}));
  for (const schemes of [android, ios]) {
    assert.ok(schemes.includes('com.opago.wallet')); assert.ok(schemes.includes('opagowallet'));
  }
});
