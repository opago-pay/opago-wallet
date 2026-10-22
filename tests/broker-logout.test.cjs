const test = require('node:test');
const assert = require('node:assert/strict');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { endWalletBrokerSession } = require('../lib/opago/broker-logout.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const config = { issuer: 'https://api.opago.com', clientId: 'opago-wallet' };
const hint = 'synthetic.header.signature';
test('Wallet end-session sends only the ID hint and client, accepts empty 204', async () => {
  await endWalletBrokerSession(async (url, options) => {
    assert.equal(url, 'https://api.opago.com/api/v2/auth/oauth/logout');
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' });
    assert.deepEqual(Object.fromEntries(new URLSearchParams(options.body)), { id_token_hint: hint, client_id: 'opago-wallet' });
    assert.equal(options.timeoutMs, 10000); assert.equal(options.maxBytes, 4096);
    return { status: 204, body: '' };
  }, config, hint);
});
test('unconfirmed status, redirect, malformed success and network failure never report logout success or expose content', async () => {
  for (const result of [{ status: 200, body: '' }, { status: 302, body: hint }, { status: 401, body: hint },
    { status: 503, body: hint }, { status: 204, body: 'unexpected' }, new Error(hint)]) {
    await assert.rejects(endWalletBrokerSession(async () => { if (result instanceof Error) throw result; return result; }, config, hint),
      error => error.code === 'account_logout_pending' && !error.message.includes(hint));
  }
});
test('foreign issuer/client and invalid or oversized ID hints never reach transport', async () => {
  for (const [context, token] of [[{ ...config, issuer: 'https://evil.example' }, hint],
    [{ ...config, clientId: 'opago-dashboard' }, hint], [config, 'invalid'], [config, 'a'.repeat(16385) + '.b.c']]) {
    await assert.rejects(endWalletBrokerSession(async () => { assert.fail('unexpected request'); }, context, token),
      error => error.code === 'account_logout_pending');
  }
});
