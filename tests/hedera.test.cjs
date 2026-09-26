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
  getHederaPaymentFeeCeilingTinybars,
  MAX_HEDERA_CHECKOUT_FEE_TINYBARS,
  MAX_HEDERA_DIRECT_TRANSFER_FEE_TINYBARS,
} = require('../lib/hedera/config.ts');
const { findNewConfirmedIncomingHederaTransaction, findHederaTestnetAccount,
  loadHederaHistory, loadHederaTransactionStatus } = require('../lib/hedera/account.ts');
const { normalizeHederaPublicKey } = require('../lib/hedera/keys.ts');
const { buildHederaReceiveRequest, buildHederaWalletQrValue, formatTinybars,
  parseHbarToTinybars, parseHederaPaymentRequest, parseHederaTestTransferTinybars } = require('../lib/hedera/payments.ts');
const {
  assertOperatorKeyMatchesAccount,
  parseOperatorKey,
} = require('../scripts/hedera-provision-testnet.cjs');

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const RAW_PUBLIC_KEY =
  '793af21fd5a0a7cc1076195263717fab12600496dfc7ad49e902acdd0bf22331';
const DER_PUBLIC_KEY = '302a300506032b6570032100' + RAW_PUBLIC_KEY;
const { listHederaAccountsForKey } = require('../lib/hedera/account.ts');

test('activation alias preserves the recovered Ed25519 key through SDK transfer serialization', () => {
  const { buildHederaActivationAlias } = require('../lib/hedera/keys.ts');
  const key = deriveHederaPrivateKey(MNEMONIC).publicKey;
  const alias = buildHederaActivationAlias(key);
  assert.equal(alias, buildHederaActivationAlias(key.toStringRaw()));
  assert.equal(alias, buildHederaActivationAlias(key.toStringDer()));
  assert.equal(AccountId.fromString(alias).aliasKey.toStringRaw(), key.toStringRaw());
  const transaction = new TransferTransaction()
    .addHbarTransfer('0.0.1234', Hbar.fromTinybars(-100))
    .addHbarTransfer(alias, Hbar.fromTinybars(100))
    .setNodeAccountIds([AccountId.fromString('0.0.3')])
    .setTransactionId(TransactionId.generate('0.0.1234'))
    .freeze();
  const decoded = TransferTransaction.fromBytes(transaction.toBytes());
  assert.equal(decoded.hbarTransfers.get(AccountId.fromString(alias)).toTinybars().toString(), '100');
  assert.throws(() => buildHederaActivationAlias('not-a-key'));
  assert.throws(() => buildHederaActivationAlias(PrivateKey.generateECDSA().publicKey), /Ed25519/i);
});

test('activation discovery distinguishes missing, unfunded, duplicate and unavailable accounts', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let accounts = [];
  let status = 200;
  global.fetch = async input => ({
    redirected: false, url: String(input), ok: status === 200, status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({ accounts }),
  });
  assert.equal(await findHederaTestnetAccount(RAW_PUBLIC_KEY), null);
  const account = {
    account: '0.0.123456', deleted: false, balance: { balance: 0 },
    key: { _type: 'ED25519', key: DER_PUBLIC_KEY },
  };
  accounts = [account];
  assert.equal((await findHederaTestnetAccount(RAW_PUBLIC_KEY)).balanceTinybars, 0n);
  accounts = [account, { ...account, account: '0.0.123457' }];
  await assert.rejects(findHederaTestnetAccount(RAW_PUBLIC_KEY), /unique account/i);
  accounts = [{ ...account, deleted: true }];
  assert.equal(await findHederaTestnetAccount(RAW_PUBLIC_KEY), null);
  accounts = [{ ...account, key: { key: PrivateKey.generateED25519().publicKey.toStringRaw() } }];
  assert.equal(await findHederaTestnetAccount(RAW_PUBLIC_KEY), null);
  status = 403;
  await assert.rejects(findHederaTestnetAccount(RAW_PUBLIC_KEY), /403/);
});

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

