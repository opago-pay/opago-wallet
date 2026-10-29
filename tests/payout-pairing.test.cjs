'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { PayoutPairingFlow } = require('../lib/opago/payout-pairing.ts');
const { pairingQr, payoutBinding } = require('../lib/opago/payout-pairing-model.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const subject = '00000000-0000-4000-8000-000000000011';
const intentId = '00000000-0000-4000-8000-000000000012';
const key = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(identity = key) {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const state = { now, current: true, calls: [], proof: 'p'.repeat(43) };
  state.credential = { subject, authTime: now, expiresAt: now + 600_000, accessToken: 'synthetic-account-only' };
  state.qr = { version: 1, type: 'opago.payout-wallet-link', issuer: 'https://api.opago.com', intent_id: intentId, pairing_code: 'c'.repeat(43), expires_at: new Date(now + 300_000).toISOString().replace('.000Z','Z') };
  state.intent = { intent_id: intentId, account_subject: subject, binding_version: 4, replace: false, expires_at: state.qr.expires_at, status: 'pending' };
  state.binding = { account_subject: subject, binding_version: 4, wallet: null, incoming_enabled: false, outgoing_enabled: false, evidence_retention_years: 5 };
  state.wallet = { id: '00000000-0000-4000-8000-000000000013', identity_pubkey: key, network: 'regtest' };
  const ports = {
    async login() { state.calls.push('login'); return clone(state.credential); },
    async status() { state.calls.push('status'); return clone(state.binding); },
    async intent(_, id) { state.calls.push('intent'); assert.equal(id, intentId); return clone(state.intent); },
    async prove(context) { state.calls.push('prove'); state.context = context; return state.proof; },
    async confirm(_, qr, proof, revision) {
      state.calls.push('confirm'); assert.equal(qr.intent_id, intentId); assert.equal(proof, state.proof); assert.equal(revision, 4);
      return { ...state.binding, binding_version: revision + 1, wallet: state.wallet, incoming_enabled: true, outgoing_enabled: true };
    },
    async unlink(_, revision, operation) {
      state.calls.push('unlink'); assert.equal(revision, 4); assert.equal(operation, intentId);
      return { ...state.binding, binding_version: revision + 1, wallet: null, incoming_enabled: false, outgoing_enabled: false };
    },
    uuid: () => intentId,
    current() { if (!state.current) throw Error('locked'); },
  };
  const flow = new PayoutPairingFlow(ports, identity, 'regtest', () => state.now);
  const scan = () => flow.scan(JSON.stringify(state.qr));
  const linked = () => { state.binding.wallet = state.wallet; state.binding.incoming_enabled = state.binding.outgoing_enabled = true; };
  return { state, ports, flow, scan, linked };
}
test('scan is local, review precedes proof, and authoritative commit precedes success', async () => {
  const f = fixture(); f.scan(); assert.deepEqual(f.state.calls, []);
  await assert.rejects(f.flow.confirm(), /pairing_not_reviewed/);
  await f.flow.prepare(); assert.equal(f.flow.stage, 'review'); assert.equal(f.flow.paymentsAvailable, false);
  assert.deepEqual(f.state.calls, ['login','intent','status']);
  await f.flow.confirm(); assert.equal(f.flow.stage, 'linked'); assert.equal(f.flow.paymentsAvailable, true);
  assert.equal(f.state.context.qr.pairing_code, f.state.qr.pairing_code);
  assert.equal(f.state.context.intent.binding_version, 4); assert.equal(f.state.context.publicKey, key);
  assert.equal(f.state.context.network, 'regtest'); assert.equal(f.flow.qr, null);
});
test('unlink without replacement works with no Spark identity and never signs or recovers funds', async () => {
  const f = fixture(null); f.linked();
  await assert.rejects(f.flow.unlink(), /unlink_not_reviewed/);
  await f.flow.prepareUnlink(); assert.equal(f.flow.stage, 'unlink_review');
  await f.flow.unlink(); assert.deepEqual(f.state.calls, ['login','status','unlink']);
  assert.equal(f.flow.stage, 'unlinked'); assert.equal(f.flow.binding.wallet, null); assert.equal(f.flow.paymentsAvailable, false);
  assert.equal(f.flow.binding.evidence_retention_years, 5);
  f.scan(); await assert.rejects(f.flow.prepare(), /wallet_unavailable/);
});
test('new wallet can link after unlink; self-custodial keys/funds are never transferred', async () => {
  const f = fixture(); f.linked(); await f.flow.prepareUnlink(); await f.flow.unlink();
  f.state.binding = clone(f.flow.binding); f.state.intent.binding_version = 5;
  f.ports.confirm = async () => ({ ...f.state.binding, binding_version: 6, wallet: f.state.wallet, incoming_enabled: true, outgoing_enabled: true });
  f.scan(); await f.flow.prepare(); await f.flow.confirm(); assert.equal(f.flow.stage, 'linked');
});
for (const mutation of [
  v => { v.incoming_enabled = true; }, v => { v.outgoing_enabled = true; },
  v => { v.evidence_retention_years = 4; }, v => { v.account_subject = intentId; },
  v => { v.binding_version = -1; }, v => { v.extra = true; },
]) test('rejects inconsistent payment/retention/account snapshot ' + mutation.toString(), () => {
  const f = fixture(); mutation(f.state.binding); assert.throws(() => payoutBinding(f.state.binding, subject));
});
for (const change of [
  q => { q.issuer = 'https://attacker.invalid'; }, q => { q.type = 'pos'; },
  q => { q.expires_at = '2026-10-27T12:00:00Z'; }, q => { q.expires_at = '2026-10-27T12:05:01Z'; },
  q => { q.pairing_code = 'short'; }, q => { q.extra = 'ignored?'; },
]) test('QR rejects wrong authority, expiry or noncanonical fields ' + change.toString(), () => {
  const f = fixture(); change(f.state.qr); assert.throws(() => pairingQr(f.state.qr, f.state.now)); assert.deepEqual(f.state.calls, []);
});
test('duplicate JSON is refused without a network call', () => {
  const f = fixture(); assert.throws(() => f.flow.scan(JSON.stringify(f.state.qr).replace('"version":1','"version":1,"version":1')));
  assert.deepEqual(f.state.calls, []);
});
for (const [name, mutate, message] of [
  ['wrong account', f => { f.state.intent.account_subject = intentId; }, /account_mismatch/],
  ['expired', f => { f.state.intent.status = 'expired'; }, /pairing_expired/],
  ['bound', f => f.linked(), /wallet_already_linked/],
  ['revision changed', f => { f.state.binding.binding_version++; }, /revision_conflict/],
  ['stale login', f => { f.state.credential.authTime -= 300_001; }, /reproof_required/],
]) test('prepare stops before signing on ' + name, async () => {
  const f = fixture(); f.scan(); mutate(f); await assert.rejects(f.flow.prepare(), message);
  assert.equal(f.state.calls.includes('prove'), false); assert.equal(f.state.calls.includes('confirm'), false);
});
test('replace is explicit and a revision conflict does not fall back to unlink', async () => {
  const f = fixture(); f.linked(); f.state.intent.replace = true; f.scan(); await f.flow.prepare();
  f.ports.confirm = async () => { f.state.calls.push('confirm'); throw Error('revision_conflict'); };
  await assert.rejects(f.flow.confirm(), /revision_conflict/); assert.equal(f.state.calls.includes('unlink'), false);
});
test('lost confirm response stays uncertain; read-only reconciliation never retries', async () => {
  const f = fixture(); f.scan(); await f.flow.prepare();
  f.ports.confirm = async () => { f.state.calls.push('confirm'); throw Error('offline'); };
  await assert.rejects(f.flow.confirm(), /offline/); assert.equal(f.flow.stage, 'unknown'); assert.equal(f.flow.paymentsAvailable, false);
  await assert.rejects(f.flow.confirm(), /pairing_not_reviewed/); assert.throws(f.scan, /pairing_busy/);
  await assert.rejects(f.flow.prepareUnlink(), /pairing_outcome_unknown/);
  await f.flow.reconcile(); assert.equal(f.flow.stage, 'idle'); assert.equal(f.state.calls.filter(x => x === 'confirm').length, 1);
});
test('unlink timeout cannot silently enable payments or dispatch again', async () => {
  const f = fixture(null); f.linked(); await f.flow.prepareUnlink();
  f.ports.unlink = async () => { f.state.calls.push('unlink'); throw Error('offline'); };
  await assert.rejects(f.flow.unlink(), /offline/); assert.equal(f.flow.stage, 'unknown');
  await assert.rejects(f.flow.unlink(), /unlink_not_reviewed/); assert.equal(f.flow.paymentsAvailable, false);
});
for (const operation of ['confirm', 'unlink']) {
  for (const timing of ['after timeout', 'while dispatched', 'before late success']) test(`cancel ${timing} preserves uncertain ${operation} until read-only reconciliation`, async () => {
    const f = fixture();
    if (operation === 'confirm') { f.scan(); await f.flow.prepare(); }
    else { f.linked(); await f.flow.prepareUnlink(); }
    let finish;
    const original = f.ports[operation];
    f.ports[operation] = async () => {
      f.state.calls.push(operation);
      if (timing !== 'after timeout') return new Promise((resolve, reject) => { finish = { resolve, reject }; });
      throw Error('offline');
    };
    const pending = f.flow[operation]();
    const rejected = assert.rejects(pending);
    if (timing !== 'after timeout') {
      while (!finish) await Promise.resolve();
      f.flow.cancel();
      if (timing === 'while dispatched') finish.reject(Error('offline'));
      else {
        const result = operation === 'confirm'
          ? await original(f.state.credential, f.state.qr, f.state.proof, 4)
          : await original(f.state.credential, 4, intentId);
        f.state.calls.pop(); // The fixture constructs a response, not a second dispatch.
        finish.resolve(result);
      }
    }
    await rejected;
    f.flow.cancel(); f.flow.cancel();
    assert.equal(f.flow.stage, 'unknown');
    assert.equal(f.flow.credential, null); assert.equal(f.flow.qr, null); assert.equal(f.flow.binding, null);
    assert.equal(f.flow.paymentsAvailable, false);
    assert.throws(f.scan, /pairing_busy/);
    await assert.rejects(f.flow.prepare(), /pairing_outcome_unknown/);
    await assert.rejects(f.flow.prepareUnlink(), /pairing_outcome_unknown/);
    await assert.rejects(f.flow.confirm(), /pairing_not_reviewed/);
    await assert.rejects(f.flow.unlink(), /unlink_not_reviewed/);
    const calls = f.state.calls.slice();
    f.state.credential.subject = intentId;
    await assert.rejects(f.flow.reconcile(), /account_mismatch/);
    assert.equal(f.flow.stage, 'unknown');
    f.state.credential.subject = subject;
    await f.flow.reconcile();
    assert.equal(f.flow.stage, 'idle');
    assert.deepEqual(f.state.calls.slice(calls.length), ['login', 'login', 'status']);
    assert.equal(f.state.calls.filter(x => x === operation).length, 1);
  });
}
test('reconciliation cannot adopt another account', async () => {
  const f = fixture(); f.scan(); await f.flow.prepare(); f.ports.confirm = async () => { throw Error('offline'); };
  await assert.rejects(f.flow.confirm()); f.state.credential.subject = intentId;
  await assert.rejects(f.flow.reconcile(), /account_mismatch/); assert.equal(f.flow.stage, 'unknown');
});
for (const event of ['cancel','lock']) test('delayed proof after ' + event + ' cannot confirm', async () => {
  const f = fixture(); f.scan(); await f.flow.prepare(); let resolve;
  f.ports.prove = () => new Promise(r => { resolve = r; }); const pending = f.flow.confirm();
  if (event === 'cancel') f.flow.cancel(); else f.state.current = false;
  resolve('p'.repeat(43)); await assert.rejects(pending); assert.equal(f.state.calls.includes('confirm'), false);
});
test('QR expiring during proof cannot confirm', async () => {
  const f = fixture(); f.scan(); await f.flow.prepare();
  f.ports.prove = async () => { f.state.now += 300_000; return f.state.proof; };
  await assert.rejects(f.flow.confirm(), /pairing_expired/); assert.equal(f.state.calls.includes('confirm'), false);
});
test('unlink confirmation expires with original login and uses reviewed version only', async () => {
  const f = fixture(null); f.linked(); await f.flow.prepareUnlink(); f.state.now += 300_001;
  await assert.rejects(f.flow.unlink(), /reproof_required/); assert.equal(f.state.calls.includes('unlink'), false);
});
test('malformed or foreign committed wallet is not a successful link', async () => {
  const f = fixture(); f.scan(); await f.flow.prepare(); f.state.wallet.network = 'mainnet';
  await assert.rejects(f.flow.confirm(), /invalid_pairing_response/); assert.equal(f.flow.stage, 'unknown'); assert.equal(f.flow.paymentsAvailable, false);
});
test('binding decisions are translated in every supported locale, with five-year retention', () => {
  const { payoutBindingPolicy } = require('../lib/opago/payout-binding-policy.ts');
  const { translate } = require('../lib/i18n/index.ts');
  for (const language of ['de','fr','es','it']) {
    for (const message of Object.values(payoutBindingPolicy)) assert.notEqual(translate(language, message), message);
    assert.match(translate(language, payoutBindingPolicy.evidence), /5/);
  }
});
test('a failed second review cannot reuse the first account review', async () => {
  const f = fixture(); f.scan(); await f.flow.prepare(); f.state.intent.account_subject = intentId;
  await assert.rejects(f.flow.prepare(), /account_mismatch/);
  await assert.rejects(f.flow.confirm(), /pairing_not_reviewed/); assert.equal(f.state.calls.includes('prove'), false);
});
test('expired credentials and locked lifecycle never report payment readiness', async () => {
  const f = fixture(); f.scan(); await f.flow.prepare(); await f.flow.confirm();
  f.state.current = false; assert.equal(f.flow.paymentsAvailable, false);
  f.state.current = true; f.state.now += 600_000; assert.equal(f.flow.paymentsAvailable, false);
});
test('failed lifecycle capture releases the single-flight guard', async () => {
  const f = fixture(); f.state.current = false; await assert.rejects(f.flow.prepareUnlink(), /locked/);
  f.state.current = true; f.linked(); await f.flow.prepareUnlink(); assert.equal(f.flow.stage, 'unlink_review');
});
for (const authTime of [NaN, Infinity]) test('nonfinite credential auth time is rejected', async () => {
  const f = fixture(); f.scan(); f.ports.login = async () => ({ ...f.state.credential, authTime });
  await assert.rejects(f.flow.prepare(), /reproof_required/); assert.equal(f.state.calls.includes('prove'), false);
});
