'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { schnorr } = require('@noble/curves/secp256k1');
const existingModules = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { PosLinking } = require('../lib/opago/pos-link.ts');
const { F4ContractTestBackend } = require('../lib/opago/pos-test-adapter.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { walletAuthChallengeDigest, signWalletAuthChallenge } = require('../lib/wallet-auth-proof.ts');
const { installPosQrSource, isPosLinkQr } = require('../lib/opago/pos-qr-native.ts');
for (const name of Object.keys(require.cache)) if (name.endsWith('.ts') && !existingModules.has(name)) delete require.cache[name];
const code = c => e => e.code === c;
async function fixture() {
  let now = Date.now(); const store = new MemoryPrivateStore();
  const backend = new F4ContractTestBackend(store, randomUUID, 'regtest', () => now);
  const account = backend.createAccount(); await account.load(); await account.signIn(); await account.proveOwnership(); await account.bind();
  await backend.setKya('approved'); await account.refresh(); await account.address('set', 'alice-test');
  const pos = new PosLinking(account, backend); await pos.load(); const qr = await backend.operatorStart();
  return { store, backend, account, pos, qr, advance: ms => { now += ms; } };
}
test('F4 scans without signing, requires consent, waits for operator and lists only confirmed links', async () => {
  const f = await fixture(); const before = f.backend.calls.length;
  await f.pos.scan(f.qr); assert.equal(f.pos.phase, 'review'); assert.equal(f.backend.bindingWrites, 0);
  assert.deepEqual(f.backend.calls.slice(before).map(r => [r.method,r.path]), [['GET','/api/v2/wallet/me']]);
  await f.pos.list(); assert.deepEqual(f.pos.links, []);
  await f.pos.approve(); assert.equal(f.pos.phase, 'awaiting_operator'); assert.equal(f.backend.bindingWrites, 1);
  const proofRequest = f.backend.calls.find(r => r.path.endsWith('/auth/challenge') && r.body.action === 'pos_bind');
  assert.deepEqual(proofRequest.body.action_params, { pos_id: f.pos.current.review.intent.pos_id, binding_intent_id: f.pos.current.review.intent.binding_intent_id, binding_version: 1 });
  assert.equal(f.backend.calls.some(r => r.path.endsWith('/binding-intents') || r.path === '/api/v2/pos/pos-abcdefghij'), false);
  await assert.rejects(f.pos.approve(), code('pos_review_required'));
  await f.backend.operatorConfirm(f.pos.current.review.intent.binding_intent_id); await f.pos.refresh();
  assert.equal(f.pos.phase, 'linked'); await f.pos.list(); assert.equal(f.pos.links[0].pos.wallet_id, f.account.state.wallet.wallet_id);
  await assert.rejects(f.pos.scan(f.qr), code('pos_intent_used'));
});
test('F4 operator may confirm first; wallet still needs its own explicit approval', async () => {
  const f = await fixture(); await f.backend.operatorConfirm(f.backend.decodeQr(f.qr).binding_intent_id);
  await f.pos.scan(f.qr); assert.equal(f.pos.phase, 'review'); assert.equal(f.backend.bindingWrites, 0);
  await f.pos.approve(); assert.equal(f.pos.phase, 'linked'); assert.equal(f.backend.bindingWrites, 1);
});
test('F4 local refusal makes no proof or POS mutation, persists after restart', async () => {
  const f = await fixture(); await f.pos.scan(f.qr); const before = f.backend.calls.length;
  await f.pos.decline(); assert.equal(f.backend.calls.length, before); assert.equal(f.backend.reviews[0].intent.recipient_confirmed, false);
  const next = new PosLinking(f.account, f.backend); await next.load(); assert.equal(next.phase, 'declined'); assert.equal(next.canApprove, false);
  await assert.rejects(next.approve(), code('pos_review_required'));
});
test('F4 QR decoder rejects arbitrary URLs, credentials, garbage, excessive payloads and test/live mixing', async () => {
  const f = await fixture();
  for (const qr of ['https://127.0.0.1/admin', 'https://api.opago.com/api/v2/pos/pos-abcdefghij?token=abc', f.qr+'?wallet=other', ' '+f.qr, 'x'.repeat(4097)]) {
    await assert.rejects(f.pos.scan(qr), code('pos_qr_invalid'));
  }
  assert.equal(f.backend.bindingWrites, 0);
  installPosQrSource(); assert.equal(isPosLinkQr(f.qr), false); assert.throws(() => installPosQrSource(f.backend));
  assert.throws(() => new PosLinking(f.account, { ...f.backend, mode: 'backend' }));
  const disabled = new PosLinking(f.account); await assert.rejects(disabled.scan(f.qr), code('pos_integration_unavailable'));
});
test('F4 intended wallet is authoritative, not supplied by a QR', async () => {
  const f = await fixture(); const wrong = await f.backend.operatorStart('pos-klmnopqrst', randomUUID());
  await assert.rejects(f.pos.scan(wrong), code('pos_wrong_wallet')); assert.equal(f.backend.bindingWrites, 0);
});
test('F4 cached details require refresh before consent after process restart', async () => {
  const f = await fixture(); await f.pos.scan(f.qr); const next = new PosLinking(f.account, f.backend); await next.load();
  assert.equal(next.canApprove, false); await assert.rejects(next.approve(), code('pos_review_required')); await next.refresh();
  assert.equal(next.canApprove, true); await next.approve(); assert.equal(next.phase, 'awaiting_operator');
});
test('F4 expiry before consent sends no proof; expiry awaiting operator is never success', async () => {
  const f = await fixture(); await f.pos.scan(f.qr); f.advance(300001); assert.equal(f.pos.phase, 'expired');
  await assert.rejects(f.pos.approve(), code('pos_review_required')); await f.pos.refresh(); assert.equal(f.pos.phase, 'expired');
  assert.equal(f.backend.bindingWrites, 0);
  const g = await fixture(); await g.pos.scan(g.qr); await g.pos.approve(); g.advance(300001); await g.pos.refresh();
  assert.equal(g.pos.phase, 'expired'); await assert.rejects(g.backend.operatorConfirm(g.pos.current.review.intent.binding_intent_id), code('pos_intent_used'));
});
test('F4 new operator request can replace an expired review that was never submitted', async () => {
  const f=await fixture();await f.pos.scan(f.qr);f.advance(300001);const qr=await f.backend.operatorStart();
  await f.pos.scan(qr);assert.equal(f.pos.phase,'review');assert.equal(f.backend.bindingWrites,0);
});
test('F4 a proof for one intent cannot approve a different POS or receiver intent', async () => {
  const f=await fixture();await f.pos.scan(f.qr);const intent=f.pos.current.review.intent;
  const proof=await f.account.proof({action:'pos_bind',action_params:{pos_id:intent.pos_id,binding_intent_id:intent.binding_intent_id,binding_version:intent.binding_version}},'wallet','synthetic-other-flow');
  const other=f.backend.decodeQr(await f.backend.operatorStart('pos-klmnopqrst'));
  const result=await f.backend.request({method:'POST',path:'/api/v2/pos/'+other.pos_id+'/bindings',body:{binding_intent_id:other.binding_intent_id,proof_token:proof.proof_token},auth:'wallet',bearer:f.account.state.session.access_token,idempotencyKey:randomUUID()});
  assert.equal(result.status,401);assert.equal(result.body.error.code,'action_mismatch');assert.equal(f.backend.bindingWrites,0);
});
test('F4 changed merchant, target, version or expiry invalidates previously reviewed consent', async () => {
  for (const change of [r => r.merchant.name = 'different merchant', r => r.receiver.address = 'other@opago.com',
    r => r.intent.binding_version++, r => r.intent.expires_at = new Date(Date.parse(r.intent.expires_at)-1000).toISOString().replace('.000Z','Z')]) {
    const f = await fixture(); await f.pos.scan(f.qr); change(f.backend.reviews[0]);
    await assert.rejects(f.pos.approve()); assert.equal(f.backend.bindingWrites, 0); assert.equal(f.pos.canApprove, false);
  }
});
test('F4 missing readiness prevents approval and never changes POS rights', async () => {
  const f = await fixture(); await f.pos.scan(f.qr); f.backend.state.wallet.photo_match.active_approval_revision = null;
  await assert.rejects(f.pos.approve(), code('kyc_required')); assert.equal(f.backend.bindingWrites, 0);
});
test('F4 session expiry refreshes then retries the same binding input and operation key', async () => {
  const f = await fixture(); await f.pos.scan(f.qr); f.backend.expireSessionOnce = true; await f.pos.approve();
  const calls = f.backend.calls.filter(r => r.path.endsWith('/bindings'));
  assert.equal(calls.length, 2); assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey); assert.deepEqual(calls[0].body, calls[1].body);
  assert.equal(f.backend.bindingWrites, 1); assert.equal(f.pos.phase, 'awaiting_operator');
});
test('F4 lost binding response recovers authoritative consent after process restart without double mutation', async () => {
  const f = await fixture(); await f.pos.scan(f.qr); f.backend.loseNextBindingResponse = true; await assert.rejects(f.pos.approve());
  assert.equal(f.pos.phase, 'unknown'); assert.equal(f.backend.bindingWrites, 1); await assert.rejects(f.pos.scan(await f.backend.operatorStart()), code('operation_conflict'));
  const nextBackend = new F4ContractTestBackend(f.store, randomUUID, 'regtest', f.account.now); await nextBackend.load();
  const nextAccount = nextBackend.createAccount(); await nextAccount.load(); const next = new PosLinking(nextAccount, nextBackend); await next.load();
  await next.recover(); assert.equal(next.phase, 'awaiting_operator'); assert.equal(nextBackend.bindingWrites, 0);
  await nextBackend.operatorConfirm(next.current.review.intent.binding_intent_id); await next.refresh(); assert.equal(next.phase, 'linked');
});
test('F4 lost response with inaccessible status replays same proof/key when status returns', async () => {
  const f = await fixture(); await f.pos.scan(f.qr);
  const request = f.backend.request.bind(f.backend); let first = true;
  f.backend.request = async req => { if (req.path.endsWith('/bindings') && first) { first = false; throw Error('lost before request'); } return request(req); };
  await assert.rejects(f.pos.approve()); const original = await f.store.read(f.account.operationKey('pos.'+f.pos.current.review.intent.binding_intent_id+'.commit'));
  f.backend.reviewUnavailable = true; await assert.rejects(f.pos.recover()); assert.equal(f.pos.phase, 'unknown');
  f.backend.reviewUnavailable = false; await f.pos.recover(); assert.equal(f.pos.phase, 'awaiting_operator');
  const sent = f.backend.calls.find(r => r.path.endsWith('/bindings')); assert.equal(sent.idempotencyKey, original.key); assert.deepEqual(sent.body, original.body);
});
test('F4 competing confirmation cannot show a changed POS binding as success', async () => {
  const f = await fixture(); await f.pos.scan(f.qr); await f.backend.competingBinding(f.pos.current.review.intent.binding_intent_id);
  await assert.rejects(f.pos.approve(), code('pos_intent_used')); assert.equal(f.pos.phase, 'superseded'); assert.equal(f.backend.bindingWrites, 0);
});
test('F4 serialized concurrent wallet approvals have one winner', async () => {
  const f = await fixture(); await f.pos.scan(f.qr);
  const results = await Promise.allSettled([f.account.exclusive(() => f.pos.approve()), f.account.exclusive(() => f.pos.approve())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.backend.bindingWrites, 1);
});
test('F4 cancellation before signing can be declined locally without consuming a proof', async () => {
  const f = await fixture(); await f.pos.scan(f.qr); f.account.identity.sign = async () => { throw Error('Operation cancelled'); };
  await assert.rejects(f.pos.approve()); assert.equal(f.pos.phase, 'review'); assert.equal(f.backend.bindingWrites, 0);
  await f.pos.decline(); assert.equal(f.pos.phase, 'declined');
});
test('F4 replay uses its existing logical result; another operation cannot reuse a consumed proof', async () => {
  const f = await fixture(); await f.pos.scan(f.qr); await f.pos.approve();
  const req = f.backend.calls.find(r => r.path.endsWith('/bindings'));
  const replay = await f.backend.request(req); assert.equal(replay.status, 200); assert.equal(f.backend.bindingWrites, 1);
  const differentKey = await f.backend.request({ ...req, idempotencyKey: randomUUID() }); assert.equal(differentKey.status, 401);
  const conflict = await f.backend.request({ ...req, body: { ...req.body, proof_token: 'different-proof' } }); assert.equal(conflict.status, 409);
  assert.equal(f.backend.bindingWrites, 1);
});
test('F4 known rejection allows a fresh request; malformed confirmation retains unknown outcome', async () => {
  const f = await fixture(); await f.pos.scan(f.qr);
  const original = f.backend.request.bind(f.backend);
  f.backend.request = async req => req.path.endsWith('/bindings') ? { authenticated: true, status: 401, body: { error: { code: 'action_mismatch', message: 'test', retryable: false, details: {} }, request_id: randomUUID() } } : original(req);
  await assert.rejects(f.pos.approve()); assert.equal(f.pos.phase, 'rejected');
  await f.pos.scan(await f.backend.operatorStart()); assert.equal(f.pos.phase, 'review');
  f.backend.request = async req => req.path.endsWith('/bindings') ? { authenticated: true, status: 200, body: {} } : original(req);
  await assert.rejects(f.pos.approve()); assert.equal(f.pos.phase, 'unknown'); assert.equal(f.pos.canApprove, false);
});
test('F4 acknowledgement with unavailable status stays recoverable and cannot show success', async () => {
  const f = await fixture(); await f.pos.scan(f.qr);
  const original=f.backend.request.bind(f.backend);
  f.backend.request=async req=>{const result=await original(req);if(req.path.endsWith('/bindings')) f.backend.reviewUnavailable=true;return result;};
  await assert.rejects(f.pos.approve());assert.equal(f.pos.phase,'unknown');assert.equal(f.pos.verified,false);
  f.backend.reviewUnavailable=false;await f.pos.recover();assert.equal(f.pos.phase,'awaiting_operator');assert.equal(f.backend.bindingWrites,1);
});
test('F4 rejects falsely complete status and wrong listing ownership', async () => {
  const f = await fixture(); await f.pos.scan(f.qr); f.backend.reviews[0].state = 'linked';
  await assert.rejects(f.pos.refresh(), code('pos_details_invalid')); assert.equal(f.pos.verified, false);
  f.backend.list = async () => [{ pos: { ...f.backend.reviews[0].pos, wallet_id: randomUUID() }, merchant: f.backend.reviews[0].merchant }];
  await assert.rejects(f.pos.list(), code('pos_details_invalid')); assert.equal(f.pos.links, null);
});
test('F4 invalid details with directional controls, foreign network or too-long expiry are rejected', async () => {
  for (const change of [r => r.merchant.name = 'merchant\u202e', r => r.receiver.network = 'mainnet',
    r => r.intent.expires_at = new Date(Date.now()+600000).toISOString().replace(/\.\d{3}Z$/, 'Z')]) {
    const f = await fixture(); change(f.backend.reviews[0]); await assert.rejects(f.pos.scan(f.qr)); assert.equal(f.backend.bindingWrites, 0);
  }
});
test('F4 pos_bind canonical hash and Schnorr signature bind POS, intent and exact version', async () => {
  const vector = require('../docs/lnurl-spark-contracts/v2/fixtures/wallet-auth-vectors.json').vectors[0];
  const params = { pos_id: 'pos-abcdefghij', binding_intent_id: randomUUID(), binding_version: 3 };
  const canonical = JSON.stringify({ binding_intent_id: params.binding_intent_id, binding_version: params.binding_version, pos_id: params.pos_id });
  const hash = createHash('sha256').update(canonical).digest('hex');
  const message = vector.message.replace('action: login', 'action: pos_bind').replace(/action_params_sha256: .+/, 'action_params_sha256: '+hash);
  const challenge = { challenge_id: randomUUID(), message, expires_at: '2026-09-28T12:05:00Z' };
  const pubkey = Buffer.from(vector.compressed_public_key_hex, 'hex'); const now = Date.parse('2026-09-28T12:01:00Z');
  const intent = { action: 'pos_bind', action_params: params }; const digest = walletAuthChallengeDigest(challenge,intent,'mainnet',pubkey,now);
  assert.equal(Buffer.from(digest).toString('hex'), createHash('sha256').update(message).digest('hex'));
  const signed = await signWalletAuthChallenge({ getIdentityPublicKey: async () => pubkey,
    signSchnorrWithIdentityKey: async d => schnorr.sign(d, Buffer.from(vector.test_private_key_hex,'hex')) },challenge,intent,'mainnet',randomUUID(),now);
  assert.ok(schnorr.verify(signed.signature,digest,pubkey.subarray(1)));
  for (const altered of [{ ...params, pos_id: 'pos-klmnopqrst' }, { ...params, binding_intent_id: randomUUID() }, { ...params, binding_version: 4 },
    { ...params, binding_version: 0 }, { ...params, binding_version: 1.5 }, { ...params, binding_version: Number.MAX_SAFE_INTEGER+1 }, { ...params, wallet_id: randomUUID() }]) {
    assert.throws(() => walletAuthChallengeDigest(challenge,{ action: 'pos_bind', action_params: altered },'mainnet',pubkey,now));
  }
});
test('F4 existing Spark SDK signer signs pos_bind without an RPC or payment dispatch', async () => {
  const { DefaultSparkSigner } = require('@buildonspark/spark-sdk'); const signer = new DefaultSparkSigner();
  const seed = Buffer.alloc(64, 0x37); await signer.createSparkWalletFromSeed(seed,1); seed.fill(0);
  const pubkey = await signer.getIdentityPublicKey();
  const vector = require('../docs/lnurl-spark-contracts/v2/fixtures/wallet-auth-vectors.json').vectors[0];
  const params = { binding_intent_id: randomUUID(), binding_version: 1, pos_id: 'pos-abcdefghij' };
  const hash = createHash('sha256').update(JSON.stringify(params)).digest('hex');
  const message = vector.message.replace(vector.compressed_public_key_hex,Buffer.from(pubkey).toString('hex'))
    .replace('action: login','action: pos_bind').replace(/action_params_sha256: .+/,'action_params_sha256: '+hash);
  const challenge = { challenge_id: randomUUID(), message, expires_at:'2026-09-28T12:05:00Z' };const intent = { action:'pos_bind',action_params:params };
  const now=Date.parse('2026-09-28T12:01:00Z');const verify = await signWalletAuthChallenge(signer,challenge,intent,'mainnet',randomUUID(),now);
  assert.ok(schnorr.verify(verify.signature,walletAuthChallengeDigest(challenge,intent,'mainnet',pubkey,now),pubkey.subarray(1)));
});
