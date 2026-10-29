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
  assert.ok(Date.parse(receipt.receipt_expires_at) > Date.parse(receipt.scheduled_delete_at));
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
  const challenge = await adapter.challenge(uuid(53), uuid(353));
  assert.equal(challenge.action, 'wallet_detach');
  assert.deepEqual(challenge.action_params, { wallet_id: uuid(50), party_id: uuid(51), account_generation: 7 });
  const proof = await adapter.verify(challenge, true, uuid(56));
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
  const challenge = await adapter.challenge(uuid(63), uuid(363));
  await assert.rejects(adapter.verify(challenge, false, uuid(64)), e => e.code === 'signature_invalid' && e.status === 401);
  now += 301000;
  await assert.rejects(adapter.verify(challenge, true, uuid(64)), e => e.code === 'challenge_invalid' && e.status === 401);
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
  const challenge = await adapter.challenge(uuid(93), uuid(393));
  const guessed = 'mock-proof-' + challenge.challenge_id;
  await assert.rejects(adapter.detach({ accountBearer: 'mock', authTime: now, proofToken: guessed,
    installationId: uuid(93), idempotencyKey: uuid(94), signatureVerified: true }), e => e.code === 'proof_invalid');
  const verified = await adapter.verify(challenge, true, uuid(96));
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

test('deletion receipt remains valid after finalization so deleted status is observable', async () => {
  let now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockAccountLifecycleAdapter(() => now, (() => { let n = 100; return () => uuid(n++); })());
  const receipt = await adapter.deleteAccount({ accountBearer: 'mock', authTime: now, idempotencyKey: uuid(101), hpkeEnvelope: true });
  now = Date.parse(receipt.scheduled_delete_at);
  adapter.finalizeDeletion();
  assert.equal((await adapter.deletionStatus(receipt.deletion_id, receipt.receipt_token)).status, 'deleted');
});
test('wallet detach navigation remains behind the default-off flag', () => {
  const fs = require('node:fs');
  const menu = fs.readFileSync(require('node:path').join(__dirname, '../components/settings/settings-menu.tsx'), 'utf8');
  const settings = fs.readFileSync(require('node:path').join(__dirname, '../app/(tabs)/settings.tsx'), 'utf8');
  assert.match(menu, /WALLET_DETACH_PREVIEW_ENABLED && props\.onOpenWalletDetachPreview/);
  assert.match(settings, /onOpenWalletDetachPreview=\{\(\) => router\.push\('\/wallet-detach-preview'\)\}/);
  assert.equal(lifecycle.WALLET_DETACH_PREVIEW_ENABLED, false);
});

test('each verified wallet proof remains valid for 300 seconds after verify even when challenge expires', async () => {
  let now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(120), uuid(121), 3, () => now, (() => { let n = 122; return () => uuid(n++); })());
  const challenge = await adapter.challenge(uuid(123), uuid(423));
  now += 299_000;
  const proof = await adapter.verify(challenge, true, uuid(126));
  now += 2_000;
  const result = await adapter.detach({ accountBearer: 'mock', authTime: now, proofToken: proof.proof_token,
    installationId: uuid(123), idempotencyKey: uuid(124), signatureVerified: true });
  assert.equal(result.status, 'unbound');
});
test('verified wallet proof expires 300 seconds after verify, independently of challenge expiry', async () => {
  let now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(130), uuid(131), 4, () => now, (() => { let n = 132; return () => uuid(n++); })());
  const challenge = await adapter.challenge(uuid(133), uuid(433));
  const proof = await adapter.verify(challenge, true, uuid(136));
  now += 300_000;
  await assert.rejects(adapter.detach({ accountBearer: 'mock', authTime: now, proofToken: proof.proof_token,
    installationId: uuid(133), idempotencyKey: uuid(134), signatureVerified: true }), e => e.code === 'proof_expired' && e.status === 410);
});
test('deletion receipts remain independently addressable after cancel and a new deletion', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockAccountLifecycleAdapter(() => now, (() => { let n = 140; return () => uuid(n++); })());
  const firstArgs = { accountBearer: 'mock', authTime: now, idempotencyKey: uuid(141), hpkeEnvelope: true };
  const first = await adapter.deleteAccount(firstArgs);
  await adapter.cancelDeletion({ deletionId: first.deletion_id, accountBearer: 'mock', authTime: now, idempotencyKey: uuid(142) });
  const second = await adapter.deleteAccount({ ...firstArgs, idempotencyKey: uuid(143) });
  assert.notEqual(second.deletion_id, first.deletion_id);
  assert.equal((await adapter.deletionStatus(first.deletion_id, first.receipt_token)).status, 'deletion_cancelled');
  assert.equal((await adapter.deletionStatus(second.deletion_id, second.receipt_token)).status, 'deletion_pending');
  assert.deepEqual(await adapter.deleteAccount(firstArgs), first);
  assert.equal((await adapter.deletionStatus(first.deletion_id, first.receipt_token)).status, 'deletion_cancelled');
});

