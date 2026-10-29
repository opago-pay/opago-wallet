'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const lifecycle = require('../lib/opago/account-wallet-lifecycle-preview.ts');
const uuid = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
test('both lifecycle previews default off and expose mock-only adapters', () => {
  assert.equal(lifecycle.ACCOUNT_DELETION_PREVIEW_ENABLED, false);
  assert.equal(lifecycle.WALLET_DETACH_PREVIEW_ENABLED, false);
  assert.equal(new lifecycle.MockAccountLifecycleAdapter().mode, 'mock-only');
  assert.equal(new lifecycle.MockWalletDetachAdapter(uuid(1), uuid(2), 1).mode, 'mock-only');
});
test('account deletion returns receipt with 30-day schedule and status uses receipt token', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockAccountLifecycleAdapter(() => now, (() => { let n = 1; return () => uuid(n++); })());
  const receipt = await adapter.deleteAccount({ accountBearer: 'mock', authTime: now, idempotencyKey: uuid(20), hpkeEnvelope: true });
  assert.equal(receipt.status, 'deletion_pending');
  assert.equal(Date.parse(receipt.scheduled_delete_at) - Date.parse(receipt.requested_at), 30 * 86400000);
  assert.equal((await adapter.deletionStatus(receipt.deletion_id, receipt.receipt_token)).status, 'deletion_pending');
  await assert.rejects(adapter.deletionStatus(receipt.deletion_id, 'wrong-token'), e => e.code === 'receipt_expired' && e.status === 410);
  assert.equal(adapter.calls[0].method, 'DELETE');
  assert.equal(adapter.calls[0].path, '/api/v2/account');
});
test('account deletion requires fresh auth and supports cancellation during grace period', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockAccountLifecycleAdapter(() => now, () => uuid(30));
  await assert.rejects(adapter.deleteAccount({ accountBearer: 'mock', authTime: now - 301000, idempotencyKey: uuid(31), hpkeEnvelope: true }),
    e => e.code === 'account_not_fresh' && e.status === 403);
  const receipt = await adapter.deleteAccount({ accountBearer: 'mock', authTime: now, idempotencyKey: uuid(32), hpkeEnvelope: true });
  const result = await adapter.cancelDeletion({ deletionId: receipt.deletion_id, accountBearer: 'mock', authTime: now, idempotencyKey: uuid(33) });
  assert.equal(result.status, 'deletion_cancelled');
});
test('account deletion is idempotent and rejects conflicting reuse', async () => {
  const now = Date.now();
  const adapter = new lifecycle.MockAccountLifecycleAdapter(() => now, (() => { let n = 40; return () => uuid(n++); })());
  const args = { accountBearer: 'mock', authTime: now, idempotencyKey: uuid(41), hpkeEnvelope: true };
  const first = await adapter.deleteAccount(args);
  assert.deepEqual(await adapter.deleteAccount(args), first);
  await assert.rejects(adapter.deleteAccount({ ...args, idempotencyKey: 'not-a-uuid' }), e => e.code === 'idempotency_conflict');
});
test('wallet detach requires fresh account auth and wallet proof; successful detach disables payments', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(50), uuid(51), 7, () => now, (() => { let n = 52; return () => uuid(n++); })());
  const challenge = await adapter.challenge();
  assert.equal(challenge.action, 'wallet_detach');
  assert.deepEqual(challenge.action_params, { wallet_id: uuid(50), party_id: uuid(51), account_generation: 7 });
  const proof = await adapter.verify(challenge, true);
  await assert.rejects(adapter.detach({ accountBearer: 'mock', authTime: now - 301000, proofToken: proof.proof_token,
    installationId: uuid(53), idempotencyKey: uuid(54), signatureVerified: true }), e => e.code === 'account_not_fresh');
  const result = await adapter.detach({ accountBearer: 'mock', authTime: now, proofToken: proof.proof_token,
    installationId: uuid(53), idempotencyKey: uuid(54), signatureVerified: true });
  assert.equal(result.status, 'unbound');
  assert.equal(result.payments_enabled, false);
  assert.ok(result.evidence_id);
  await assert.rejects(adapter.detach({ accountBearer: 'mock', authTime: now, proofToken: proof.proof_token,
    installationId: uuid(53), idempotencyKey: uuid(55), signatureVerified: true }), e => e.code === 'proof_replayed');
});
test('wallet detach rejects invalid or expired proof and records challenge, verify, detach routes', async () => {
  let now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(60), uuid(61), 1, () => now, () => uuid(62));
  const challenge = await adapter.challenge();
  await assert.rejects(adapter.verify(challenge, false), e => e.code === 'proof_invalid' && e.status === 403);
  now += 61000;
  await assert.rejects(adapter.verify(challenge, true), e => e.code === 'proof_expired' && e.status === 410);
  assert.deepEqual(adapter.calls.map(call => call.path), ['/api/v2/wallet/auth/challenge']);
});