test('uses mode-specific Hedera fee ceilings that allow a funded wallet to transact', () => {
  assert.equal(MAX_HEDERA_DIRECT_TRANSFER_FEE_TINYBARS, 10_000_000n);
  assert.equal(MAX_HEDERA_CHECKOUT_FEE_TINYBARS, 75_000_000n);
  assert.equal(getHederaPaymentFeeCeilingTinybars('direct'), 10_000_000n);
  assert.equal(getHederaPaymentFeeCeilingTinybars('checkout'), 75_000_000n);
  assert.ok(1_000_000n + getHederaPaymentFeeCeilingTinybars('direct') < 100_000_000n);
  assert.ok(1_000_000n + getHederaPaymentFeeCeilingTinybars('checkout') < 100_000_000n);
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

test('Hedera account picker follows same-origin pages and rejects a foreign continuation', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const urls = [];
  const account = number => ({ account: `0.0.${number}`, deleted: false,
    balance: { balance: '100000000' }, key: { _type: 'ED25519', key: DER_PUBLIC_KEY } });
  global.fetch = async input => {
    const url = new URL(String(input));
    urls.push(url);
    const body = url.searchParams.has('page')
      ? { accounts: [account(102)], links: { next: null } }
      : { accounts: [account(101)], links: {
        next: `/api/v1/accounts?account.publickey=${RAW_PUBLIC_KEY}&balance=true&limit=100&page=2`,
      } };
    return { redirected: false, ok: true, status: 200,
      headers: { get: name => name === 'content-type' ? 'application/json' : null },
      text: async () => JSON.stringify(body) };
  };
  const matches = await listHederaAccountsForKey(RAW_PUBLIC_KEY);
  assert.deepEqual(matches.map(value => value.accountId), ['0.0.101', '0.0.102']);
  assert.equal(urls.length, 2);
  global.fetch = async () => ({ redirected: false, ok: true, status: 200,
    headers: { get: name => name === 'content-type' ? 'application/json' : null },
    text: async () => JSON.stringify({ accounts: [account(101)],
      links: { next: 'https://example.org/api/v1/accounts' } }) });
  await assert.rejects(listHederaAccountsForKey(RAW_PUBLIC_KEY), /invalid continuation/);
});

test('multiple matching Hedera accounts can be listed without selecting one silently', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async input => ({
    redirected: false, url: String(input), ok: true, status: 200,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
    text: async () => JSON.stringify({ accounts: [
      { account: '0.0.123456', deleted: false, balance: { balance: 100 }, key: { key: DER_PUBLIC_KEY } },
      { account: '0.0.123457', deleted: false, balance: { balance: 200 }, key: { key: DER_PUBLIC_KEY } },
      { account: '0.0.123458', deleted: true, balance: { balance: 300 }, key: { key: DER_PUBLIC_KEY } },
    ] }),
  });
  const matches = await listHederaAccountsForKey(RAW_PUBLIC_KEY);
  assert.deepEqual(matches.map(account => account.accountId), ['0.0.123456', '0.0.123457']);
  assert.deepEqual(matches.map(account => account.balanceTinybars), [100n, 200n]);
  await assert.rejects(findHederaTestnetAccount(RAW_PUBLIC_KEY), /more than one/i);
});

