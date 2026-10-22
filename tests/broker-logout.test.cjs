const test = require('node:test');
const assert = require('node:assert/strict');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { revokeWalletBrokerSession } = require('../lib/opago/broker-logout.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const config = { issuer: 'https://api.opago.com', clientId: 'opago-wallet' };
const tokens = { accessToken: 'synthetic.header.signature', refreshToken: 'synthetic-refresh' };

test('Wallet logout revokes its refresh family and access token without end-session or website calls', async () => {
  const forms = [];
  await revokeWalletBrokerSession(async (url, options) => {
    assert.equal(url, 'https://api.opago.com/api/v2/auth/oauth/revoke');
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' });
    forms.push(Object.fromEntries(new URLSearchParams(options.body)));
    assert.equal(options.timeoutMs, 10000); assert.equal(options.maxBytes, 4096);
    return { status: 200, body: '' };
  }, config, tokens);
  assert.deepEqual(forms, [
    { token: tokens.refreshToken, client_id: 'opago-wallet', token_type_hint: 'refresh_token' },
    { token: tokens.accessToken, client_id: 'opago-wallet', token_type_hint: 'access_token' },
  ]);
});
test('access-only sessions revoke only their access token', async () => {
  let calls = 0;
  await revokeWalletBrokerSession(async (_url, options) => {
    calls++; assert.equal(new URLSearchParams(options.body).get('token_type_hint'), 'access_token');
    return { status: 200, body: '' };
  }, config, { accessToken: tokens.accessToken }); assert.equal(calls, 1);
});
test('partial failure still attempts the other revocation; retry stays client-bound and exposes no secrets', async () => {
  for (const failingHint of ['refresh_token', 'access_token']) {
    const calls = []; let retry = false;
    const http = async (_url, options) => {
      const form = new URLSearchParams(options.body); calls.push(form.get('token_type_hint'));
      if (!retry && form.get('token_type_hint') === failingHint) throw new Error(tokens.refreshToken);
      return { status: 200, body: '' };
    };
    await assert.rejects(revokeWalletBrokerSession(http, config, tokens), error =>
      error.code === 'account_logout_pending' && !error.message.includes(tokens.refreshToken));
    assert.deepEqual(calls, ['refresh_token', 'access_token']);
    retry = true; await revokeWalletBrokerSession(http, config, tokens);
    assert.equal(calls.length, 4);
  }
});
test('redirects, errors and unexpected success bodies are never acknowledged', async () => {
  for (const result of [{ status: 204, body: '' }, { status: 302, body: '' }, { status: 401, body: '' },
    { status: 503, body: '' }, { status: 200, body: 'unexpected' }]) {
    await assert.rejects(revokeWalletBrokerSession(async () => result, config, tokens), error => error.code === 'account_logout_pending');
  }
});
test('foreign issuer/client and invalid or oversized tokens never reach transport', async () => {
  for (const [context, value] of [[{ ...config, issuer: 'https://evil.example' }, tokens],
    [{ ...config, clientId: 'opago-dashboard' }, tokens], [config, { accessToken: 'invalid' }],
    [config, { ...tokens, accessToken: 'a'.repeat(16385) + '.b.c' }], [config, { ...tokens, refreshToken: 'bad token' }]]) {
    let calls = 0;
    await assert.rejects(revokeWalletBrokerSession(async () => { calls++; return { status: 200, body: '' }; }, context, value),
      error => error.code === 'account_logout_pending');
    assert.equal(calls, 0);
  }
});
