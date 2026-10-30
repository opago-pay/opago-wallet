'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { schnorr, secp256k1 } = require('@noble/curves/secp256k1');
require('./register-typescript.cjs');
const { v3SessionChallengeDigest, signV3SessionChallenge } = require('../lib/wallet-session-proof.ts');
const { V3WalletSessionClient } = require('../lib/opago/v3-wallet-session.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const secret = new Uint8Array(32).fill(1); // Public synthetic test key, never used on a network.
const publicKey = secp256k1.getPublicKey(secret, true);
const context = { tenant: 'opago', subject: randomUUID(), walletId: randomUUID(),
  sourceWalletId: Buffer.from(publicKey).toString('hex'), installationId: randomUUID() };
const NOW = Date.parse('2026-10-30T10:00:00Z');
const stamp = value => new Date(value).toISOString().replace('.000Z', 'Z');
function challenge(ctx = context) {
  const id = randomUUID(), expires = stamp(NOW + 300000);
  return { challenge_id: id, purpose: 'session', expires_at: expires,
    message: ['opago-tx-foundation-v3', 'purpose:session', 'tenant:' + ctx.tenant, 'subject:' + ctx.subject,
      'wallet_source:spark', 'source_wallet_id:' + ctx.sourceWalletId, 'network:-',
      'installation_id:' + ctx.installationId, 'challenge_id:' + id, 'nonce:' + 'ab'.repeat(32), 'expires_at:' + expires].join('\n') };
}
function signer() { return { getIdentityPublicKey: async () => publicKey,
  signSchnorrWithIdentityKey: async digest => schnorr.sign(digest, secret) }; }
function fixture() {
  const store = new MemoryPrivateStore(); let now = NOW, consent = 0, calls = [];
  const c = challenge(); let response = { wallet_id: context.walletId, installation_id: context.installationId,
    access_token: 'synthetic-v3-opaque-token', expires_at: stamp(NOW + 900000) };
  let handler = async input => ({ authenticated: true, status: 201, body: input.path.endsWith('/challenges') ? c : response });
  const port = { request: async input => { calls.push(structuredClone(input)); return handler(input); } };
  const make = () => new V3WalletSessionClient(context, port, store, randomUUID, () => now);
  return { client: make(), make, calls, c, store, authorize: async () => { consent++; return () => {}; },
    get consent() { return consent; }, set now(v) { now = v; }, set handler(v) { handler = v; },
    get response() { return response; }, set response(v) { response = v; } };
}

test('v3 canonical bytes match Python message format and actual BIP340 verification', async () => {
  for (const sourceWalletId of [context.sourceWalletId, context.sourceWalletId.slice(2)]) {
    const ctx = { ...context, sourceWalletId }, c = challenge(ctx);
    const digest = v3SessionChallengeDigest(c, ctx, NOW);
    assert.deepEqual(Buffer.from(digest), createHash('sha256').update(c.message, 'utf8').digest());
    const proof = await signV3SessionChallenge(signer(), c, ctx, async () => () => {}, () => NOW);
    assert.deepEqual(Object.keys(proof).sort(), ['challenge_id', 'signature']);
    assert.ok(schnorr.verify(proof.signature, digest, publicKey.slice(1)));
  }
});
test('v3 rejects every changed binding and old F3 message before signing', async () => {
  const c = challenge();
  for (const [from, to] of [['purpose:session', 'purpose:bind'], ['tenant:opago', 'tenant:other'],
    [context.subject, randomUUID()], [context.sourceWalletId, '02' + 'ab'.repeat(32)],
    ['wallet_source:spark', 'wallet_source:hedera'], ['network:-', 'network:mainnet'],
    [context.installationId, randomUUID()], [c.challenge_id, randomUUID()], ['nonce:', 'nonce: ']]) {
    assert.throws(() => v3SessionChallengeDigest({ ...c, message: c.message.replace(from, to) }, context, NOW));
  }
  for (const extra of [{ purpose: 'bind' }, { message: c.message + '\n' }, { message: c.message.replaceAll('\n', '\r\n') },
    { message: 'opago-wallet-auth\n' }, { expires_at: stamp(NOW) }, { expires_at: '2026-02-30T10:00:00Z' },
    { extra: 'ignored?' }, { challenge_id: 'not-uuid' }]) assert.throws(() => v3SessionChallengeDigest({ ...c, ...extra }, context, NOW));
  assert.throws(() => v3SessionChallengeDigest(c, context, NOW - 1000));
  let signed = false;
  await assert.rejects(signV3SessionChallenge({ ...signer(), signSchnorrWithIdentityKey: async () => { signed = true; } }, c, context,
    async () => { throw new Error('cancelled'); }, () => NOW), /cancelled/);
  assert.equal(signed, false);
});
test('v3 validates signer key, post-consent expiry, runtime and returned signature', async () => {
  const c = challenge();
  await assert.rejects(signV3SessionChallenge({ ...signer(), getIdentityPublicKey: async () => secp256k1.getPublicKey(new Uint8Array(32).fill(2), true) }, c, context, async () => () => {}, () => NOW), /signer mismatch/);
  let time = NOW;
  await assert.rejects(signV3SessionChallenge(signer(), c, context, async () => { time += 300000; return () => {}; }, () => time), /expired/);
  await assert.rejects(signV3SessionChallenge(signer(), c, context, async () => () => { throw new Error('locked'); }, () => NOW), /locked/);
  await assert.rejects(signV3SessionChallenge({ ...signer(), signSchnorrWithIdentityKey: async () => new Uint8Array(64) }, c, context, async () => () => {}, () => NOW));
});
test('typed session issuance requires consent, persists exact response and never refreshes', async () => {
  const f = fixture(); const c = await f.client.challenge();
  assert.equal(f.consent, 0); assert.deepEqual(c, f.c);
  const session = await f.client.issue(c, signer(), f.authorize);
  assert.equal(f.consent, 1); assert.deepEqual(session, f.response);
  assert.deepEqual(await f.client.localSession(), session);
  assert.equal(f.calls[0].path, '/api/v3/wallets/challenges');
  assert.equal(f.calls[1].path, '/api/v3/wallets/' + context.walletId + '/sessions');
  assert.equal(f.calls[1].contract, 'tx-foundation-v3');
  assert.deepEqual(Object.keys(f.calls[1].body).sort(), ['challenge_id', 'signature']);
  f.now = NOW + 900000; assert.equal(await f.client.localSession(), null);
  assert.equal(f.calls.length, 2); // Expiry is not silent renewal.
});
test('unknown issuance survives restart with same proof and logical idempotency key', async () => {
  const f = fixture(); f.handler = async () => { throw new Error('lost response'); };
  await assert.rejects(f.client.issue(f.c, signer(), f.authorize), /lost response/);
  await assert.rejects(f.client.challenge(), /Recover pending/);
  const first = f.calls[0]; f.handler = async () => ({ authenticated: true, status: 201, body: f.response });
  f.now = NOW + 301000; // Original challenge expired, approved retry remains byte-identical.
  assert.deepEqual(await f.make().recover(), f.response);
  assert.deepEqual(f.calls[1], first); assert.equal(f.consent, 1);
  await assert.rejects(f.make().recover(), /No valid pending/);
});
test('lost challenge replies reuse the durable key instead of exhausting outstanding challenges', async () => {
  const f = fixture(); f.handler = async () => { throw new Error('lost challenge'); };
  await assert.rejects(f.client.challenge(), /lost challenge/);
  const first = f.calls[0]; f.handler = async () => ({ authenticated: true, status: 201, body: f.c });
  await f.make().challenge(); assert.deepEqual(f.calls[1], first);
  f.now = NOW + 300000;
  f.handler = async () => ({ authenticated: true, status: 201, body: { ...f.c, expires_at: stamp(NOW + 600000),
    message: f.c.message.replace(stamp(NOW + 300000), stamp(NOW + 600000)) } });
  await f.make().challenge(); assert.notEqual(f.calls[2].idempotencyKey, first.idempotencyKey);
});
test('bad responses cannot create a session or silently discard pending recovery', async () => {
  for (const change of [{ authenticated: false }, { status: 200 }, { body: { ...fixture().response, refresh_token: 'not-v3' } },
    { body: { ...fixture().response, wallet_id: randomUUID() } }, { body: { ...fixture().response, installation_id: randomUUID() } },
    { body: { ...fixture().response, expires_at: stamp(NOW + 901000) } }]) {
    const f = fixture(); f.handler = async () => ({ authenticated: true, status: 201, body: f.response, ...change });
    await assert.rejects(f.client.issue(f.c, signer(), f.authorize));
    assert.equal(await f.client.localSession(), null);
    await assert.rejects(f.client.issue(f.c, signer(), f.authorize), /Recover pending/);
  }
});
test('clearLocal completes during stalled request and late response cannot resurrect credential', async () => {
  const f = fixture(); let resolve; f.handler = () => new Promise(r => { resolve = r; });
  const issuing = f.client.issue(f.c, signer(), f.authorize);
  while (!resolve) await new Promise(r => setImmediate(r));
  await assert.rejects(f.client.issue(f.c, signer(), f.authorize), /in progress/);
  await f.client.clearLocal();
  resolve({ authenticated: true, status: 201, body: f.response });
  await assert.rejects(issuing, /cancelled/);
  assert.equal(await f.client.localSession(), null);
  await assert.rejects(f.client.recover(), /No valid pending/);
});
test('device lock while the approved proof is persisted prevents dispatch', async () => {
  const f = fixture(); let locked = false;
  const write = f.store.write.bind(f.store);
  f.store.write = async (key, value) => { await write(key, value); locked = true; };
  await assert.rejects(f.client.issue(f.c, signer(), async () => () => {
    if (locked) throw new Error('device locked');
  }), /device locked/);
  assert.equal(f.calls.length, 0);
});
test('an in-flight local read cannot return a bearer after clearLocal', async () => {
  const f = fixture(); await f.client.issue(f.c, signer(), f.authorize);
  const read = f.store.read.bind(f.store); let finish;
  f.store.read = async key => { const value = await read(key); return new Promise(resolve => { finish = () => resolve(value); }); };
  const reading = f.client.localSession();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await f.client.clearLocal(); finish();
  assert.equal(await reading, null);
});
test('overlapping lifecycle clears keep issuance blocked until the last clear finishes', async () => {
  const f = fixture(); await f.client.issue(f.c, signer(), f.authorize);
  const remove = f.store.remove.bind(f.store); let removes = 0, release;
  f.store.remove = async key => {
    removes++;
    if (removes === 4) await new Promise(resolve => { release = resolve; });
    await remove(key);
  };
  const first = f.client.clearLocal(), second = f.client.clearLocal();
  await first;
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(f.client.issue(f.c, signer(), f.authorize), /in progress/);
  await assert.rejects(f.client.recover(), /in progress/);
  await assert.rejects(f.client.challenge(), /in progress/);
  assert.equal(await f.client.localSession(), null);
  release(); await second;
  assert.equal(await f.client.localSession(), null);
  await assert.rejects(f.client.recover(), /No valid pending/);
});
