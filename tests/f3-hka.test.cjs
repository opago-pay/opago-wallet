'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, generateKeyPairSync, sign, verify, createPublicKey } = require('node:crypto');
const { ed25519 } = require('@noble/curves/ed25519');
const { gcm } = require('@noble/ciphers/aes');
const existingModules = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { hpkeSuite, responseDecrypt } = require('../lib/opago/hpke-crypto.ts');
const { NativeHkaTransport, canonicalTarget, verifyKeyDocument } = require('../lib/opago/hka.ts');
const { jcs, parseStrictJson, strictUtf8, utf8, unbase64url } = require('../lib/opago/encoding.ts');
const { createOidcVerifier, discoverOidc } = require('../lib/opago/oidc-verifier.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { nativeF3Enabled, nativeF3UpdateUrl } = require('../lib/opago/settings-native.ts');
const { OpagoApi } = require('../lib/opago/api.ts');
const { HkaTransactionPort } = require('../lib/opago/tx-api.ts');
const vectors = require('../docs/lnurl-spark-contracts/v2/fixtures/hpke-vectors.json').vectors;
const signed = require('../docs/lnurl-spark-contracts/v2/fixtures/hpke-key-document-vectors.json');
for (const name of Object.keys(require.cache)) if (name.endsWith('.ts') && !existingModules.has(name)) delete require.cache[name];
const clone = value => JSON.parse(JSON.stringify(value));
const hex = s => new Uint8Array(Buffer.from(s, 'hex'));
const b64 = b => Buffer.from(b).toString('base64url');
const oidc = { issuer: 'https://identity.example/realms/test', clientId: 'wallet-test', redirectUri: 'opagowallet://oidc-callback' };
const trust = { audience: signed.policy.expected_audience, platform: 'android', build: 10, roots: { 'test-root': b64(hex(signed.root_public_key_hex)) }, oidc, testOnly: true };
const epoch = Date.parse(signed.policy.now);
function configuration() { return { contract_version: '0.2.0', audience: trust.audience, issued_at: signed.policy.now, valid_until: '2026-09-28T13:00:00Z', cache_max_age: 300,
  min_supported_build: { ios: 1, android: 1 }, revoked_signing_key_ids: [], revoked_kids: [], oidc: { issuer: oidc.issuer, client_id: oidc.clientId, redirect_uris: [oidc.redirectUri], scopes: ['openid', 'email', 'profile'] },
  limits: { min_sendable_msat: 1000, max_sendable_msat: 100000000, photo_bytes: 10485760, photo_pixels: 24000000 } }; }
const request = () => ({ method: 'POST', path: '/api/v2/wallet/auth/logout', body: vectors[0].plaintext, auth: 'wallet', bearer: 'synthetic-wallet-access', idempotencyKey: randomUUID() });
function transportFixture(store = new MemoryPrivateStore(), v3 = false) {
  const state = { now: epoch, config: configuration(), keys: clone(signed.response), requests: [], plainCalls: 0, failConfig: false, responseMode: '', status: 200 };
  const http = async (url, options) => {
    assert.ok(options.timeoutMs <= 10000); assert.equal(options.headers['Cache-Control'], 'no-store');
    if (url.endsWith('/app/config') || url.endsWith('/auth/hpke-key')) {
      state.plainCalls++; if (state.failConfig) throw new Error('Synthetic outage');
      return { status: 200, contentType: 'application/json', cacheControl: state.responseMode === 'cache' ? 'public' : 'no-store', body: jcs(url.endsWith('/app/config') ? state.config : state.keys) };
    }
    const envelope = options.body ? parseStrictJson(options.body) : parseStrictJson(strictUtf8(unbase64url(options.headers['X-Opago-Envelope'])));
    const target = canonicalTarget(url.slice(trust.audience.length), options.method, url.includes('/api/v3/'));
    const aad = { method: options.method, path: target.path, query: target.query, kid: envelope.kid, nonce: envelope.nonce, issued_at: envelope.issued_at, audience: trust.audience,
      idempotency_key: options.headers['Idempotency-Key'] || null };
    const context = await hpkeSuite.createRecipientContext({ recipientKey: await hpkeSuite.kem.deserializePrivateKey(hex(vectors[0].test_receiver_private_key_hex)),
      enc: unbase64url(envelope.enc), info: utf8('opago-api:hpke:v1\0' + trust.audience + '\0' + envelope.kid) });
    const clear = parseStrictJson(strictUtf8(new Uint8Array(await context.open(unbase64url(envelope.ciphertext), utf8(jcs(aad))))));
    state.requests.push({ envelope, clear, options, aad });
    const key = new Uint8Array(await context.export(utf8('opago-response'), 32)); const iv = randomBytes(12);
    const responseAad = utf8(jcs({ request_aad: { ...aad, ...(state.responseMode === 'binding' ? { path: '/api/v2/wallet/other' } : {}) }, http_status: state.status }));
    const ciphertext = gcm(key, iv, responseAad).encrypt(utf8(state.responseBody || (state.responseMode === 'duplicate' ? '{"status":"ok","status":"bad"}' : '{"status":"ok"}')));
    if (state.responseMode === 'tamper') ciphertext[0] ^= 1;
    return { status: state.responseMode === 'status' ? 403 : state.status, contentType: 'application/json', retryAfter: '3',
      ...(v3 ? { cacheControl: state.responseMode === 'cache' ? 'public' : 'no-store', requestId: state.responseMode === 'request-id' ? 'invalid' : options.headers['X-Request-Id'] } : {}),
      body: state.responseMode === 'plaintext' ? '{"status":"ok"}' : jcs({ encryption: 'hpke-v1', nonce: b64(iv), ciphertext: b64(ciphertext) }) };
  };
  return { state, http, transport: new NativeHkaTransport({ ...trust, ...(v3 ? { txFoundationResolution: 'synthetic-only-reviewed-v3-hpke' } : {}) }, http, store, n => new Uint8Array(randomBytes(n)), () => state.now), store };
}

test('F5 v3 HPKE remains closed by default; opt-in reuses fresh authenticated envelopes with actual v3 AAD and required headers', async () => {
  const walletId = randomUUID(); const id = randomUUID(); const key = randomUUID();
  const body = { asset: 'BTC', rail: 'spark', id_source: 'SPARK_TRANSFER_ID', source_payment_id: 'transfer-test', direction: 'incoming', sdk_status: 'pending', status: 'pending', amount_msat: 1000 };
  const req = { method: 'POST', path: '/api/v3/wallets/' + walletId + '/payments/reports', contract: 'tx-foundation-v3', body, auth: 'wallet', bearer: 'synthetic-v3-session', idempotencyKey: key };
  await assert.rejects(transportFixture().transport.request(req), /sync_backend_pending/);
  assert.throws(() => canonicalTarget(req.path)); assert.throws(() => canonicalTarget(req.path + '?unknown=value','POST',true));
  const f = transportFixture(new MemoryPrivateStore(), true); f.state.status = 201;
  const receipt = { receipt_id: id, received_at: signed.policy.now, wallet_id: walletId, id_source: body.id_source, source_payment_id: body.source_payment_id,
    external_id: 'spark-transfer:transfer-test', resolution: 'unresolved', transaction_id: null, verification_status: 'wallet_reported', retry_due_at: '2026-09-28T12:30:00Z' };
  f.state.responseBody = jcs(receipt);
  const auth = { walletId, bearer: req.bearer }; const port = new HkaTransactionPort({ mode: 'hka', request: r => f.transport.request(r) }, async () => auth);
  assert.deepEqual(await port.report(auth,body,key),receipt); assert.deepEqual(await port.report(auth,body,key),receipt);
  const [a,b] = f.state.requests; assert.deepEqual(a.clear,body); assert.deepEqual(b.clear,body);
  assert.equal(a.aad.path,req.path); assert.equal(b.options.headers['Idempotency-Key'],key);
  assert.equal(a.options.headers['X-Opago-Contract'],'tx-foundation-v3'); assert.equal(a.options.headers['X-Opago-App-Build'],'10'); assert.equal(a.options.headers['X-Opago-Platform'],'android');
  assert.notEqual(a.options.headers['X-Request-Id'],b.options.headers['X-Request-Id']); assert.notEqual(a.envelope.enc,b.envelope.enc); assert.notEqual(a.envelope.nonce,b.envelope.nonce);
  f.state.status = 200; assert.deepEqual(await port.receipt(auth,id),receipt); assert.ok(f.state.requests[2].options.headers['X-Opago-Envelope']);
  for (const mode of ['tamper','binding','plaintext','cache','request-id']) { f.state.responseMode = mode; await assert.rejects(port.receipt(auth,id)); }
});

test('F4 POS confirmation uses the contractual wallet route through authenticated HPKE with durable logical key', async () => {
  const f = transportFixture();
  const pos = { pos_id: 'pos-abcdefghij', address: 'pos-abcdefghij@opago.com', binding_version: 1, wallet_id: randomUUID(), status: 'active' };
  f.state.responseBody = jcs(pos);
  const req = { method: 'POST', path: '/api/v2/pos/pos-abcdefghij/bindings', body: { binding_intent_id: randomUUID(), proof_token: 'synthetic-pos-proof' }, auth: 'wallet', bearer: 'synthetic-wallet-token', idempotencyKey: randomUUID() };
  const api = new OpagoApi(f.transport);
  assert.deepEqual(await api.call(req), pos); assert.deepEqual(await api.call(req), pos);
  assert.equal(f.state.requests.length, 2);
  assert.deepEqual(f.state.requests[0].clear, req.body); assert.deepEqual(f.state.requests[1].clear, req.body);
  assert.equal(f.state.requests[0].aad.path, req.path);
  assert.equal(f.state.requests[0].aad.idempotency_key, f.state.requests[1].aad.idempotency_key);
  assert.notEqual(f.state.requests[0].envelope.enc, f.state.requests[1].envelope.enc);
  assert.notEqual(f.state.requests[0].envelope.nonce, f.state.requests[1].envelope.nonce);
});

test('HKA Hermes primitives match all shared Python-generated HPKE vectors, response and photo exporters', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try {
    for (const v of vectors) {
      assert.equal(Buffer.from(utf8(jcs(v.aad))).toString('hex'), v.aad_hex);
      const context = await hpkeSuite.createRecipientContext({ recipientKey: await hpkeSuite.kem.deserializePrivateKey(hex(v.test_receiver_private_key_hex)),
        enc: unbase64url(v.envelope.enc), info: hex(v.info_hex) });
      assert.equal(Buffer.from(await context.open(unbase64url(v.envelope.ciphertext), hex(v.aad_hex))).toString('hex'), v.plaintext_hex);
      const key = new Uint8Array(await context.export(utf8('opago-response'), 32));
      assert.equal(Buffer.from(key).toString('hex'), v.response_export_key_hex);
      assert.deepEqual(parseStrictJson(strictUtf8(responseDecrypt(key, unbase64url(v.response.nonce), unbase64url(v.response.ciphertext), hex(v.response_aad_hex)))), v.response_plaintext);
      if (v.name === 'photo') {
        const photoKey = new Uint8Array(await context.export(utf8('opago-photo'), 32)); assert.equal(Buffer.from(photoKey).toString('hex'), v.photo_export_key_hex);
        const body = hex(v.photo_body_hex);
        assert.equal(Buffer.from(responseDecrypt(photoKey, body.slice(0, 12), body.slice(12), hex(v.photo_aad_hex))).toString('hex'), v.photo_plaintext_hex);
      }
      assert.throws(() => responseDecrypt(key, unbase64url(v.response.nonce), unbase64url(v.response.ciphertext), utf8('{}')));
    }
  } finally { if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); else delete globalThis.crypto; }
});
test('HKA verifies shared Ed25519 document, rotation, revocation, audience, expiry and rollback', () => {
  assert.equal(Buffer.from(utf8(jcs(signed.response.document))).toString('hex'), signed.signed_bytes_hex);
  assert.deepEqual(verifyKeyDocument(signed.response, configuration(), trust, epoch), signed.response);
  const invalid = [value => { value.signature = b64(new Uint8Array(64)); }, value => { value.document.extra = true; },
    value => { value.document.keys.push(value.document.keys[0]); }, value => { value.document.active_kid = 'unknown'; }, value => { value.document.audience = 'https://other.example'; },
    value => { value.document.issued_at = '2026-09-28T12:06:00Z'; }, value => { value.document.keys[0].not_after = signed.policy.now; }];
  for (const edit of invalid) { const value = clone(signed.response); edit(value); assert.throws(() => verifyKeyDocument(value, configuration(), trust, epoch)); }
  for (const patch of [{ revoked_kids: [signed.response.document.active_kid] }, { revoked_signing_key_ids: ['test-root'] }]) assert.throws(() => verifyKeyDocument(signed.response, { ...configuration(), ...patch }, trust, epoch));
  assert.throws(() => verifyKeyDocument(signed.response, configuration(), trust, epoch, { issuedAt: '2026-09-28T12:01:00Z', digest: '' }));
  const root2 = new Uint8Array(32).fill(8); const rotated = clone(signed.response); rotated.signing_key_id = 'backup-root';
  rotated.signature = b64(ed25519.sign(utf8(jcs(rotated.document)), root2));
  assert.deepEqual(verifyKeyDocument(rotated, configuration(), { ...trust, roots: { ...trust.roots, 'backup-root': b64(ed25519.getPublicKey(root2)) } }, epoch), rotated);
  assert.throws(() => new NativeHkaTransport({ ...trust, testOnly: false, audience: 'https://api.opago.com' }, async () => {}, new MemoryPrivateStore(), randomBytes));
});
test('HKA exact JSON/header envelopes use fresh encapsulation and nonce on retries with stable semantic key', async () => {
  const f = transportFixture(); const operation = request();
  for (let i = 0; i < 3; i++) assert.deepEqual(await f.transport.request(operation), { status: 200, body: { status: 'ok' }, authenticated: true, retryAfterSeconds: 3 });
  assert.equal(f.state.plainCalls, 2); assert.equal(new Set(f.state.requests.map(r => r.envelope.enc)).size, 3); assert.equal(new Set(f.state.requests.map(r => r.envelope.nonce)).size, 3);
  for (const r of f.state.requests) { assert.deepEqual(r.clear, operation.body); assert.equal(r.aad.idempotency_key, operation.idempotencyKey); assert.equal(r.options.headers.Authorization, 'Bearer synthetic-wallet-access'); }
  await f.transport.request({ method: 'GET', path: '/api/v2/wallet/me', body: {}, auth: 'wallet', bearer: operation.bearer });
  await f.transport.request({ method: 'DELETE', path: '/api/v2/account', body: {}, auth: 'account', bearer: 'synthetic-account-access', idempotencyKey: randomUUID() });
  for (const r of f.state.requests.slice(3)) { assert.equal(r.options.body, undefined); assert.ok(r.options.headers['X-Opago-Envelope']); assert.deepEqual(r.clear, {}); }
});
test('HKA refuses plaintext, changed HTTP status, unrelated response AAD, tag corruption and duplicate response JSON', async () => {
  for (const mode of ['plaintext', 'status', 'binding', 'tamper', 'duplicate']) { const f = transportFixture(); f.state.responseMode = mode; await assert.rejects(f.transport.request(request())); assert.equal(f.state.requests.length, 1); }
});
test('HKA renews credentials once for an authenticated key error, retaining the mutation key and input', async () => {
  const f = transportFixture(); const op = request(); f.state.status = 400;
  f.state.responseBody = jcs({ error: { code: 'invalid_hpke_credentials', message: 'Synthetic key renewal.', retryable: false, details: {} }, request_id: randomUUID() });
  const http = async (...args) => { const result = await f.http(...args); if (f.state.requests.length === 1) { f.state.status = 200; f.state.responseBody = ''; } return result; };
  const transport = new NativeHkaTransport(trust, http, f.store, n => randomBytes(n), () => f.state.now);
  assert.equal((await transport.request(op)).status, 200); assert.equal(f.state.requests.length, 2); assert.equal(f.state.plainCalls, 4);
  assert.equal(f.state.requests[0].aad.idempotency_key, f.state.requests[1].aad.idempotency_key); assert.deepEqual(f.state.requests[0].clear, f.state.requests[1].clear);
  assert.notEqual(f.state.requests[0].envelope.enc, f.state.requests[1].envelope.enc);
});
test('HKA fresh-config gate blocks stale/outage, unsupported build, wrong OIDC config and key revocation across restart', async () => {
  for (const edit of [s => { s.config.min_supported_build.android = 11; }, s => { s.config.valid_until = signed.policy.now; }, s => { s.config.oidc.issuer = 'https://evil.example'; },
    s => { s.config.revoked_kids = [s.keys.document.active_kid]; }, s => { s.config.revoked_signing_key_ids = ['test-root']; }, s => { s.responseMode = 'cache'; }]) {
    const f = transportFixture(); edit(f.state); await assert.rejects(f.transport.request(request())); assert.equal(f.state.requests.length, 0);
  }
  const f = transportFixture(); await f.transport.request(request()); f.state.now += 301000; f.state.failConfig = true;
  await assert.rejects(f.transport.request(request()), /outage/); assert.equal(f.state.requests.length, 1);
  const next = transportFixture(f.store); next.state.config.issued_at = '2026-09-28T11:59:59Z';
  await assert.rejects(next.transport.request(request()), /rollback/); assert.equal(next.state.requests.length, 0);
});
test('HKA rejects ambiguous paths, duplicate/unexpected query keys, unsafe Unicode and noncanonical encoding', () => {
  assert.deepEqual(canonicalTarget('/api/v2/wallet/address/availability?%6Eame=alice.test'), { path: '/api/v2/wallet/address/availability', query: [['name', 'alice.test']], target: '/api/v2/wallet/address/availability?name=alice.test' });
  assert.throws(() => canonicalTarget('/api/v2/wallet/address/availability?name=a+b')); // '+' never becomes a space or a valid name.
  for (const target of ['/api/v2/wallet/../account', '/api/v2/wallet//x', '/api/v2/%61ccount', '/api/v2/wallet/', '/api/v2/wallet?x=a', '/api/v2/wallet/address/availability?name=a&name=b', '/api/v2/wallet/address/availability?name=%FF']) assert.throws(() => canonicalTarget(target));
  for (const raw of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":"\\ud800"}', '{"x":9007199254740992}', '1e999', '{}x']) assert.throws(() => parseStrictJson(raw));
  assert.throws(() => unbase64url('AQ==')); assert.throws(() => unbase64url('AR')); assert.throws(() => strictUtf8(new Uint8Array([0xc0, 0xaf])));
});

function oidcFixture() {
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey; const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  const publicJwk = { ...jwk, kid: 'synthetic-rsa', alg: 'RS256', use: 'sig' };
  const now = Math.floor(Date.now() / 1000); const config = { ...oidc, authorizationEndpoint: oidc.issuer + '/auth', tokenEndpoint: oidc.issuer + '/token' };
  const accessAudience = 'https://api.test.example';
  const id = { iss: oidc.issuer, aud: oidc.clientId, sub: 'synthetic-subject', iat: now, exp: now + 600, auth_time: now, nonce: 'synthetic-nonce', email_verified: true, email: 'synthetic@example.test' };
  const access = { iss: oidc.issuer, aud: accessAudience, azp: oidc.clientId, sub: id.sub, iat: now, exp: now + 600, typ: 'Bearer' };
  const signedJwt = (claims, header = {}) => { const message = b64(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: publicJwk.kid, ...header }))) + '.' + b64(utf8(JSON.stringify(claims))); return message + '.' + b64(sign('RSA-SHA256', Buffer.from(message), privateKey)); };
  const discovery = { issuer: oidc.issuer, jwks_uri: oidc.issuer + '/jwks', authorization_endpoint: config.authorizationEndpoint, token_endpoint: config.tokenEndpoint };
  const ports = { json: async url => { assert.equal(url, discovery.jwks_uri); return { keys: [publicJwk] }; }, verifyRs256: async (n,e,message,sig) => verify('RSA-SHA256', message, createPublicKey({ key: { kty: 'RSA', n: b64(n), e: b64(e) }, format: 'jwk' }), sig) };
  return { config, discovery, ports, publicJwk, id, access, signedJwt, now, verifier: createOidcVerifier(discovery, accessAudience, ports, () => now * 1000), tokens: () => ({ id_token: signedJwt(id), access_token: signedJwt(access) }) };
}
test('F3 OIDC verifier validates real RS256 signatures, issuer, both audiences, nonce/contact and subject binding', async () => {
  const f = oidcFixture(); const claims = await f.verifier(f.tokens(), f.config, f.id.nonce);
  assert.equal(claims.subject, f.id.sub); assert.equal(claims.accessAudience, f.access.aud); assert.equal(claims.authTime, f.now * 1000);
  const bad = f.tokens(); bad.access_token = bad.access_token.slice(0, -5) + 'AAAAA'; await assert.rejects(f.verifier(bad, f.config, f.id.nonce));
  for (const [kind, patch] of [['id', { nonce: 'wrong' }], ['id', { email_verified: false }], ['id', { aud: 'other-client' }], ['access', { aud: 'other-api' }], ['access', { sub: 'other-subject' }], ['access', { azp: 'other-client' }], ['access', { exp: f.now - 1 }], ['id', { iss: 'https://evil.example' }]]) {
    const saved = { ...f[kind] }; Object.assign(f[kind], patch); await assert.rejects(f.verifier(f.tokens(), f.config, 'synthetic-nonce')); Object.assign(f[kind], saved);
  }
});
test('F3 OIDC refuses algorithm confusion, unsigned tokens, remote key URLs, duplicate kids and private JWKS material', async () => {
  const f = oidcFixture();
  for (const patch of [{ alg: 'none' }, { alg: 'HS256' }, { jku: 'https://evil.example/keys' }, { crit: ['unknown'] }, { b64: false }, { kid: 'unknown' }, { typ: 'unexpected' }]) {
    await assert.rejects(f.verifier({ id_token: f.signedJwt(f.id, patch), access_token: f.signedJwt(f.access) }, f.config, f.id.nonce));
  }
  for (const keys of [[f.publicJwk, f.publicJwk], [{ ...f.publicJwk, d: 'synthetic-private-data' }], [{ ...f.publicJwk, alg: 'ES256' }], [{ ...f.publicJwk, n: 'AQ' }]]) {
    const check = createOidcVerifier(f.discovery, f.access.aud, { ...f.ports, json: async () => ({ keys }) }); await assert.rejects(check(f.tokens(), f.config, f.id.nonce));
  }
});
test('F3 OIDC discovery only accepts exact pinned issuer and same-origin trusted endpoints', async () => {
  const f = oidcFixture(); assert.deepEqual(await discoverOidc(oidc.issuer, async () => f.discovery), f.discovery);
  for (const patch of [{ issuer: 'https://evil.example' }, { jwks_uri: 'https://evil.example/keys' }, { token_endpoint: oidc.issuer + '/token#secret' }, { authorization_endpoint: 'http://identity.example/auth' }]) {
    await assert.rejects(discoverOidc(oidc.issuer, async () => ({ ...f.discovery, ...patch })));
  }
});

