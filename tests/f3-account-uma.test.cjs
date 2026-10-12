'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const existingModules = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { randomUUID } = require('node:crypto');
const { F3ContractTestBackend } = require('../lib/opago/test-adapter.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { OpagoApi } = require('../lib/opago/api.ts');
const { OpagoAccount, photoMatchReady } = require('../lib/opago/account.ts');
const { activeLightningAddress } = require('../lib/opago/address.ts');
const { UmaSending, validateUmaInvoice } = require('../lib/opago/uma.ts');
const { decodeLightningInvoice } = require('../lib/lightning.ts');
const { appConfig } = require('../lib/config.ts');
const { assertContract } = require('../lib/opago/contract.ts');
const { invoice } = require('./lightning-invoice-fixture.cjs');
const { OpagoError } = require('../lib/opago/api.ts');
// The existing aggregate runner shares one module cache. Keep this suite's captured
// dependencies without preloading the configuration used by later Hedera/HTTP suites.
for (const name of Object.keys(require.cache)) if (name.endsWith('.ts') && !existingModules.has(name)) delete require.cache[name];
const copy = value => JSON.parse(JSON.stringify(value));
async function fixture(ready = true) {
  let now = Date.now();
  const store = new MemoryPrivateStore();
  const backend = new F3ContractTestBackend(store, randomUUID, appConfig.isMainnet ? 'mainnet' : 'regtest', () => now);
  const account = backend.createAccount(); await account.load();
  if (ready) { await account.proveOwnership(); await account.signIn(); await account.bind();
    await backend.setKya('approved'); await account.refresh(); await account.address('set', 'alice-test'); }
  const uma = new UmaSending(account, backend.disclosure, backend.peer, decodeLightningInvoice); await uma.load();
  return { backend, account, uma, store, advance(ms) { now += ms; } };
}
async function review(uma) { await uma.reviewDisclosure('$alice@receiver.example', 100, 10); }
async function prepare(uma) { await uma.consentAndPrepare(uma.payment.disclosure.id, async () => 2); }

async function personalAddress() {
  const f = await fixture(false);
  await f.account.signIn(); await f.account.proveOwnership(); await f.account.bind();
  await f.account.address('set', 'alice-test');
  assert.equal(f.account.state.wallet.photo_match, null);
  return f;
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('MVP personal address: no photo for rename, deactivate, restart and explicit restore/reactivation', async () => {
  const { backend, account, store } = await personalAddress();
  await account.address('rename', 'alice-new'); assert.equal(activeLightningAddress(account).address, 'alice-new@opago.com');
  await account.address('deactivate'); assert.equal(activeLightningAddress(account), null);
  await account.address('reactivate'); assert.ok(activeLightningAddress(account));
  const restarted = backend.createAccount(); await restarted.load(); assert.equal(activeLightningAddress(restarted), null);
  await restarted.refreshAfterLoad(); assert.ok(activeLightningAddress(restarted));
  await restarted.close(); assert.equal(activeLightningAddress(restarted), null);
  const restored = new OpagoAccount(new OpagoApi(backend), store, backend.identity, backend.login, randomUUID, account.now);
  await restored.load(); await restored.signIn(true); await restored.restore(); assert.equal(activeLightningAddress(restored), null);
  await restored.address('reactivate'); assert.equal(activeLightningAddress(restored).address, 'alice-new@opago.com');
  assert.equal(restored.state.account.identification_status, 'unidentified');
  assert.equal(restored.state.wallet.photo_match, null);
});

test('MVP personal address: account, wallet, custody, scope, expiry and state remain mandatory', async () => {
  for (const change of [
    a => { a.state.credential = null; }, a => { a.state.credential.expiresAt = 0; },
    a => { a.state.account = null; }, a => { a.state.account.email_verified = false; },
    a => { a.state.account.party_id = randomUUID(); }, a => { a.state.session.scope = 'onboarding'; },
    a => { a.state.session.wallet_id = randomUUID(); }, a => { a.state.session.access_expires_at = '2000-01-01T00:00:00Z'; },
    a => { a.state.session = { ...a.state.session, access_token: 'replacement-session' }; },
    a => { a.state.wallet.party_id = null; }, a => { a.state.wallet.custodial = true; },
    a => { a.state.wallet.wallet_pubkey = '02' + '99'.repeat(32); },
    a => { a.state.wallet.status = 'closed'; }, a => { a.state.wallet.address.status = 'deactivated'; },
    a => { a.state.wallet.address.status = 'pending_kyc'; }, a => { a.state.wallet.address.status = 'inactive'; },
  ]) { const { account } = await personalAddress(); change(account); assert.equal(activeLightningAddress(account), null); }
  const { account, backend } = await fixture(false); await account.signIn(); await account.proveOwnership();
  await assert.rejects(account.address('set', 'alice-test'), /wallet_binding_required/);
  assert.equal(backend.calls.some(c => c.path === '/api/v2/wallet/address'), false);
});

test('MVP personal address: successful write stays hidden until matching wallet readback', async () => {
  for (const mode of ['lost', 'unconfirmed', 'wrong-wallet', 'pending']) {
    const { backend, account } = await personalAddress();
    const request = backend.request.bind(backend); let written = false;
    backend.request = async req => {
      const result = await request(req);
      if (req.path === '/api/v2/wallet/address') written = true;
      if (written && req.path === '/api/v2/wallet/me') {
        assert.equal(activeLightningAddress(account), null);
        if (mode === 'lost') throw new Error('Synthetic readback loss');
        if (mode === 'unconfirmed') result.body.address.name = 'old-name';
        if (mode === 'wrong-wallet') result.body.wallet_id = randomUUID();
        if (mode === 'pending') result.body.address.status = 'pending_kyc';
      }
      return result;
    };
    await assert.rejects(account.address('rename', 'new-name'));
    assert.equal(activeLightningAddress(account), null); assert.equal(account.hasPendingAddressOperation, true);
    backend.request = request; await account.resumeAddress();
    assert.equal(activeLightningAddress(account).name, 'new-name');
    assert.equal(backend.calls.filter(c => c.path === '/api/v2/wallet/address' && c.body.name === 'new-name').length, 1);
  }
});

test('MVP personal address: delayed wallet status cannot cross account/session/wallet changes or logout', async () => {
  for (const mode of ['account', 'session', 'wallet', 'logout']) {
    const { backend, account } = await personalAddress();
    const request = backend.request.bind(backend), entered = deferred(), release = deferred();
    backend.request = async req => { const result = await request(req); if (req.path === '/api/v2/wallet/me') { entered.resolve(); await release.promise; } return result; };
    const pending = account.refresh(); const rejected = assert.rejects(pending, /account_mismatch/); await entered.promise;
    if (mode === 'account') account.state.credential = { ...account.state.credential, subject: 'other-account' };
    if (mode === 'session') account.state.session = { ...account.state.session, access_token: 'other-session' };
    if (mode === 'wallet') account.identity.publicKey = '02' + '11'.repeat(32);
    if (mode === 'logout') await account.signOut();
    release.resolve(); await rejected; assert.equal(activeLightningAddress(account), null);
  }
});

test('MVP personal address: an older read cannot override a newer deactivated address', async () => {
  const { backend, account } = await personalAddress();
  const request = backend.request.bind(backend), entered = deferred(), release = deferred(); let first = true;
  backend.request = async req => { const result = await request(req); if (req.path === '/api/v2/wallet/me' && first) { first = false; entered.resolve(); await release.promise; } return result; };
  const pending = account.refresh(), rejected = assert.rejects(pending, /address_changed/); await entered.promise;
  backend.state.wallet.address.status = 'deactivated'; await account.refresh(); release.resolve(); await rejected;
  assert.equal(account.state.wallet.address.status, 'deactivated'); assert.equal(activeLightningAddress(account), null);
});

test('MVP personal address: backend locks, revoked sessions, name conflicts and rename rules are not bypassed', async () => {
  for (const code of ['account_locked', 'session_revoked', 'name_taken', 'name_reserved', 'rename_limit_reached', 'rename_rate_limited', 'kyc_required']) {
    const { backend, account } = await personalAddress(); const request = backend.request.bind(backend);
    backend.request = async req => { if (req.path === '/api/v2/wallet/address') throw new OpagoError(code, false, code === 'rename_rate_limited' ? 429 : 403, 60); return request(req); };
    await assert.rejects(account.address('rename', 'another-name'), e => e.code === code);
    assert.equal(activeLightningAddress(account), null);
    assert.equal(backend.state.wallet.address.name, 'alice-test');
  }
});

test('F3: no-photo address requires account, ownership, binding and confirmed backend activation', async () => {
  const { backend, account } = await fixture(false);
  assert.equal(account.state.session, null);
  await account.signIn(); assert.equal(account.state.wallet, null); assert.equal(account.state.session, null);
  await account.proveOwnership(); assert.equal(account.state.wallet.status, 'unbound'); assert.equal(account.state.session.scope, 'onboarding');
  assert.equal(activeLightningAddress(account), null);
  await account.bind(); assert.equal(account.state.wallet.party_id, account.state.account.party_id); assert.equal(account.state.session.scope, 'wallet');
  await account.address('set', 'alice-test');
  assert.equal(account.state.wallet.photo_match, null);
  assert.equal(activeLightningAddress(account).address, 'alice-test@opago.com');
  for (const status of ['draft', 'submitted', 'in_review', 'correction_requested', 'rejected']) {
    await backend.setKya(status); await account.refresh(); assert.equal(photoMatchReady(account.state.wallet), false);
  }
  await backend.setKya('approved'); await account.refresh(); await account.address('set', 'alice-test');
  assert.equal(account.state.account.identification_status, 'unidentified');
  assert.equal(account.state.wallet.photo_match.assurance, 'photo_data_match_only');
  assert.equal(activeLightningAddress(account).address, 'alice-test@opago.com');
  backend.state.wallet.address.status = 'pending_kyc'; await account.refresh(); assert.equal(activeLightningAddress(account), null);
});

test('F3: four UMA steps require consent, bind exact peer bytes, and separate confirmation', async () => {
  const { backend, account, uma } = await fixture();
  await review(uma); assert.equal(backend.peerCalls, 0); assert.equal(uma.payment.consented, false);
  assert.equal(uma.payment.disclosure.kycStatus, 'NOT_VERIFIED');
  await assert.rejects(uma.confirm(async () => 'paid'), /Confirm/);
  await prepare(uma); assert.equal(uma.payment.phase, 'review'); assert.equal(backend.peerCalls, 2);
  const routes = backend.calls.filter(c => c.path.includes('/travel-rule/')).map(c => c.path.split('/').at(-1));
  assert.deepEqual(routes, ['uma-discovery', 'verify', 'uma-pay-request', 'uma-pay-response']);
  assert.equal(uma.payment.invoice.amountSats, 100); assert.equal(uma.payment.feeSats, 2);
  let payments = 0;
  const pay = async (_p, dispatch) => { await dispatch(); payments++; return 'synthetic-confirmed'; };
  const results = await Promise.allSettled([uma.confirm(pay), uma.confirm(pay)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(payments, 1);
  assert.equal(uma.payment.phase, 'confirmed'); await assert.rejects(uma.confirm(pay));
  await review(uma); await prepare(uma); assert.equal(backend.peerCalls, 4);
  assert.equal(account.state.account.identification_status, 'unidentified');
});

test('F3: wrong account/wallet binding and wrong proof scopes never change local ownership', async () => {
  const { backend, account } = await fixture(false);
  await account.signIn(); await account.proveOwnership();
  const original = backend.request.bind(backend);
  backend.request = async req => {
    const result = await original(req);
    if (req.path.endsWith('/auth/verify') && result.body.kind === 'proof') result.body.wallet_id = randomUUID();
    return result;
  };
  await assert.rejects(account.bind(), /account_mismatch/); assert.equal(account.state.wallet.party_id, null);
  assert.equal(backend.calls.filter(c => c.path === '/api/v2/account/wallets').length, 0);
});

test('F3: session refresh preserves a lost mutation idempotency key across app restart', async () => {
  const { backend, account, store, advance } = await fixture();
  advance(901_000);
  const original = backend.request.bind(backend); let dropped = false;
  backend.request = async req => {
    const response = await original(req);
    if (req.path.endsWith('/address/deactivate') && !dropped) { dropped = true; throw new Error('synthetic lost response after commit'); }
    return response;
  };
  await assert.rejects(account.address('deactivate'), /lost response/);
  const first = backend.calls.find(c => c.path.endsWith('/address/deactivate'));
  const restored = new OpagoAccount(new OpagoApi(backend), store, backend.identity, backend.login, randomUUID, account.now);
  await restored.load(); assert.equal(activeLightningAddress(restored), null);
  await restored.address('deactivate');
  const calls = backend.calls.filter(c => c.path.endsWith('/address/deactivate'));
  assert.equal(calls.length, 2); assert.equal(calls[1].idempotencyKey, first.idempotencyKey);
  assert.equal(backend.calls.filter(c => c.path.endsWith('/auth/refresh')).length, 1);
  assert.equal(restored.state.wallet.address.status, 'deactivated');
});

test('F3: activated address needs a fresh owner-bound snapshot and canonical QR', async () => {
  const { backend, account, advance } = await fixture();
  assert.ok(activeLightningAddress(account)); advance(60_001); assert.equal(activeLightningAddress(account), null);
  await account.refresh(); backend.state.wallet.wallet_pubkey = '03' + '08'.repeat(32);
  await assert.rejects(account.refresh(), /account_mismatch/); assert.equal(activeLightningAddress(account), null);
  account.state.wallet.address.qr_payload = 'lightning:bad'; assert.equal(activeLightningAddress(account), null);
});

test('F3: invoice amount, network, hash, description binding, expiry and exchange are checked locally', async () => {
  const { account, uma } = await fixture(); await review(uma); await prepare(uma);
  const response = uma.payment.response;
  const expected = { exchangeId: response.exchange_id, amountMsat: 100_000, network: account.identity.network, now: account.now() };
  for (const changed of [ { amount_msat: 101_000 }, { network: expected.network === 'regtest' ? 'mainnet' : 'regtest' },
    { payment_hash: '08'.repeat(32) }, { invoice_description_hash: '09'.repeat(32) }, { expires_at: new Date(account.now() - 1).toISOString() },
    { exchange_id: randomUUID() }, { bolt11: response.bolt11.slice(0, -1) + (response.bolt11.endsWith('q') ? 'p' : 'q') },
    { bolt11: invoice(101, Math.floor(account.now() / 1000), { descriptionHash: response.invoice_description_hash, paymentHash: response.payment_hash }) } ]) {
    assert.throws(() => validateUmaInvoice({ ...response, ...changed }, expected, decodeLightningInvoice));
  }
});

test('F3: invalid peer, unsupported UMA, missing data, fee changes and no active address fail without fallback', async () => {
  for (const mutation of [body => { body.travel_rule_exchange = 'failed'; body.bolt11 = null; body.failure_code = 'signature_invalid'; },
    body => { body.payment_hash = '10'.repeat(32); }, body => { body.amount_msat = 101_000; }, body => { body.network = 'other'; }]) {
    const { backend, uma } = await fixture(); const original = backend.request.bind(backend);
    backend.request = async req => { const result = await original(req); if (req.path.endsWith('/uma-pay-response')) mutation(result.body); return result; };
    await review(uma); await assert.rejects(prepare(uma)); assert.notEqual(uma.payment.phase, 'review');
    assert.equal(backend.calls.some(c => c.path.includes('/lnurl')), false);
  }
  const f = await fixture(); await review(f.uma);
  await assert.rejects(f.uma.consentAndPrepare(f.uma.payment.disclosure.id, async () => 11), /fee/);
  await f.uma.cancel(); f.backend.state.wallet.address.status = 'pending_kyc';
  await assert.rejects(review(f.uma), /address_pending_kyc/);
});

test('F3: retry preserves exact remote response, request ID and backend operation', async () => {
  const { backend, uma } = await fixture(); const original = backend.request.bind(backend); let lost = false;
  backend.request = async req => { const result = await original(req); if (req.path.endsWith('/uma-pay-response') && !lost) {
    lost = true; throw new Error('Synthetic response lost'); } return result; };
  await review(uma); await assert.rejects(prepare(uma));
  const before = copy(uma.payment); await prepare(uma);
  assert.equal(backend.peerCalls, 2);
  const calls = backend.calls.filter(c => c.path.endsWith('/uma-pay-response'));
  assert.deepEqual(calls[0].body, calls[1].body); assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.equal(uma.payment.request.request_id, before.request.request_id);
});

test('F3: cancellation before consent and during discovery prevents subsequent data transfer or payment', async () => {
  const f = await fixture(); await review(f.uma); await f.uma.cancel();
  await assert.rejects(prepare(f.uma)); assert.equal(f.backend.peerCalls, 0);
  await review(f.uma);
  let finish; const peer = f.backend.peer.send;
  f.backend.peer.send = async req => new Promise(resolve => { finish = async () => resolve(await peer(req)); });
  const preparing = prepare(f.uma);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await f.uma.cancel(); await finish(); await assert.rejects(preparing, /cancelled/);
  assert.equal(f.backend.calls.some(c => c.path.endsWith('/uma-pay-request')), false);
});

test('F3: unknown payment survives process loss and cannot be submitted twice', async () => {
  const { account, backend, uma } = await fixture(); await review(uma); await prepare(uma); let count = 0;
  await assert.rejects(uma.confirm(async (_p, dispatch) => { await dispatch(); count++; throw new Error('Synthetic unknown Spark outcome'); }));
  assert.equal(uma.payment.phase, 'pending'); await assert.rejects(uma.cancel());
  const restored = new UmaSending(account, backend.disclosure, backend.peer, decodeLightningInvoice); await restored.load();
  await assert.rejects(restored.confirm(async () => { count++; return 'paid'; }));
  await restored.reconcile(async () => 'pending'); assert.equal(restored.payment.phase, 'pending');
  await restored.reconcile(async () => 'confirmed'); assert.equal(restored.payment.phase, 'confirmed'); assert.equal(count, 1);
});

test('F3: restore uses owning account and seed proof, with separate address reactivation', async () => {
  const { backend, account, store } = await fixture(); await account.close(); assert.equal(account.state.session, null);
  const restored = new OpagoAccount(new OpagoApi(backend), store, backend.identity, backend.login, randomUUID, account.now);
  await restored.load(); await restored.signIn(true); await restored.restore();
  assert.equal(restored.state.session.scope, 'wallet'); assert.equal(restored.state.wallet.address.status, 'deactivated');
  assert.equal(activeLightningAddress(restored), null); await restored.address('reactivate'); assert.ok(activeLightningAddress(restored));
  const challenge = backend.calls.find(c => c.path.endsWith('/auth/challenge') && c.body.action === 'wallet_restore');
  assert.equal(challenge.auth, 'account'); assert.equal(challenge.body.action_params.party_id, account.state.account.party_id);
});

test('F3: deletion works with zero wallets; tombstone prevents reactivation and receipt supports new onboarding', async () => {
  const empty = await fixture(false); await empty.account.signIn(true); await empty.account.deleteAccount();
  assert.equal(empty.backend.state.account.wallets.length, 0); assert.ok(empty.account.state.deletion);
  await empty.account.deletionStatus(); assert.equal(empty.account.state.deletionStatus.status, 'deletion_pending');
  await assert.rejects(empty.account.restartOnboarding(), /account_deleted/);
  const f = await fixture(); const oldName = f.account.state.wallet.address.address;
  await f.account.deleteAccount(); await f.backend.setKya('approved');
  assert.equal(f.account.state.wallet, null); assert.equal(f.account.state.session, null); assert.equal(activeLightningAddress(f.account), null);
  await assert.rejects(f.account.address('reactivate'), /account_deleted/);
  f.backend.state.deleted = true; await f.account.deletionStatus(); assert.equal(f.account.state.deletionStatus.retained_data, true);
  await f.account.restartOnboarding(); assert.equal(f.account.state.session.scope, 'onboarding');
  assert.equal(f.account.state.wallet.address, null); assert.equal(f.account.state.wallet.photo_match, null);
  assert.ok(oldName); assert.equal(f.account.state.wallet.party_id, null);
});

test('F3: strict shared schemas reject untrusted success, additional fields and malformed counterresponses', async () => {
  const f = await fixture(); const original = f.backend.request.bind(f.backend);
  f.backend.request = async req => ({ ...await original(req), authenticated: false });
  await assert.rejects(f.account.refresh(), /Unauthenticated/);
  assert.throws(() => assertContract('Wallet', { ...f.backend.state.wallet, identified: true }));
  assert.throws(() => assertContract('UmaPayResponseOutput', {}));
});

test('F3: a newer pending/rejected KYA revision preserves the previous active approval', async () => {
  const { backend, account, uma } = await fixture();
  const approvedRevision = account.state.wallet.photo_match.active_approval_revision;
  for (const status of ['in_review', 'correction_requested', 'rejected']) {
    await backend.setKya(status); await account.refresh();
    assert.equal(account.state.wallet.photo_match.active_approval_revision, approvedRevision);
    assert.ok(account.state.wallet.photo_match.revision > approvedRevision);
    assert.ok(photoMatchReady(account.state.wallet)); assert.ok(activeLightningAddress(account));
  }
  await review(uma); assert.equal(uma.payment.disclosure.kycStatus, 'NOT_VERIFIED');
});

test('F3: expired refresh after process restart leaves explicit sign-in and ownership recovery accessible', async () => {
  const { backend, account, store, advance } = await fixture(); advance(31 * 86400_000);
  const restored = new OpagoAccount(new OpagoApi(backend), store, backend.identity, backend.login, randomUUID, account.now);
  await restored.load(); const failure = await restored.refreshAfterLoad();
  assert.equal(failure.code, 'refresh_invalid'); assert.equal(activeLightningAddress(restored), null);
  await restored.signIn(true); await restored.proveOwnership(); assert.ok(activeLightningAddress(restored));
});

test('F3: proof cancelled before signing can renew an expired challenge without repeating verification', async () => {
  const { backend, account, advance } = await fixture(false);
  const sign = backend.identity.sign; let rejected = true;
  backend.identity.sign = async (...args) => { if (rejected) { rejected = false; throw new Error('Device approval cancelled'); } return sign(...args); };
  await assert.rejects(account.proveOwnership(), /cancelled/); advance(301_000);
  await account.proveOwnership();
  assert.equal(backend.calls.filter(c => c.path.endsWith('/auth/challenge')).length, 2);
  assert.equal(backend.calls.filter(c => c.path.endsWith('/auth/verify')).length, 1);
});

test('F3: unsupported UMA and non-consented targets fail before the identity-bearing POST', async () => {
  for (const [route, change] of [
    ['/uma-discovery', body => { body.request.url = body.request.url.replace('$alice', '$someone-else'); }],
    ['/verify', body => { body.status = 'lnurl_only'; }],
    ['/verify', body => { body.callback = 'https://other-provider.example/callback'; }],
    ['/verify', body => { body.metadata = JSON.stringify([['text/identifier', '$someone-else@receiver.example']]); }],
  ]) {
    const { backend, uma } = await fixture(); const original = backend.request.bind(backend);
    backend.request = async req => { const result = await original(req); if (req.path.endsWith(route)) change(result.body); return result; };
    await review(uma); await assert.rejects(prepare(uma));
    assert.equal(backend.calls.some(c => c.path.endsWith('/uma-pay-request')), false);
    assert.equal(backend.calls.some(c => c.path.includes('/lnurl')), false);
  }
  const { backend, uma } = await fixture(); const disclosure = backend.disclosure.review;
  backend.disclosure.review = async (...args) => ({ ...await disclosure(...args), providers: [] });
  await assert.rejects(review(uma), /disclosure/); assert.equal(backend.peerCalls, 0);
});

test('F3: a lost mutation survives both app and test-backend restarts with identical key and input', async () => {
  const { backend, account, store } = await fixture(); const original = backend.request.bind(backend);
  backend.request = async req => { const result = await original(req); if (req.path.endsWith('/address/deactivate')) throw new Error('Lost response'); return result; };
  await assert.rejects(account.address('deactivate'), /Lost/);
  const prior = backend.calls.find(c => c.path.endsWith('/address/deactivate'));
  const next = new F3ContractTestBackend(store, randomUUID, backend.network, account.now); await next.load();
  const restored = next.createAccount(); await restored.load(); await restored.address('deactivate');
  const recovered = next.calls.find(c => c.path.endsWith('/address/deactivate'));
  assert.equal(recovered.idempotencyKey, prior.idempotencyKey); assert.deepEqual(recovered.body, prior.body);
  assert.equal(restored.state.wallet.address.status, 'deactivated');
});

test('F3: cancelled device payment approval does not dispatch and can be explicitly retried', async () => {
  const { uma } = await fixture(); await review(uma); await prepare(uma); let dispatched = 0;
  await assert.rejects(uma.confirm(async () => { throw new Error('Payment approval cancelled'); }), /cancelled/);
  assert.equal(uma.payment.phase, 'review');
  await uma.confirm(async (_payment, dispatch) => { await dispatch(); dispatched++; return 'synthetic-confirmed'; });
  assert.equal(dispatched, 1); assert.equal(uma.payment.phase, 'confirmed');
});

test('F3: a lost initial activation resumes its original action even after the backend has made the address active', async () => {
  const { backend, account, store } = await fixture(); await account.address('deactivate');
  backend.state.wallet.address = null; await account.refresh();
  const original = backend.request.bind(backend); let lost = false;
  backend.request = async req => { const result = await original(req); if (req.path === '/api/v2/wallet/address' && !lost) {
    lost = true; throw new Error('Lost activation response'); } return result; };
  await assert.rejects(account.address('set', 'restored-test'), /Lost/);
  const restored = new OpagoAccount(new OpagoApi(backend), store, backend.identity, backend.login, randomUUID, account.now);
  await restored.load(); assert.equal(restored.hasPendingAddressOperation, true); await restored.refresh();
  assert.equal(restored.state.wallet.address.status, 'active');
  await assert.rejects(restored.address('rename', 'another-test'), /operation_conflict/);
  await restored.resumeAddress(); assert.equal(restored.hasPendingAddressOperation, false);
  assert.equal(restored.state.wallet.address.name, 'restored-test');
  const calls = backend.calls.filter(c => c.path === '/api/v2/wallet/address' && c.body.name === 'restored-test');
  assert.equal(calls.length, 2); assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
});

test('F3: account sign-in and deletion do not require a connected Spark wallet or wallet signature', async () => {
  const { backend, store } = await fixture(false);
  const identity = { publicKey: '', network: backend.network, available: false, sign: async () => { throw new Error('Signing must never be requested'); } };
  const account = new OpagoAccount(new OpagoApi(backend), store, identity, backend.login, randomUUID);
  await account.load(); await account.signIn(true); assert.equal(account.walletAvailable, false);
  await assert.rejects(account.proveOwnership(), /wallet_unavailable/);
  await account.deleteAccount(); assert.ok(account.state.deletion); assert.equal(account.state.session, null);
  assert.equal(backend.calls.some(c => c.path.endsWith('/auth/challenge')), false);
});
