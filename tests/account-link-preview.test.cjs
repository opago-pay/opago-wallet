'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { schnorr } = require('@noble/curves/secp256k1');
require('./register-typescript.cjs');
const { signWalletAuthChallenge } = require('../lib/wallet-auth-proof.ts');
const { MockAccountLinkAdapter, LinkPreviewError, linkWithSparkProof, accountLinkAdapterForWallet, ACCOUNT_LINK_PREVIEW_ENABLED } = require('../lib/opago/account-link-preview.ts');
const key = new Uint8Array(32).fill(7);
const walletKey = '02' + Buffer.from(schnorr.getPublicKey(key)).toString('hex');
let sequence = 1;
const uuid = () => '10000000-0000-4000-8000-' + String(sequence++).padStart(12, '0');
const now = Date.parse('2026-10-29T08:00:00Z');
function signer(nowValue = now) {
  return { sign: async ({ challenge, intent }) => signWalletAuthChallenge({
    getIdentityPublicKey: async () => Buffer.from(walletKey, 'hex'),
    signSchnorrWithIdentityKey: async digest => schnorr.sign(digest, key, new Uint8Array(32)),
  }, challenge, intent, 'mainnet', uuid(), nowValue) };
}
test('link preview defaults off', () => assert.equal(ACCOUNT_LINK_PREVIEW_ENABLED, false));
test('real identity signature is checked; one wallet per account and unlink/relink', async () => {
  const mock = new MockAccountLinkAdapter(walletKey, 'mainnet', uuid, () => now);
  assert.equal((await linkWithSparkProof(mock, signer(), 'a', walletKey)).linked, true);
  await assert.rejects(linkWithSparkProof(mock, signer(), 'b', walletKey), e => e instanceof LinkPreviewError && e.code === 'conflict');
  await mock.unlink('a');
  assert.equal((await linkWithSparkProof(mock, signer(), 'b', walletKey)).linked, true);
});
test('challenge expiry rejects signing and verification', async () => {
  let clock = now;
  const mock = new MockAccountLinkAdapter(walletKey, 'mainnet', uuid, () => clock);
  const binding = await mock.challenge('a', walletKey);
  clock += 60_000;
  await assert.rejects(mock.verify(binding, await signer(now).sign(binding)), e => e.code === 'challenge_expired');
  await assert.rejects(signer(clock).sign(binding), /expired/);
});
test('fake proof or cancelled signature cannot link wallet', async () => {
  const mock = new MockAccountLinkAdapter(walletKey, 'mainnet', uuid, () => now);
  const binding = await mock.challenge('a', walletKey);
  await assert.rejects(mock.verify(binding, { challenge_id: binding.challenge.challenge_id, installation_id: uuid(), signature: 'a'.repeat(128) }), e => e.code === 'cancelled');
  assert.equal((await mock.status('a')).linked, false);
  await assert.rejects(linkWithSparkProof(mock, { sign: async () => { throw new LinkPreviewError('cancelled'); } }, 'a', walletKey), e => e.code === 'cancelled');
  assert.equal((await mock.status('a')).linked, false);
});

test('login status uses the same adapter after sign-out and login again', async () => {
  let created = 0;
  const factory = () => { created++; return new MockAccountLinkAdapter(walletKey, 'mainnet', uuid, () => now); };
  let entry = accountLinkAdapterForWallet(null, walletKey, factory);
  const id = await entry.adapter.login();
  await linkWithSparkProof(entry.adapter, signer(), id, walletKey);
  assert.equal((await entry.adapter.status(id)).linked, true);
  // Simulate sign-out: only the UI principal is cleared, not the mock backend.
  entry = accountLinkAdapterForWallet(entry, walletKey, factory);
  const relogin = await entry.adapter.login();
  assert.equal((await entry.adapter.status(relogin)).linked, true);
  assert.equal(created, 1);
  const differentWallet = '03' + walletKey.slice(2);
  const switched = accountLinkAdapterForWallet(entry, differentWallet, () => {
    created++;
    return new MockAccountLinkAdapter(differentWallet, 'mainnet', uuid, () => now);
  });
  assert.notEqual(switched.adapter, entry.adapter);
  assert.equal(created, 2);
});

test('verify rejects manipulated pending account, nonce, message and expiry', async () => {
  const mock = new MockAccountLinkAdapter(walletKey, 'mainnet', uuid, () => now);
  const binding = await mock.challenge('a', walletKey);
  const proof = await signer().sign(binding);
  const clone = () => JSON.parse(JSON.stringify(binding));
  const variants = [
    b => { b.accountId = 'b'; },
    b => { b.challenge.expires_at = '2099-01-01T00:00:00Z'; },
    b => { b.challenge.challenge_id = uuid(); },
    b => { b.challenge.message = b.challenge.message.replace('nonce: ', 'nonce: ff'); },
    b => { b.challenge.message = b.challenge.message.replace('action: wallet_bind', 'action: login'); },
    b => { b.intent.action_params.account_generation = 2; },
  ];
  for (const change of variants) {
    const forged = clone(); change(forged);
    await assert.rejects(mock.verify(forged, proof), e => e instanceof LinkPreviewError && e.code === 'cancelled');
    assert.equal((await mock.status('a')).linked, false);
  }
  // Rejected caller changes cannot corrupt the authoritative pending record.
  assert.equal((await mock.verify(binding, proof)).linked, true);
});
test('caller cannot extend expired pending challenge', async () => {
  let clock = now;
  const mock = new MockAccountLinkAdapter(walletKey, 'mainnet', uuid, () => clock);
  const binding = await mock.challenge('a', walletKey);
  const proof = await signer().sign(binding);
  clock += 61_000;
  const forged = JSON.parse(JSON.stringify(binding));
  forged.challenge.expires_at = '2099-01-01T00:00:00Z';
  await assert.rejects(mock.verify(forged, proof), e => e.code === 'challenge_expired');
  assert.equal((await mock.status('a')).linked, false);
});
