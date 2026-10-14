const test = require('node:test');
const assert = require('node:assert/strict');
const { account, nativeFixture, ready, config, response, tick, RuntimeConfigClient, sanitizeNativeIntent } = require('./website-account-fixture.cjs');

for (const action of ['login', 'signup']) test('production ' + action + ' checks fresh config but never guesses a website or sends credentials', async () => {
  const f = nativeFixture();
  assert.deepEqual(await f.flow.run(action, f.wallet.captureRuntime()), { status: 'unavailable' });
  assert.deepEqual(f.opened, []);
  assert.equal(f.http.length, 1); assert.equal(f.http[0].url, 'https://api.opago.com/api/v2/app/config');
  assert.equal(f.http[0].method, 'GET'); assert.equal(f.http[0].body, undefined);
  assert.equal(f.http[0].headers.Authorization, undefined);
});
for (const fault of ['503', '302', 'html', 'cache', 'expired', 'future', 'audience', 'extra', 'missing', 'json', 'network', 'update']) {
  test('configuration fails closed: ' + fault, async () => {
    const f = nativeFixture({ http: async () => {
      const data = config(), reply = response(data);
      if (fault === '503' || fault === '302') reply.status = Number(fault);
      if (fault === 'html') reply.contentType = 'text/html';
      if (fault === 'cache') reply.cacheControl = 'public';
      if (fault === 'expired') data.valid_until = new Date(Date.now() - 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      if (fault === 'future') data.issued_at = new Date(Date.now() + 600000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      if (fault === 'audience') data.audience = 'https://old.example.test';
      if (fault === 'extra') data.website = ready(); // Explicitly unrecognized wire data.
      if (fault === 'missing') delete data.oidc;
      if (fault === 'update') data.min_supported_build.android = 15;
      if (fault === 'network') throw new Error('sensitive-network-detail');
      reply.body = fault === 'json' ? '{invalid' : JSON.stringify(data); return reply;
    } });
    await assert.rejects(f.flow.run('login', f.wallet.captureRuntime()), e => e instanceof account.WebsiteAccountError && !e.message.includes('sensitive'));
    assert.deepEqual(f.opened, []); assert.equal(f.http.length, 1);
  });
}
test('closed build and unsupported web never fetch or launch anything', async () => {
  for (const options of [{ enabled: false }, { platform: 'web' }]) {
    const f = nativeFixture(options); await assert.rejects(f.flow.run('signup', () => {}));
    assert.deepEqual(f.opened, []); assert.deepEqual(f.http, []);
  }
});
for (const action of ['login', 'signup']) test('synthetic adapter routes ' + action + ' through actual Expo wiring and waits for Android return', async () => {
  const f = nativeFixture({ availability: async () => ready() });
  const oldApproval = f.wallet.capture(); let done = false;
  const run = f.flow.run(action, f.wallet.captureRuntime()).then(result => { done = true; return result; });
  await tick(); assert.deepEqual(f.opened, [ready().destinations[action]]); assert.equal(done, false);
  assert.throws(oldApproval); assert.throws(() => f.wallet.capture());
  f.change('background'); assert.equal(f.wallet.isUnlocked(), true);
  f.change('active'); assert.deepEqual(await run, { status: 'returned' });
  assert.throws(oldApproval); assert.doesNotThrow(f.wallet.capture()); assert.equal(f.listeners.size, 0);
});
test('iOS dismissal is cancellation and another explicit attempt may start', async () => {
  const f = nativeFixture({ platform: 'ios', availability: async () => ready(), open: async () => ({ type: 'cancel' }) });
  for (let n = 0; n < 2; n++) assert.deepEqual(await f.flow.run('login', f.wallet.captureRuntime()), { status: 'cancelled' });
  assert.equal(f.opened.length, 2); assert.equal(f.listeners.size, 0);
});
test('return before native open resolves is handled without inventing a session', async () => {
  let resolve; const f = nativeFixture({ availability: async () => ready(), open: () => new Promise(r => { resolve = r; }) });
  const result = f.flow.run('login', f.wallet.captureRuntime()); await tick();
  f.change('background'); f.change('active'); resolve({ type: 'opened' });
  assert.deepEqual(await result, { status: 'returned' });
});
test('double taps across login and signup cannot open two browsers', async () => {
  const f = nativeFixture({ availability: async () => ready() });
  const first = f.flow.run('login', f.wallet.captureRuntime());
  assert.equal(await f.flow.run('signup', f.wallet.captureRuntime()), null); await tick();
  assert.equal(await f.flow.run('check', f.wallet.captureRuntime()), null);
  assert.equal(f.opened.length, 1); f.change('background'); f.change('active'); await first;
});
for (const event of ['lock', 'unlock', 'cancel']) test('stale native result is discarded after ' + event, async () => {
  let resolve; const f = nativeFixture({ availability: async () => ready(), open: () => new Promise(r => { resolve = r; }) });
  const result = f.flow.run('login', f.wallet.captureRuntime()); const rejected = assert.rejects(result); await tick();
  if (event === 'cancel') f.flow.cancel(); else f.wallet[event]();
  await rejected;
  if (!f.wallet.isUnlocked()) f.wallet.unlock();
  await assert.rejects(f.flow.run('signup', f.wallet.captureRuntime())); // Opening still pending.
  assert.equal(f.opened.length, 1); resolve({ type: 'opened' }); await tick();
  const retry = f.flow.run('signup', f.wallet.captureRuntime()); await tick();
  resolve({ type: 'opened' }); await tick(); f.change('background'); f.change('active');
  assert.deepEqual(await retry, { status: 'returned' });
});
test('browser error is retryable and exposes no raw backend details', async () => {
  const f = nativeFixture({ availability: async () => ready(), open: async () => { throw new Error('sensitive'); } });
  await assert.rejects(f.flow.run('login', f.wallet.captureRuntime()), e => e instanceof account.WebsiteAccountError && !e.message.includes('sensitive'));
  assert.equal(f.listeners.size, 0); assert.doesNotThrow(f.wallet.capture());
});
test('idle timeout during browser still locks the wallet and rejects return', async () => {
  let now = 0; const f = nativeFixture({ now: () => now, availability: async () => ready() });
  const result = f.flow.run('login', f.wallet.captureRuntime()); const rejected = assert.rejects(result); await tick();
  f.change('background'); now = 120001; f.change('active'); await rejected; assert.equal(f.wallet.isUnlocked(), false);
});
test('cancelled configuration cannot open a browser or replace a newer attempt', async () => {
  const replies = [], opened = [];
  const flow = new account.WebsiteAccountFlow(() => new Promise(r => replies.push(r)), { open: async url => { opened.push(url); return 'cancelled'; } });
  const old = flow.run('login', () => {}), rejected = assert.rejects(old); flow.cancel();
  const newer = flow.run('signup', () => {}); replies[0](ready()); await rejected;
  assert.deepEqual(opened, []); replies[1](ready()); assert.deepEqual(await newer, { status: 'cancelled' });
  assert.deepEqual(opened, [ready().destinations.signup]);
});
test('expired or unsafe synthetic destinations cannot start a browser', async () => {
  for (const invalid of ['http://website.example.test', 'https://user:pass@website.example.test', 'javascript:alert(1)', 'https://website.example.test/#token']) {
    const value = ready(); value.destinations.login = invalid;
    const f = nativeFixture({ availability: async () => value }); await assert.rejects(f.flow.run('login', () => {})); assert.deepEqual(f.opened, []);
  }
  const value = ready(); value.expiresAt = Date.now() - 1;
  const f = nativeFixture({ availability: async () => value }); await assert.rejects(f.flow.run('signup', () => {})); assert.deepEqual(f.opened, []);
});
test('AppConfig request respects abort even if the transport ignores it', async () => {
  let resolve; const abort = new AbortController();
  const client = new RuntimeConfigClient(() => new Promise(r => { resolve = r; }), 'android', 14);
  const pending = client.configuration(abort.signal); abort.abort(); resolve(response(config()));
  await assert.rejects(pending, e => e.problem === 'cancelled');
});
test('arbitrary auth links do not bypass existing native-intent review routing', () => {
  for (const link of ['opagowallet://oidc-callback?code=synthetic', 'opagowallet://opago-account?access_token=synthetic',
    'opagowallet://opago-signup?success=true', 'https://opago.com/login?success=true']) assert.equal(sanitizeNativeIntent(link), '/');
});
test('readiness is rechecked at action time; an outage never uses the last destination', async () => {
  let reads = 0;
  const f = nativeFixture({ availability: async () => ++reads === 1 ? ready() : { status: 'unavailable' } });
  assert.equal((await f.flow.run('check', () => {})).status, 'ready');
  assert.deepEqual(await f.flow.run('login', () => {}), { status: 'unavailable' });
  assert.equal(reads, 2); assert.deepEqual(f.opened, []);
});
test('iOS dismissal while inactive waits for foreground; abort invokes Expo dismissal', async () => {
  let resolve; const f = nativeFixture({ platform: 'ios', availability: async () => ready(), open: () => new Promise(r => { resolve = r; }) });
  let done = false; const result = f.flow.run('login', f.wallet.captureRuntime()).then(value => { done = true; return value; });
  await tick(); f.change('inactive'); resolve({ type: 'cancel' }); await tick(); assert.equal(done, false);
  f.change('active'); assert.deepEqual(await result, { status: 'cancelled' });
  const retry = f.flow.run('signup', f.wallet.captureRuntime()), rejected = assert.rejects(retry); await tick();
  f.flow.cancel(); await rejected; assert.equal(f.dismissed.length, 1);
  resolve({ type: 'cancel' }); await tick();
});
test('synthetic browser success and token-shaped results cannot authenticate', async () => {
  const f = nativeFixture({ availability: async () => ready(), open: async () => ({ type: 'success', url: 'opagowallet://?token=synthetic', accessToken: 'synthetic' }) });
  await assert.rejects(f.flow.run('login', f.wallet.captureRuntime()));
  assert.equal(f.listeners.size, 0);
});