test('F3 OIDC verifies ES256 and explicitly allowed Ed25519 without RSA or decode-only fallback', async () => {
  const f = oidcFixture();
  for (const algorithm of ['ES256', 'EdDSA']) {
    const pair = algorithm === 'ES256' ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' }) : generateKeyPairSync('ed25519');
    const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'synthetic-curve', alg: algorithm, use: 'sig' };
    function token(claims) {
      const input = b64(utf8(JSON.stringify({ alg: algorithm, kid: jwk.kid, typ: 'JWT' }))) + '.' + b64(utf8(JSON.stringify(claims)));
      const signature = algorithm === 'ES256' ? sign('SHA256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }) : sign(null, Buffer.from(input), pair.privateKey);
      return input + '.' + b64(signature);
    }
    const check = createOidcVerifier(f.discovery, f.access.aud, { json: async () => ({ keys: [jwk] }), verifyRs256: async () => { throw new Error('Unexpected RSA'); } }, () => f.now * 1000, [algorithm]);
    assert.equal((await check({ id_token: token(f.id), access_token: token(f.access) }, f.config, f.id.nonce)).subject, f.id.sub);
    await assert.rejects(check({ id_token: token(f.id), access_token: token({ ...f.access, sub: 'other-subject' }) }, f.config, f.id.nonce));
  }
});

