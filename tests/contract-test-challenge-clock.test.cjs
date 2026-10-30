'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const existingModules = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { F3ContractTestBackend } = require('../lib/opago/test-adapter.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { walletAuthChallengeDigest } = require('../lib/wallet-auth-proof.ts');
for (const name of Object.keys(require.cache)) if (name.endsWith('.ts') && !existingModules.has(name)) delete require.cache[name];
for (const steps of [[999, 999, 1000], [999, 1000, 1000]]) {
  test(`contract-test challenge uses one clock instant across a second boundary (${steps.join(',')})`, async () => {
    const base = Date.UTC(2026, 9, 30); let calls = 0;
    const backend = new F3ContractTestBackend(new MemoryPrivateStore(), randomUUID, 'regtest', () => base + steps[Math.min(calls++, steps.length - 1)]);
    const intent = { action: 'login', action_params: {} };
    const response = await backend.request({ method: 'POST', path: '/api/v2/wallet/auth/challenge', auth: 'none', idempotencyKey: randomUUID(),
      body: { ...intent, network: 'regtest', wallet_pubkey: backend.identity.publicKey } });
    assert.equal(response.status, 200);
    const challenge = response.body;
    const lines = challenge.message.split('\n');
    assert.equal(lines[6], 'expires_at: ' + challenge.expires_at);
    assert.equal(Date.parse(challenge.expires_at) - Date.parse(lines[5].slice('issued_at: '.length)), 300_000);
    assert.doesNotThrow(() => walletAuthChallengeDigest(challenge, intent, 'regtest', Buffer.from(backend.identity.publicKey, 'hex'), base + 1000));
    assert.equal(calls, 1);
  });
}
