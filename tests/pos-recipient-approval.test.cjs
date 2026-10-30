'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { schnorr, secp256k1 } = require('@noble/curves/secp256k1');
require('./register-typescript.cjs');
const { PosRecipientApproval } = require('../lib/opago/pos-recipient-approval.ts');
const { isValidPosLinkReference } = require('../lib/opago/pos-link-reference.ts');
const { isRuntimePosId } = require('../lib/opago/pos-runtime-profile.ts');
const { PosLinking } = require('../lib/opago/pos-link.ts');
const key = new Uint8Array(32).fill(3); // Synthetic test-only key.
const publicKey = secp256k1.getPublicKey(key, true);
const NOW = Date.parse('2026-10-30T11:00:00Z');
const stamp = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
function fixture(posId = 'POS_123-terminal') {
  let now = NOW, locked = false, fail = false, consent = 0, signs = 0;
  const sent = [];
  const context = { accountSubject: randomUUID(), walletId: randomUUID(), installationId: randomUUID(),
    walletPubkey: Buffer.from(publicKey).toString('hex'), network: 'regtest' };
  const request = { ...context, posId, bindingIntentId: randomUUID(), bindingVersion: 2,
    expiresAt: stamp(now + 300000), localSessionRef: 'synthetic-local-channel', challenge: {} };
  const params = { binding_intent_id: request.bindingIntentId, binding_version: request.bindingVersion, pos_id: request.posId };
  request.challenge = { challenge_id: randomUUID(), expires_at: request.expiresAt,
    message: ['opago-wallet-auth', 'domain: api.opago.com', 'network: regtest', 'wallet_pubkey: ' + context.walletPubkey,
      'nonce: ' + 'ac'.repeat(32), 'issued_at: ' + stamp(now), 'expires_at: ' + request.expiresAt, 'action: pos_bind',
      'action_params_sha256: ' + createHash('sha256').update(JSON.stringify(params)).digest('hex')].join('\n') };
  const channel = { verifiedRequest: async () => structuredClone(request), assertCurrent: () => { if (locked) throw new Error('locked'); },
    returnSignature: async (r, signature) => { sent.push({ r, signature }); if (fail) throw new Error('lost reply'); } };
  const signer = { getIdentityPublicKey: async () => publicKey,
    signSchnorrWithIdentityKey: async digest => { signs++; return schnorr.sign(digest, key); } };
  const controller = new PosRecipientApproval(context, channel, signer, async () => { consent++; return () => channel.assertCurrent(); }, () => now);
  return { controller, channel, request, context, signer, sent, get signs() { return signs; }, get consent() { return consent; },
    set now(value) { now = value; }, set locked(value) { locked = value; }, set fail(value) { fail = value; } };
}
test('runtime POS identifier compatibility stays separate from immutable schemas', () => {
  for (const id of ['A', 'POS_123-terminal', 'a'.repeat(64), 'pos-abcdefghij']) {
    assert.ok(isRuntimePosId(id)); assert.ok(isValidPosLinkReference({ pos_id: id, binding_intent_id: randomUUID() }));
  }
  for (const id of ['', 'a'.repeat(65), '../pos', 'a b', 'a\n', 'ä', 'https://api.opago.com']) assert.equal(isRuntimePosId(id), false);
});
test('signature-only controller reviews, obtains consent and returns a signature, never binding success', async () => {
  const f = fixture(); await f.controller.loadReview();
  assert.equal(f.controller.phase, 'review'); assert.equal(f.signs, 0); assert.equal(f.sent.length, 0);
  const shown = f.controller.review; shown.posId = 'changed'; assert.equal(f.controller.review.posId, f.request.posId);
  await f.controller.approve(); assert.equal(f.consent, 1); assert.equal(f.signs, 1);
  assert.equal(f.controller.phase, 'signature_returned');
  assert.deepEqual(Object.keys(f.sent[0].signature).sort(), ['challenge_id', 'installation_id', 'signature']);
  assert.ok(schnorr.verify(f.sent[0].signature.signature, createHash('sha256').update(f.request.challenge.message).digest(), publicKey.slice(1)));
  assert.equal('pos_api_key' in f.sent[0].signature, false);
  await assert.rejects(f.controller.approve(), /review required/);
});
test('local refusal and changed request make no signature or recipient mutation', async () => {
  const f = fixture(); await f.controller.loadReview(); f.controller.decline();
  assert.equal(f.controller.phase, 'declined'); assert.equal(f.signs, 0); assert.equal(f.sent.length, 0);
  await f.controller.loadReview(); f.request.localSessionRef = 'different-session';
  await assert.rejects(f.controller.approve(), /request changed/); assert.equal(f.signs, 0);
});
test('caller, wallet, installation, action and source context must remain bound', async () => {
  for (const field of ['accountSubject', 'walletId', 'installationId', 'walletPubkey', 'network']) {
    const f = fixture(); f.request[field] = field === 'network' ? 'mainnet' : randomUUID();
    await assert.rejects(f.controller.loadReview()); assert.equal(f.signs, 0);
  }
  for (const mutate of [r => { r.challenge.message = r.challenge.message.replace('action: pos_bind', 'action: wallet_close'); },
    r => { r.bindingVersion++; }, r => { r.posId = 'other'; }, r => { r.challenge.message += '\n'; },
    r => { r.expiresAt = stamp(NOW); }, r => { r.localSessionRef = 'https://callback'; },
    r => { r.pos_api_key = 'unexpected-credential'; }, r => { r.challenge.callback = 'https://evil.invalid'; }]) {
    const f = fixture(); mutate(f.request); await assert.rejects(f.controller.loadReview()); assert.equal(f.signs, 0);
  }
});
test('unknown signature return retries identical signature without extra consent or signing', async () => {
  const f = fixture(); await f.controller.loadReview(); f.fail = true;
  await assert.rejects(f.controller.approve(), /lost reply/); assert.equal(f.controller.phase, 'unknown');
  await assert.rejects(f.controller.loadReview(), /Recover or clear/);
  f.fail = false; await f.controller.recoverSignatureReturn();
  assert.deepEqual(f.sent[0], f.sent[1]); assert.equal(f.signs, 1); assert.equal(f.consent, 1);
  assert.equal(f.controller.phase, 'signature_returned');
});
test('expired signature return requires a new request and never marks a POS linked', async () => {
  const f = fixture(); await f.controller.loadReview(); f.fail = true;
  await assert.rejects(f.controller.approve()); f.now = NOW + 300000;
  await assert.rejects(f.controller.recoverSignatureReturn(), /expired/);
  assert.equal(f.sent.length, 1); assert.equal(f.controller.phase, 'unknown');
});
test('background clear during signing or signature return prevents late state resurrection', async () => {
  for (const during of ['signing', 'return']) {
    const f = fixture(); let release;
    if (during === 'signing') f.signer.signSchnorrWithIdentityKey = digest => new Promise(resolve => { release = () => resolve(schnorr.sign(digest, key)); });
    else f.channel.returnSignature = () => new Promise(resolve => { release = resolve; });
    await f.controller.loadReview(); const flight = f.controller.approve();
    while (!release) await new Promise(resolve => setImmediate(resolve));
    f.controller.clear(); release(); await assert.rejects(flight, /cancelled/);
    assert.equal(f.controller.phase, 'empty'); assert.equal(f.controller.review, null);
    await assert.rejects(f.controller.recoverSignatureReturn(), /No signature/);
  }
});
test('locked channel and wrong signer fail before signature return', async () => {
  const f = fixture(); await f.controller.loadReview(); f.locked = true;
  await assert.rejects(f.controller.approve(), /locked/); assert.equal(f.sent.length, 0);
  const g = fixture(); await g.controller.loadReview(); g.signer.getIdentityPublicKey = async () => secp256k1.getPublicKey(new Uint8Array(32).fill(4), true);
  await assert.rejects(g.controller.approve(), /signer mismatch/); assert.equal(g.sent.length, 0);
});
test('lock during the helper second public-key read prevents native Schnorr signing', async () => {
  const f = fixture(); let reads = 0, release;
  f.signer.getIdentityPublicKey = async () => {
    if (++reads === 2) await new Promise(resolve => { release = resolve; });
    return publicKey;
  };
  await f.controller.loadReview(); const flight = f.controller.approve();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  f.locked = true; release(); await assert.rejects(flight, /locked/);
  assert.equal(f.signs, 0); assert.equal(f.sent.length, 0);
});
test('old Wallet-confirm controller cannot be installed as a live backend', () => {
  const account = { operationKey: x => x, api: { transport: { mode: 'hka' } } };
  assert.throws(() => new PosLinking(account, { mode: 'backend' }), /pos_integration_unavailable/);
  assert.doesNotThrow(() => new PosLinking(account)); // Unrelated account functionality stays gated/available.
});
