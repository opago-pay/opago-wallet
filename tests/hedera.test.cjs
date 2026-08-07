'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  AccountId,
  Hbar,
  PrivateKey,
  TransactionId,
  TransferTransaction,
} = require('@hiero-ledger/sdk');

process.env.NODE_ENV = 'test';
process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP = 'true';
process.env.EXPO_PUBLIC_HEDERA_NETWORK = 'testnet';
process.env.EXPO_PUBLIC_HEDERA_MAX_TEST_TRANSFER_HBAR = '1';
require('./register-typescript.cjs');

const { deriveHederaPrivateKey } = require('../lib/wallet-keys.ts');
const {
  buildHederaReceiveRequest,
  findHederaTestnetAccount,
  formatTinybars,
  loadHederaHistory,
  loadHederaTransactionStatus,
  normalizeHederaPublicKey,
  parseHbarToTinybars,
  parseHederaPaymentRequest,
  parseHederaTestTransferTinybars,
} = require('../lib/hedera.ts');
const { parseOperatorKey } = require('../scripts/hedera-provision-testnet.cjs');

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const RAW_PUBLIC_KEY =
  '793af21fd5a0a7cc1076195263717fab12600496dfc7ad49e902acdd0bf22331';
const DER_PUBLIC_KEY = '302a300506032b6570032100' + RAW_PUBLIC_KEY;

test('normalizes Hedera Ed25519 public keys and rejects other algorithms', () => {
  assert.equal(normalizeHederaPublicKey(RAW_PUBLIC_KEY), RAW_PUBLIC_KEY);
  assert.equal(normalizeHederaPublicKey(DER_PUBLIC_KEY), RAW_PUBLIC_KEY);
  assert.throws(
    () => normalizeHederaPublicKey(PrivateKey.generateECDSA().publicKey),
    /Ed25519/i,
  );
});

test('parses 0x-prefixed MetaMask operator keys explicitly as ECDSA', () => {
  const generated = PrivateKey.generateECDSA();
  const parsed = parseOperatorKey('0x' + generated.toStringRaw());
  assert.equal(parsed.publicKey.toStringRaw(), generated.publicKey.toStringRaw());

  const previousType = process.env.HEDERA_OPERATOR_KEY_TYPE;
  delete process.env.HEDERA_OPERATOR_KEY_TYPE;
  assert.throws(() => parseOperatorKey(generated.toStringRaw()), /ambiguous/i);
  if (previousType === undefined) delete process.env.HEDERA_OPERATOR_KEY_TYPE;
  else process.env.HEDERA_OPERATOR_KEY_TYPE = previousType;
});

test('parses exact bounded HBAR test-transfer amounts without floating point', () => {
  assert.equal(parseHederaTestTransferTinybars('0.00000001'), 1n);
  assert.equal(parseHederaTestTransferTinybars('0.01'), 1_000_000n);
  assert.equal(parseHederaTestTransferTinybars('1'), 100_000_000n);
  assert.throws(() => parseHederaTestTransferTinybars('0'), /greater than zero/i);
  assert.throws(() => parseHederaTestTransferTinybars('1.00000001'), /limit/i);
  assert.throws(() => parseHederaTestTransferTinybars('0.000000001'), /8 decimal/i);
  assert.throws(() => parseHederaTestTransferTinybars('1e-8'), /8 decimal/i);
});

test('finds and verifies the unique testnet account for the derived public key', async t => {
  const originalFetch = global.fetch;
  let requestedUrl = '';
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async input => {
    requestedUrl = String(input);
    return {
      redirected: false,
      url: requestedUrl,
      ok: true,
      status: 200,
      headers: { get: name => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
      text: async () =>
        JSON.stringify({
          accounts: [
            {
              account: '0.0.123456',
              deleted: false,
              balance: { balance: 123456789 },
              key: { _type: 'ED25519', key: DER_PUBLIC_KEY },
            },
          ],
        }),
    };
  };

  const account = await findHederaTestnetAccount(RAW_PUBLIC_KEY);
  assert.equal(new URL(requestedUrl).searchParams.get('account.publickey'), RAW_PUBLIC_KEY);
  assert.deepEqual(account, {
    accountId: '0.0.123456',
    publicKey: RAW_PUBLIC_KEY,
    balanceTinybars: 123456789n,
    balanceHbar: '1.23456789',
    hashscanUrl: 'https://hashscan.io/testnet/account/0.0.123456',
  });
});

test('builds and signs the same transfer shape used by the Android client', async () => {
  const privateKey = deriveHederaPrivateKey(MNEMONIC);
  const transaction = new TransferTransaction()
    .setTransactionId(TransactionId.generate(AccountId.fromString('0.0.1001')))
    .setNodeAccountIds([AccountId.fromString('0.0.3')])
    .addHbarTransfer('0.0.1001', Hbar.fromTinybars('-1000000'))
    .addHbarTransfer('0.0.1002', Hbar.fromTinybars('1000000'))
    .setMaxTransactionFee(Hbar.fromTinybars('100000000'))
    .freeze();
  const signed = await transaction.sign(privateKey);
  assert.ok(signed.toBytes().length > 0);
  assert.equal(privateKey.publicKey.toStringRaw(), RAW_PUBLIC_KEY);
});

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(filePath);
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [filePath] : [];
  });
}

