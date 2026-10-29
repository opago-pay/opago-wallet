'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { schnorr } = require('@noble/curves/secp256k1');
require('./register-typescript.cjs');
const { signWalletAuthChallenge } = require('../lib/wallet-auth-proof.ts');
const { MockAccountLinkAdapter, LinkPreviewError, linkWithSparkProof, ACCOUNT_LINK_PREVIEW_ENABLED } = require('../lib/opago/account-link-preview.ts');
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
