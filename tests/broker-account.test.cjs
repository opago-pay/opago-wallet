const test = require('node:test');
const assert = require('node:assert/strict');
const { nativeFixture, tick } = require('./broker-account-fixture.cjs');

test('native account flow: runtime config, PKCE callback, ES256 verification, secure storage, restore and client logout', async () => {
  const f = nativeFixture(); const current = f.wallet.captureRuntime();
  assert.equal((await f.flow.run('check', current)).status, 'ready');
  const result = await f.flow.run('login', current);
  assert.equal(result.status, 'signed_in'); assert.deepEqual(Object.keys(result).sort(), ['expiresAt','status']);
  const request = new URL(f.opened[0]); assert.equal(request.searchParams.get('client_id'), 'opago-wallet');
  assert.equal(request.searchParams.get('code_challenge_method'), 'S256');
  const saved = await f.store.read(f.slot); assert.ok(saved.tokens.refresh_token);
  assert.equal((await f.flow.run('check', current)).status, 'signed_in');
  assert.equal(f.http.filter(r => r.url.endsWith('/token')).length, 1);
  // Expired stored access is renewed through the broker, retaining the same nonce.
  await f.store.write(f.slot, { ...saved, expiresAt: 0 });
  assert.equal((await f.flow.run('check', current)).status, 'signed_in');
  const refreshed = await f.store.read(f.slot); assert.notEqual(refreshed.tokens.refresh_token, saved.tokens.refresh_token);
  f.failConfig(); // Logging out never depends on fresh discovery.
  assert.equal((await f.flow.run('logout', current)).status, 'signed_out');
  assert.equal(await f.store.read(f.slot), null);
  const revokes = f.http.filter(r => r.url.endsWith('/revoke')); assert.equal(revokes.length, 2);
  assert.equal(new URLSearchParams(revokes[0].body).get('token'), refreshed.tokens.refresh_token);
  assert.ok(f.http.every(r => !r.url.includes('keycloak') && !r.url.includes('/auth/oauth/logout')));
});

test('auth callback waits for foreground before accepting tokens', async () => {
  let respond; const f = nativeFixture({ open: (url, callback) => { f.change('background'); return new Promise(resolve => { respond = () => resolve(callback(url)); }); } });
  const oldApproval = f.wallet.capture(); const pending = f.flow.run('login', f.wallet.captureRuntime()); await tick();
  respond(); await tick(); assert.equal(f.http.some(r => r.url.endsWith('/token')), false);
  f.change('active'); assert.equal((await pending).status, 'signed_in'); assert.throws(oldApproval);
});
for (const event of ['cancel', 'lock', 'unlock']) test('late callback after ' + event + ' cannot exchange or persist tokens', async () => {
  let respond; const f = nativeFixture({ open: (url, callback) => new Promise(resolve => { respond = () => resolve(callback(url)); }) });
  const pending = f.flow.run('login', f.wallet.captureRuntime()); const rejected = assert.rejects(pending); await tick();
  if (event === 'cancel') f.flow.cancel(); else f.wallet[event]();
  await rejected; respond(); await tick();
  assert.equal(await f.store.read(f.slot), null); assert.equal(f.http.some(r => r.url.endsWith('/token')), false);
  assert.equal(f.dismissals(), 1);
});
test('bad callback and invalid token signature never authenticate', async () => {
  for (const options of [
    { open: async (url, callback) => { const result = callback(url); result.url += '&state=other'; return result; } },
    { http: async url => url.endsWith('/jwks') ? { status: 200, body: '{"keys":[]}' } : undefined },
  ]) {
    const f = nativeFixture(options); await assert.rejects(f.flow.run('login', f.wallet.captureRuntime())); assert.equal(await f.store.read(f.slot), null);
  }
});
test('double tap cannot start a second authentication session', async () => {
  let respond; const f = nativeFixture({ open: (_url, _callback) => new Promise(resolve => { respond = () => resolve({ type: 'cancel' }); }) });
  const pending = f.flow.run('login', f.wallet.captureRuntime()); await tick();
  assert.equal(await f.flow.run('login', f.wallet.captureRuntime()), null); assert.equal(f.opened.length, 1);
  respond(); assert.equal((await pending).status, 'cancelled');
});
test('callback route discards all codes and arbitrary parameters', () => {
  const { sanitizeNativeIntent } = require('../lib/native-intent.ts');
  assert.equal(sanitizeNativeIntent('com.opago.wallet:/oauth/callback?code=secret&state=secret&success=true'), '/opago-account');
  assert.equal(sanitizeNativeIntent('com.opago.wallet://evil/oauth/callback?code=secret'), '/');
});

test('a rejected refresh allows explicit sign-in again without claiming a session', async () => {
  let rejectRefresh = false;
  const f = nativeFixture({ http: async (url, init) => rejectRefresh && url.endsWith('/token') ? { status: 401, body: '' } : undefined });
  const current = f.wallet.captureRuntime(); await f.flow.run('login', current);
  await f.store.write(f.slot, { ...await f.store.read(f.slot), expiresAt: 0 }); rejectRefresh = true;
  const result = await f.flow.run('check', current); assert.equal(result.status, 'ready'); assert.equal(result.signInRequired, true);
  rejectRefresh = false; assert.equal((await f.flow.run('login', current)).status, 'signed_in');
});

test('cancelling during JWKS verification cannot save the exchanged tokens', async () => {
  let release;
  const f = nativeFixture({ http: (url) => url.endsWith('/jwks') ? new Promise(resolve => { release = () => resolve(undefined); }) : undefined });
  const pending = f.flow.run('login', f.wallet.captureRuntime()); const rejected = assert.rejects(pending); await tick();
  f.flow.cancel(); release(); await rejected; assert.equal(await f.store.read(f.slot), null);
});
test('browser timeout releases the attempt and ignores a later valid callback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let respond; const f = nativeFixture({ open: (url, callback) => new Promise(resolve => { respond = () => resolve(callback(url)); }) });
  const pending = f.flow.run('login', f.wallet.captureRuntime()); const rejected = assert.rejects(pending); await tick();
  t.mock.timers.tick(120001); await rejected; assert.equal(f.dismissals(), 1);
  respond(); await tick(); assert.equal(await f.store.read(f.slot), null);
});
