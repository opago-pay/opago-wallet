'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
require('./register-typescript.cjs');
const { resolveHederaBuildPolicy } = require('../lib/config.ts');

test('Mainnet explicitly opts into balance-based transfers and rejects invalid limit settings', () => {
  const policy = {
    network: 'mainnet', buildProfile: 'mainnet', mainnetEnabled: true,
    maxTransferHbar: 'balance', checkoutContractId: '0.0.123456',
    checkoutRuntimeSha256: 'a'.repeat(64),
  };
  assert.equal(resolveHederaBuildPolicy(policy).maxTransferHbar, 'balance');
  assert.equal(require('../eas.json').build.production.env.EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR, 'balance');
  for (const invalid of [undefined, '', '0', '-1', 'unlimited', 'Balance', '1.000000001', 'Infinity']) {
    assert.throws(() => resolveHederaBuildPolicy({ ...policy, maxTransferHbar: invalid }), /MAX_TRANSFER_HBAR/);
  }
  assert.equal(resolveHederaBuildPolicy({ ...policy, maxTransferHbar: '1' }).maxTransferHbar, '1');
});

test('balance-based Mainnet prepares 2 HBAR and preserves fees, authorization and exact SDK amounts', () => {
  // A fresh process exercises the real build configuration, isolated from capped testnet tests.
  execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    require('./tests/register-typescript.cjs');
    global.fetch = async () => { throw new Error('Network access is disabled in this regression test.'); };
    const { AccountId, PrivateKey, TransferTransaction } = require('@hiero-ledger/sdk');
    const { parseHederaTransferTinybars, parseHederaPaymentRequest, assertHederaPaymentBalance, sendHederaTransfer } = require('./lib/hedera/payments.ts');
    const amount = parseHederaTransferTinybars('2.0');
    assert.equal(amount, 200000000n);
    assert.equal(parseHederaPaymentRequest('0.0.123456').accountId, '0.0.123456');
    assert.equal(parseHederaPaymentRequest('hedera:0.0.123456?network=mainnet&amount=2').amountTinybars, amount);
    assertHederaPaymentBalance(amount, 238690992n, 'direct');
    assertHederaPaymentBalance(228690992n, 238690992n, 'direct');
    assert.throws(() => assertHederaPaymentBalance(228690993n, 238690992n, 'direct'), /Insufficient HBAR/);
    assert.throws(() => assertHederaPaymentBalance(amount, 238690992n, 'checkout'), /Insufficient HBAR/);
    assertHederaPaymentBalance(amount, 275000000n, 'checkout');
    assert.throws(() => assertHederaPaymentBalance(amount, 209999999n, 'direct'), /Insufficient HBAR/);
    assert.throws(() => assertHederaPaymentBalance(amount, 0n, 'direct'), /Insufficient HBAR/);
    assert.throws(() => assertHederaPaymentBalance(-1n, 238690992n, 'direct'), /greater than zero/);
    assert.equal(parseHederaTransferTinybars('1000000.00000001'), 100000000000001n);
    assert.equal(parseHederaTransferTinybars('92233720368.54775807'), 9223372036854775807n);
    assert.throws(() => parseHederaTransferTinybars('92233720368.54775808'), /supported transfer range/);
    const events = [];
    TransferTransaction.prototype.execute = async function () {
      events.push('execute');
      assert.equal(this.hbarTransfers.get(AccountId.fromString('0.0.123456')).toTinybars().toString(), '200000000');
      assert.equal(this.hbarTransfers.get(AccountId.fromString('0.0.654321')).toTinybars().toString(), '-200000000');
      assert.equal(this.maxTransactionFee.toTinybars().toString(), '10000000');
      return { getReceiptQuery: () => ({ setValidateStatus: () => ({ execute: async () => ({ status: { toString: () => 'SUCCESS' } }) }) }) };
    };
    (async () => {
      const input = {
        sourceAccountId: '0.0.654321', recipientAccountId: '0.0.123456', amountTinybars: amount,
        privateKey: PrivateKey.generateED25519(),
        assertAuthorized: () => { events.push('authorized'); },
        lifecycle: { onSubmitted: async () => { events.push('journal'); } },
      };
      assert.equal((await sendHederaTransfer(input)).amountHbar, '2');
      assert.deepEqual(events, ['journal', 'authorized', 'execute']);
      events.length = 0;
      await assert.rejects(sendHederaTransfer({ ...input, assertAuthorized: () => { throw new Error('Wallet locked'); } }), /Wallet locked/);
      assert.deepEqual(events, ['journal']);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], {
    cwd: path.resolve(__dirname, '..'), stdio: 'pipe', timeout: 30_000,
    env: {
      ...process.env, NODE_ENV: 'test',
      EXPO_PUBLIC_ENABLE_MAINNET: 'false', EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET: 'false',
      EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE: 'regtest', EXPO_PUBLIC_ENABLE_HEDERA_MAINNET: 'true',
      EXPO_PUBLIC_HEDERA_NETWORK: 'mainnet', EXPO_PUBLIC_HEDERA_BUILD_PROFILE: 'mainnet',
      EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL: 'https://mainnet.mirrornode.hedera.com',
      EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR: 'balance', EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID: '0.0.123456',
      EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256: 'a'.repeat(64),
    },
  });
});