test('DELETE retry with the same key returns the original receipt after cancellation', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockAccountLifecycleAdapter(() => now, (() => { let n = 70; return () => uuid(n++); })());
  const args = { accountBearer: 'mock', authTime: now, idempotencyKey: uuid(71), hpkeEnvelope: true };
  const receipt = await adapter.deleteAccount(args);
  await adapter.cancelDeletion({ deletionId: receipt.deletion_id, accountBearer: 'mock', authTime: now, idempotencyKey: uuid(72) });
  assert.deepEqual(await adapter.deleteAccount(args), receipt);
  assert.equal((await adapter.deletionStatus(receipt.deletion_id, receipt.receipt_token)).status, 'deletion_cancelled');
});
test('cancel retry with the same key returns the original success after status changed', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockAccountLifecycleAdapter(() => now, (() => { let n = 80; return () => uuid(n++); })());
  const receipt = await adapter.deleteAccount({ accountBearer: 'mock', authTime: now, idempotencyKey: uuid(81), hpkeEnvelope: true });
  const args = { deletionId: receipt.deletion_id, accountBearer: 'mock', authTime: now, idempotencyKey: uuid(82) };
  const first = await adapter.cancelDeletion(args);
  assert.deepEqual(await adapter.cancelDeletion(args), first);
  await assert.rejects(adapter.cancelDeletion({ ...args, idempotencyKey: uuid(83) }), e => e.code === 'deletion_not_cancellable');
});
test('detach accepts only a randomly issued verify token and caches identical retries before proof replay', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(90), uuid(91), 2, () => now, (() => { let n = 92; return () => uuid(n++); })());
  const challenge = await adapter.challenge();
  const guessed = 'mock-proof-' + challenge.challenge_id;
  await assert.rejects(adapter.detach({ accountBearer: 'mock', authTime: now, proofToken: guessed,
    installationId: uuid(93), idempotencyKey: uuid(94), signatureVerified: true }), e => e.code === 'proof_invalid');
  const verified = await adapter.verify(challenge, true);
  assert.notEqual(verified.proof_token, guessed);
  const args = { accountBearer: 'mock', authTime: now, proofToken: verified.proof_token,
    installationId: uuid(93), idempotencyKey: uuid(94), signatureVerified: true };
  const first = await adapter.detach(args);
  assert.deepEqual(await adapter.detach(args), first);
  await assert.rejects(adapter.detach({ ...args, idempotencyKey: uuid(95) }), e => e.code === 'proof_replayed');
});
test('all new lifecycle UI strings have genuine translations in de/fr/es/it', () => {
  const { accountWalletLifecycleMessages } = require('../lib/i18n/account-wallet-lifecycle-messages.ts');
  for (const language of ['de', 'fr', 'es', 'it']) {
    const messages = accountWalletLifecycleMessages(language);
    for (const key of ['Wallet detach failed', 'Unlink wallet', 'Unlink wallet?', 'Wallet detached (mock). Payments are disabled.',
      'Account deletion preview is disabled.', 'Wallet detach preview is disabled.']) {
      assert.ok(messages[key] && messages[key] !== key, language + ': ' + key);
    }
  }
});
test('legacy deletion preview export and settings/screen use one default-off flag', () => {
  const legacy = require('../lib/opago/account-deletion-preview.ts');
  assert.equal(legacy.ACCOUNT_DELETION_PREVIEW_ENABLED, lifecycle.ACCOUNT_DELETION_PREVIEW_ENABLED);
  assert.equal(lifecycle.ACCOUNT_DELETION_PREVIEW_ENABLED, false);
});