test('verify requires UUID idempotency key and identical retries return same proof', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(160), uuid(161), 1, () => now, (() => { let n = 162; return () => uuid(n++); })());
  const challenge = await adapter.challenge(uuid(163), uuid(463));
  await assert.rejects(adapter.verify(challenge, true, 'bad-key'), e => e.code === 'invalid_request' && e.status === 400);
  const first = await adapter.verify(challenge, true, uuid(164));
  assert.deepEqual(await adapter.verify(challenge, true, uuid(164)), first);
  await assert.rejects(adapter.verify(challenge, true, uuid(165)), e => e.code === 'challenge_invalid' && e.status === 401);
});
test('detach proof is bound to the installation ID from its challenge', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(170), uuid(171), 1, () => now, (() => { let n = 172; return () => uuid(n++); })());
  const installationId = uuid(173);
  const challenge = await adapter.challenge(installationId, uuid(178));
  const proof = await adapter.verify(challenge, true, uuid(174));
  await assert.rejects(adapter.detach({ accountBearer: 'mock', authTime: now, proofToken: proof.proof_token,
    installationId: uuid(175), idempotencyKey: uuid(176), signatureVerified: true }),
    e => e.code === 'proof_invalid' && e.status === 403);
  const result = await adapter.detach({ accountBearer: 'mock', authTime: now, proofToken: proof.proof_token,
    installationId, idempotencyKey: uuid(177), signatureVerified: true });
  assert.equal(result.status, 'unbound');
});

test('detach challenge nonces are single-use while distinct outstanding challenges can verify', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(180), uuid(181), 1, () => now, (() => { let n = 182; return () => uuid(n++); })());
  const first = await adapter.challenge(uuid(183), uuid(483));
  const second = await adapter.challenge(uuid(184), uuid(484));
  assert.notEqual(first.nonce, second.nonce);
  const firstProof = await adapter.verify(first, true, uuid(185));
  assert.ok(firstProof.proof_token);
  await assert.rejects(adapter.verify(first, true, uuid(186)), e => e.code === 'challenge_invalid' && e.status === 401);
  const secondProof = await adapter.verify(second, true, uuid(187));
  assert.ok(secondProof.proof_token);
});
test('detach challenge issuance is limited to five outstanding challenges per wallet', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(190), uuid(191), 1, () => now, (() => { let n = 192; return () => uuid(n++); })());
  for (let i = 0; i < 5; i++) await adapter.challenge(uuid(200 + i), uuid(600 + i));
  await assert.rejects(adapter.challenge(uuid(206), uuid(606)), e => e.code === 'rate_limited' && e.status === 429);
});

test('detach challenge matches protocol message fields and binds installation', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const installationId = uuid(220);
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(221), uuid(222), 5, () => now, (() => { let n = 223; return () => uuid(n++); })(), 'regtest');
  const challenge = await adapter.challenge(installationId, uuid(218));
  assert.equal(challenge.installation_id, installationId);
  assert.equal(challenge.network, 'regtest');
  assert.match(challenge.wallet_pubkey, /^(02|03)[0-9a-f]{64}$/);
  assert.match(challenge.nonce, /^[0-9a-f]{64}$/);
  assert.deepEqual(challenge.message.split('\n').map(line => line.split(':')[0]), [
    'opago-wallet-auth', 'domain', 'network', 'wallet_pubkey', 'nonce', 'issued_at', 'expires_at', 'action', 'action_params_sha256',
  ]);
  assert.equal(challenge.message.split('\n')[7], 'action: wallet_detach');
});
test('verify idempotency key conflicts if reused for a different challenge', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(230), uuid(231), 1, () => now, (() => { let n = 232; return () => uuid(n++); })());
  const first = await adapter.challenge(uuid(233), uuid(533));
  const second = await adapter.challenge(uuid(234), uuid(534));
  await adapter.verify(first, true, uuid(235));
  await assert.rejects(adapter.verify(second, true, uuid(235)), e => e.code === 'idempotency_conflict' && e.status === 409);
});

test('challenge issuance requires a UUID idempotency key and replays the original challenge', async () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const adapter = new lifecycle.MockWalletDetachAdapter(uuid(240), uuid(241), 1, () => now, (() => { let n = 242; return () => uuid(n++); })());
  await assert.rejects(adapter.challenge(uuid(243), 'bad-key'), e => e.code === 'invalid_request' && e.status === 400);
  const first = await adapter.challenge(uuid(243), uuid(244));
  assert.deepEqual(await adapter.challenge(uuid(243), uuid(244)), first);
  await assert.rejects(adapter.challenge(uuid(245), uuid(244)), e => e.code === 'idempotency_conflict' && e.status === 409);
});