test('builds a third-party-wallet-compatible Hedera QR value', () => {
  assert.equal(buildHederaWalletQrValue(' 0.0.123456 '), '0.0.123456');
  assert.throws(() => buildHederaWalletQrValue('hedera:0.0.123456'), /account ID/i);
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

test('rejects an operator key that does not belong to the configured account', () => {
  const expected = PrivateKey.generateECDSA();
  const wrong = PrivateKey.generateECDSA();
  const mirrorAccount = { key: { key: expected.publicKey.toString() } };

  assert.doesNotThrow(() => assertOperatorKeyMatchesAccount(expected, mirrorAccount));
  assert.throws(
    () => assertOperatorKeyMatchesAccount(wrong, mirrorAccount),
    /does not match HEDERA_OPERATOR_ID.*No transaction was submitted/i,
  );
  assert.throws(
    () => assertOperatorKeyMatchesAccount(expected, { key: { key: 'invalid' } }),
    /did not return a supported public key/i,
  );
});

test('loads MetaMask HBAR receipts from Ethereum transactions', async t => {
  const originalFetch = global.fetch;
  const requestedTypes = new Set();
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async input => {
    const url = new URL(String(input));
    const transactionType = url.searchParams.get('transactiontype');
    requestedTypes.add(transactionType);
    const body = transactionType === 'ETHEREUMTRANSACTION'
      ? JSON.stringify({
          transactions: [{
            charged_tx_fee: 2_583_000,
            consensus_timestamp: '1786353644.290689104',
            name: 'ETHEREUMTRANSACTION',
            nonce: 0,
            result: 'SUCCESS',
            scheduled: false,
            transaction_id: '0.0.7314364-1786353637-092830345',
            transfers: [
              { account: '0.0.7314364', amount: -2_683_000 },
              { account: '0.0.9960666', amount: 100_000 },
              { account: '0.0.3', amount: 2_583_000 },
            ],
          }],
        })
      : JSON.stringify({ transactions: [] });
    return {
      redirected: false,
      ok: true,
      status: 200,
      headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      text: async () => body,
    };
  };

  const history = await loadHederaHistory('0.0.9960666', 10);
  assert.deepEqual(requestedTypes, new Set(['CRYPTOTRANSFER', 'ETHEREUMTRANSACTION', 'CONTRACTCALL']));
  assert.equal(history.length, 1);
  assert.equal(history[0].direction, 'received');
  assert.equal(history[0].amountTinybars, 100_000n);
  assert.equal(history[0].amountHbar, '0.001');
  assert.equal(history[0].result, 'SUCCESS');
});

test('accepts only a new successful incoming transaction with the requested amount', () => {
  const base = {
    consensusTimestamp: '1786353644.290689104',
    occurredAt: '2026-08-10T09:20:44.290Z',
    direction: 'received',
    amountTinybars: 100_000n,
    amountHbar: '0.001',
    feeTinybars: 2_583_000n,
    counterpartyAccountId: '0.0.7314364',
    result: 'SUCCESS',
    hashscanUrl: 'https://hashscan.io/testnet/transaction/example',
  };
  const history = [
    { ...base, transactionId: 'wrong-amount', amountTinybars: 1n, amountHbar: '0.00000001' },
    { ...base, transactionId: 'failed', result: 'INSUFFICIENT_ACCOUNT_BALANCE' },
    { ...base, transactionId: 'known' },
    { ...base, transactionId: 'exact-success' },
  ];

  const incoming = findNewConfirmedIncomingHederaTransaction(
    history,
    new Set(['known']),
    100_000n,
  );
  assert.equal(incoming.transactionId, 'exact-success');
  assert.equal(
    findNewConfirmedIncomingHederaTransaction(history, new Set(['known']), 200_000n),
    null,
  );
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
  global.fetch = async () => ({
    redirected: false,
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({ transactions: [{
      consensus_timestamp: '1700000001.000000002', name: 'CRYPTOTRANSFER', nonce: 0,
      result: 'UNKNOWN', transaction_id: '0.0.123456-1700000000-123456789', transfers: [],
    }] }),
  });
  const unknown = await loadHederaTransactionStatus(id);
  assert.equal(unknown.state, 'pending');
  assert.equal(unknown.result, null);
});

test('includes a native checkout child transfer received through a contract call', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async input => {
    const kind = new URL(String(input)).searchParams.get('transactiontype');
    const body = { transactions: kind === 'CONTRACTCALL' ? [{
      charged_tx_fee: '0', consensus_timestamp: '1786353644.290689104',
      name: 'CONTRACTCALL', nonce: 1, result: 'SUCCESS', scheduled: false,
      transaction_id: '0.0.7314364-1786353637-092830345',
      transfers: [{ account: '0.0.9960666', amount: '100000' }, { account: '0.0.7314364', amount: '-100000' }],
    }] : [] };
    return { redirected: false, ok: true, status: 200,
      headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      text: async () => JSON.stringify(body) };
  };
  const history = await loadHederaHistory('0.0.9960666', 10);
  assert.equal(history.length, 1);
  assert.equal(history[0].direction, 'received');
  assert.equal(history[0].amountTinybars, 100_000n);
});

test('prefers the checkout parent fee when parent and child both contain the payer', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async input => {
    const kind = new URL(String(input)).searchParams.get('transactiontype');
    const base = { name: 'CONTRACTCALL', result: 'SUCCESS', scheduled: false,
      transaction_id: '0.0.7314364-1786353637-092830345' };
    const body = { transactions: kind === 'CONTRACTCALL' ? [
      { ...base, nonce: 1, consensus_timestamp: '1786353644.290689105', charged_tx_fee: '0',
        transfers: [{ account: '0.0.7314364', amount: '-100000' }, { account: '0.0.9960666', amount: '100000' }] },
      { ...base, nonce: 0, consensus_timestamp: '1786353644.290689104', charged_tx_fee: '10000',
        transfers: [{ account: '0.0.7314364', amount: '-110000' }, { account: '0.0.9960666', amount: '100000' }, { account: '0.0.3', amount: '10000' }] },
    ] : [] };
    return { redirected: false, ok: true, status: 200,
      headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      text: async () => JSON.stringify(body) };
  };
  const history = await loadHederaHistory('0.0.7314364', 10);
  assert.equal(history.length, 1);
  assert.equal(history[0].amountTinybars, 100_000n);
  assert.equal(history[0].feeTinybars, 10_000n);
});