test('never exposes operator, faucet, or private keys through bundled EXPO_PUBLIC variables', () => {
  const bundledRoots = ['app', 'components', 'hooks', 'lib'];
  const forbidden = /EXPO_PUBLIC_[A-Z0-9_]*(?:OPERATOR|FAUCET|PRIVATE[A-Z0-9_]*KEY)/i;
  const violations = bundledRoots
    .flatMap(root => listSourceFiles(path.join(__dirname, '..', root)))
    .filter(file => forbidden.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(violations, []);
});


test('round-trips arbitrary HBAR values as exact bigint tinybars', () => {
  const huge = 900719925474099312345n;
  assert.equal(parseHbarToTinybars(formatTinybars(huge)), huge);
  assert.equal(formatTinybars(-100000001n), '-1.00000001');
});

test('builds and validates explicit Hedera testnet receive requests', () => {
  const encoded = buildHederaReceiveRequest('0.0.123456', 12_345_678n);
  assert.equal(encoded, 'hedera:0.0.123456?network=testnet&amount=0.12345678');
  assert.deepEqual(parseHederaPaymentRequest(encoded), {
    accountId: '0.0.123456',
    amountTinybars: 12_345_678n,
    network: 'testnet',
  });
  assert.equal(parseHederaPaymentRequest('0.0.123456').amountTinybars, null);
  assert.throws(
    () => parseHederaPaymentRequest('hedera:0.0.123456?network=mainnet'),
    /testnet/i,
  );
  assert.throws(
    () => parseHederaPaymentRequest('hedera:0.0.123456?amount=0.1&amount=0.2'),
    /duplicate/i,
  );
});

test('preserves Mirror Node int64 values and derives exact HBAR history', async t => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async input => {
    const url = new URL(String(input));
    const body = url.pathname === '/api/v1/accounts'
      ? '{"accounts":[{"account":"0.0.123456","deleted":false,"balance":{"balance":900719925474099312345},"key":{"_type":"ED25519","key":"' + DER_PUBLIC_KEY + '"}}]}'
      : '{"transactions":[{"charged_tx_fee":100000,"consensus_timestamp":"1700000000.123456789","name":"CRYPTOTRANSFER","nonce":0,"result":"SUCCESS","scheduled":false,"transaction_id":"0.0.123456-1700000000-123456789","transfers":[{"account":"0.0.123456","amount":-200100000},{"account":"0.0.654321","amount":200000000},{"account":"0.0.3","amount":100000}]}]}';
    return {
      redirected: false,
      ok: true,
      status: 200,
      headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      text: async () => body,
    };
  };

  const account = await findHederaTestnetAccount(RAW_PUBLIC_KEY);
  assert.equal(account.balanceTinybars, 900719925474099312345n);
  const history = await loadHederaHistory('0.0.123456');
  assert.equal(history.length, 1);
  assert.equal(history[0].direction, 'sent');
  assert.equal(history[0].amountTinybars, 200000000n);
  assert.equal(history[0].feeTinybars, 100000n);
  assert.equal(history[0].amountHbar, '2');
  assert.equal(history[0].counterpartyAccountId, '0.0.654321');
  assert.match(history[0].hashscanUrl, /^https:\/\/hashscan\.io\/testnet\/transaction\//);
});

test('reports pending and final Mirror Node transaction states', async t => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => ({
    redirected: false,
    ok: false,
    status: 404,
    headers: { get: () => 'application/json' },
    text: async () => '{}',
  });
  const id = '0.0.123456@1700000000.123456789';
  assert.equal((await loadHederaTransactionStatus(id)).state, 'pending');

  global.fetch = async () => ({
    redirected: false,
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () =>
      '{"transactions":[{"consensus_timestamp":"1700000001.000000001","name":"CRYPTOTRANSFER","nonce":0,"result":"SUCCESS","transaction_id":"0.0.123456-1700000000-123456789","transfers":[]}]}',
  });
  const status = await loadHederaTransactionStatus(id);
  assert.equal(status.state, 'success');
  assert.equal(status.result, 'SUCCESS');
});
