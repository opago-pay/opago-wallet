'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { hookFixture } = require('./react-hooks-fixture.cjs');
require('./register-typescript.cjs');
const { OpagoError } = require('../lib/opago/api.ts');

function nativeRuntime(t, options = {}) {
  let finishApproval, finishResponse;
  const calls = [];
  class Account {
    constructor(api, _store, identity) { this.api = api; this.identity = identity; this.state = {}; }
    async load() {}
    async refreshAfterLoad() {}
    async exclusive(action) { return action(); }
  }
  class Service { async load() {} }
  const module = hookFixture('lib/opago/runtime-native.ts', () => ({
    'expo-crypto': { randomUUID }, './api': { OpagoApi: class { constructor(transport) { this.transport = transport; } }, OpagoError },
    './account': { OpagoAccount: Account }, './uma': { UmaSending: Service }, './pos-link': { PosLinking: Service },
    './pos-qr-native': { installPosQrSource() {} }, '../config': { appConfig: { isMainnet: false } },
    './settings-native': { nativeF3Enabled: () => true },
    './bootstrap-native': { createNativeF3Integration: async () => ({
      hka: { mode: 'hka', request: async request => {
        calls.push(request.path);
        if (options.deferRequest) return new Promise(resolve => { finishResponse = resolve; });
        return {};
      } }, accountLogin: { mode: 'oidc' }, publicAddressOrigin: 'https://opago.com',
    }) },
    '../device-authentication': { authorizeWalletAction: async () => {
      calls.push('biometric'); return new Promise(resolve => { finishApproval = () => resolve(() => {}); });
    } },
    '../wallet-session': { walletSession: { subscribe() {}, captureRuntime: () => () => {} } },
  }), exports => exports);
  t.after(module.unmount);
  const wallet = { getIdentityPublicKey: async () => '02' + '11'.repeat(32),
    signOpagoWalletChallenge: async () => { calls.push('sign'); return {}; } };
  return { get: () => module.render().getF3Runtime(wallet, 'key'), calls,
    finishApproval: () => finishApproval(), finishResponse: () => finishResponse({}) };
}

test('blur during biometric approval stops signing and later backend mutation', async t => {
  const f = nativeRuntime(t), runtime = await f.get(); let focused = true;
  const guard = () => { if (!focused) throw new OpagoError('operation_cancelled'); };
  const pending = runtime.perform(async () => {
    await runtime.account.identity.sign({}, { action: 'wallet_bind' }, 'installation');
    await runtime.account.api.transport.request({ path: 'bind' });
  }, guard);
  const rejected = assert.rejects(pending, /operation_cancelled/);
  assert.deepEqual(f.calls, ['biometric']); focused = false; f.finishApproval(); await rejected;
  assert.deepEqual(f.calls, ['biometric']);
});

test('blur after dispatched proof prevents follow-up bind while preserving the dispatched request', async t => {
  const f = nativeRuntime(t, { deferRequest: true }), runtime = await f.get(); let focused = true;
  const pending = runtime.perform(async () => {
    await runtime.account.api.transport.request({ path: 'verify' });
    await runtime.account.api.transport.request({ path: 'bind' });
  }, () => { if (!focused) throw new OpagoError('operation_cancelled'); });
  const rejected = assert.rejects(pending, /operation_cancelled/);
  assert.deepEqual(f.calls, ['verify']); focused = false; f.finishResponse(); await rejected;
  assert.deepEqual(f.calls, ['verify']);
});

test('hook operation stays cancelled after blur and refocus even when runtime object is reused', async t => {
  let focused = true, finish, capturedGuard;
  const auth = { sparkWallet: {}, hederaPublicKey: 'key' };
  const runtime = { account: { state: {} }, perform: async (action, guard) => { capturedGuard = guard; guard?.(); await action(); guard?.(); } };
  const app = hookFixture('hooks/useOpagoAccount.ts', () => ({
    './useWalletAuth': { useWalletAuth: () => auth },
    '../lib/opago/runtime-native': { getF3Runtime: async () => runtime },
    '../lib/opago/backend-status': { inspectWalletBackend: async () => 'ready' },
    '../lib/opago/errors': { opagoUserError: () => 'cancelled' }, '../lib/opago/api': { OpagoError },
  }), exports => exports.useOpagoAccount(false, focused));
  t.after(app.unmount); await app.settle();
  const pending = app.render().run(() => new Promise(resolve => { finish = resolve; }));
  const oldGuard = capturedGuard;
  focused = false; await app.settle();
  assert.throws(oldGuard, /operation_cancelled/);
  focused = true; await app.settle();
  assert.equal(app.render().runtime, runtime); assert.throws(oldGuard, /operation_cancelled/);
  finish(); await pending;
});
