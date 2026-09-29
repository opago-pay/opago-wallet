'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { schnorr } = require('@noble/curves/secp256k1');
const { DefaultSparkSigner } = require('@buildonspark/spark-sdk');
const vectors = require('../docs/lnurl-spark-contracts/v2/fixtures/wallet-auth-vectors.json').vectors;
require('./register-typescript.cjs');
const { walletAuthChallengeDigest, signWalletAuthChallenge } = require('../lib/wallet-auth-proof.ts');

const challengeId = '00000000-0000-4000-8000-000000000004';
const installationId = '00000000-0000-4000-8000-000000000003';
const sample = (message) => ({ challenge_id: challengeId, message, expires_at: '2026-09-28T12:05:00Z' });
const atIssue = Date.parse('2026-09-28T12:01:00Z');

test('F3 login and account binding match the contract 0.2.0 message hashes', () => {
  for (const vector of vectors.filter(v => v.action === 'login' || v.action === 'wallet_bind')) {
    const digest = walletAuthChallengeDigest(
      sample(vector.message),
      { action: vector.action, action_params: vector.action_params },
      'mainnet', Buffer.from(vector.compressed_public_key_hex, 'hex'), atIssue,
    );
    assert.equal(Buffer.from(digest).toString('hex'), vector.msg32_hex);
  }
});

test('F3 refuses changed action, account, identity, network, lifetime, and installation', async () => {
  const vector = vectors.find(v => v.action === 'wallet_bind');
  const pubkey = Buffer.from(vector.compressed_public_key_hex, 'hex');
  const intent = { action: 'wallet_bind', action_params: vector.action_params };
  const base = sample(vector.message);
  const reject = (challenge, requested = intent, network = 'mainnet', now = atIssue) =>
    assert.throws(() => walletAuthChallengeDigest(challenge, requested, network, pubkey, now));
  reject(base, { action: 'wallet_bind', action_params: { ...intent.action_params, account_generation: 2 } });
  reject(base, { action: 'wallet_bind', action_params: { ...intent.action_params, party_id: challengeId } });
  reject(base, { action: 'login', action_params: {} });
  reject(base, intent, 'regtest');
  reject({ ...base, message: base.message.replace('wallet_pubkey: 02', 'wallet_pubkey: 03') });
  reject({ ...base, message: base.message + '\n' });
  reject({ ...base, expires_at: '2026-09-28T12:06:00Z' });
  reject(base, intent, 'mainnet', Date.parse('2026-09-28T12:05:00Z'));
  let signCalls = 0;
  const signer = {
    async getIdentityPublicKey() { return pubkey; },
    async signSchnorrWithIdentityKey() { signCalls++; return new Uint8Array(64); },
  };
  await assert.rejects(signWalletAuthChallenge(signer, base, { action: 'login', action_params: {} }, 'mainnet', installationId, atIssue));
  await assert.rejects(signWalletAuthChallenge(signer, base, intent, 'mainnet', 'bad-id', atIssue));
  assert.equal(signCalls, 0);
});

test('Spark SDK 0.7.12 signs the exact F3 digest and produces a verify payload', async () => {
  const signer = new DefaultSparkSigner();
  const seed = Buffer.alloc(64, 0x37); // Public synthetic test seed only.
  await signer.createSparkWalletFromSeed(seed, 1);
  seed.fill(0);
  const pubkey = await signer.getIdentityPublicKey();
  const fixture = vectors.find(v => v.action === 'login');
  const message = fixture.message.replace(fixture.compressed_public_key_hex, Buffer.from(pubkey).toString('hex'));
  const verify = await signWalletAuthChallenge(signer, sample(message),
    { action: 'login', action_params: {} }, 'mainnet', installationId, atIssue);
  assert.equal(verify.challenge_id, challengeId);
  assert.equal(verify.installation_id, installationId);
  assert.match(verify.signature, /^[0-9a-f]{128}$/);
  const digest = walletAuthChallengeDigest(sample(message), { action: 'login', action_params: {} },
    'mainnet', pubkey, atIssue);
  assert.ok(schnorr.verify(Buffer.from(verify.signature, 'hex'), digest, pubkey.subarray(1)));
});