test('HKA minimum build provides a typed update state and accepts only locally pinned distribution links', async () => {
  const f = transportFixture(); f.state.config.min_supported_build.android = 11;
  await assert.rejects(f.transport.request(request()), cause => cause.code === 'app_update_required'); assert.equal(f.state.requests.length, 0);
  const original = process.env.EXPO_PUBLIC_OPAGO_F3_ANDROID_UPDATE_URL; const enabled = process.env.EXPO_PUBLIC_OPAGO_F3_ENABLED;
  try {
    process.env.EXPO_PUBLIC_OPAGO_F3_ENABLED = 'false'; assert.equal(nativeF3Enabled(), false);
    process.env.EXPO_PUBLIC_OPAGO_F3_ANDROID_UPDATE_URL = 'https://play.google.com/store/apps/details?id=com.opago.wallet'; assert.equal(nativeF3UpdateUrl('android'), process.env.EXPO_PUBLIC_OPAGO_F3_ANDROID_UPDATE_URL);
    for (const url of ['https://evil.example/update', 'http://opago.com/download', 'https://opago.com@evil.example/update', 'https://opago.com/download#token', 'https://opago.com:8443/download']) {
      process.env.EXPO_PUBLIC_OPAGO_F3_ANDROID_UPDATE_URL = url; assert.throws(() => nativeF3UpdateUrl('android'));
    }
  } finally {
    if (original === undefined) delete process.env.EXPO_PUBLIC_OPAGO_F3_ANDROID_UPDATE_URL; else process.env.EXPO_PUBLIC_OPAGO_F3_ANDROID_UPDATE_URL = original;
    if (enabled === undefined) delete process.env.EXPO_PUBLIC_OPAGO_F3_ENABLED; else process.env.EXPO_PUBLIC_OPAGO_F3_ENABLED = enabled;
  }
});
