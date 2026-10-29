'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { F3ContractTestBackend } = require('../lib/opago/test-adapter.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { inspectWalletBackend } = require('../lib/opago/backend-status.ts');
const { OpagoError } = require('../lib/opago/api.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];

async function fixture() {
  const backend = new F3ContractTestBackend(new MemoryPrivateStore(), randomUUID, 'regtest');
  const account = backend.createAccount(); await account.load();
  const credential = await backend.login.login(false);
  account.login.restore = async () => credential;
  return { backend, account, credential };
}

test('inspection restores browser login and reads the account without proving ownership or binding', async () => {
  const { backend, account } = await fixture();
  assert.match(await inspectWalletBackend(account), /Account verified/);
  assert.ok(account.state.account);
  assert.equal(account.state.session, null);
  assert.deepEqual(backend.calls.map(c => [c.method, c.path]), [['GET', '/api/v2/account']]);
});

test('missing broker session clears stale local authority without making a backend request', async () => {
  const { backend, account } = await fixture();
  await account.signIn(); await account.proveOwnership(); await account.bind();
  account.login.restore = async () => null;
  const before = backend.calls.length;
  assert.equal(await inspectWalletBackend(account), 'Please sign in again.');
  assert.equal(backend.calls.length, before);
  assert.equal(account.state.credential, null); assert.equal(account.state.account, null);
  assert.equal(account.state.session, null); assert.equal(account.state.wallet, null);
});

test('inspection confirms binding only after fresh authenticated account and wallet responses', async () => {
  const { backend, account } = await fixture();
  await account.signIn(); await account.proveOwnership(); await account.bind();
  const before = backend.calls.length;
  assert.equal(await inspectWalletBackend(account), 'OPAGO wallet binding returned an account-linked wallet.');
  assert.deepEqual(backend.calls.slice(before).map(c => [c.method, c.path]), [['GET', '/api/v2/account'], ['GET', '/api/v2/wallet/me']]);
});

test('outage cannot leave a cached binding looking freshly verified', async () => {
  const { backend, account } = await fixture();
  await account.signIn(); await account.proveOwnership(); await account.bind();
  backend.request = async () => { throw new OpagoError('upstream_unavailable', true, 503); };
  await assert.rejects(inspectWalletBackend(account), /upstream_unavailable/);
  assert.equal(account.state.account, null); assert.equal(account.state.wallet, null);
  assert.equal(account.walletStateCurrent(), false);
});

for (const operation of ['refreshAccount', 'refresh']) test(`failed ${operation} revokes the previous binding confirmation`, async () => {
  const { backend, account } = await fixture();
  await account.signIn(); await account.proveOwnership(); await account.bind();
  assert.equal(account.walletStateCurrent(), true);
  backend.request = async () => { throw new OpagoError('upstream_unavailable', true, 503); };
  await assert.rejects(account[operation](), /upstream_unavailable/);
  assert.equal(account.walletStateCurrent(), false);
  if (operation === 'refreshAccount') assert.equal(account.state.account, null);
});

test('a restored foreign account cannot inherit an existing wallet session', async () => {
  const { backend, account, credential } = await fixture();
  await account.signIn(); await account.proveOwnership(); await account.bind();
  const before = backend.calls.length;
  account.login.restore = async () => ({ ...credential, subject: randomUUID() });
  await assert.rejects(inspectWalletBackend(account), /account_mismatch/);
  assert.equal(backend.calls.length, before); assert.equal(account.state.wallet, null);
});

test('logout while the broker restore is pending fences its delayed result', async () => {
  const { account, credential } = await fixture();
  let finish;
  account.login.restore = () => new Promise(resolve => { finish = resolve; });
  const inspecting = inspectWalletBackend(account);
  await account.signOut(); finish(credential);
  await assert.rejects(inspecting, /account_mismatch/);
  assert.equal(account.state.account, null); assert.equal(account.state.credential, null);
});
