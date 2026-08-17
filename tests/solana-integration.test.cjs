'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const bs58Module = require('bs58');
const { PublicKey } = require('@solana/web3.js');

require('./register-typescript.cjs');

const { appConfig } = require('../lib/config.ts');

const {
  formatBaseUnits,
  formatSolanaAssetAmount,
  parseDecimalBaseUnits,
  parseRpcAtomicAmount,
  parseSolanaAssetAmount,
} = require('../lib/solana/amounts.ts');
const {
  buildSolanaReceiveRequest,
  parseSolanaPaymentRequest,
} = require('../lib/solana/requests.ts');
const {
  getNativeTransferDeltaLamports,
  getTokenTransferDeltaBaseUnits,
} = require('../lib/solana/account.ts');
const {
  createSolanaPaymentJournal,
  SOLANA_PAYMENT_JOURNAL_KEY,
} = require('../lib/solana/payment-journal.ts');
const {
  getSolanaAccountExplorerUrl,
  getSolanaTransactionExplorerUrl,
  parseSolanaSignature,
} = require('../lib/solana/explorer.ts');

const bs58 = bs58Module.default || bs58Module;
const RECIPIENT = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const OTHER = '7YttLkHDoNj9wyDur5ztoNnpVfDKp6p1sV4Mq4UGTUTT';
const SIGNATURE = bs58.encode(Uint8Array.from({ length: 64 }, (_, index) => index + 1));

test('pins the official Circle USDC mint to Solana devnet', () => {
  assert.equal(appConfig.usdcMint, '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
});

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

test('parses and formats SOL and USDC without floating-point arithmetic', () => {
  assert.equal(parseSolanaAssetAmount('1.000000001', 'SOL'), 1_000_000_001n);
  assert.equal(parseSolanaAssetAmount('0,000001', 'USDC'), 1n);
  assert.equal(formatSolanaAssetAmount(9_007_199_254_740_993n, 'SOL'), '9007199.254740993');
  assert.equal(formatBaseUnits(1_230_000n, 6), '1.23');
  assert.equal(parseDecimalBaseUnits('12', 0, 'Units'), 12n);
  assert.equal(parseRpcAtomicAmount('900719925474099312345', 'RPC value'), 900719925474099312345n);
  assert.throws(() => parseSolanaAssetAmount('0.0000000001', 'SOL'), /at most 9/i);
  assert.throws(() => parseSolanaAssetAmount('1e-9', 'SOL'), /positive decimal/i);
  assert.throws(() => parseRpcAtomicAmount(9_007_199_254_740_992, 'RPC value'), /exact/i);
});

test('parses plain addresses and contract-free Solana Pay requests exactly', () => {
  const plain = parseSolanaPaymentRequest(RECIPIENT, 'SOL');
  assert.equal(plain.recipientAddress, RECIPIENT);
  assert.equal(plain.amountBaseUnits, null);

  const request = parseSolanaPaymentRequest(
    `solana:${RECIPIENT}?amount=0.125000001&reference=${OTHER}&label=Merchant&memo=order-42`,
    'SOL',
  );
  assert.equal(request.asset, 'SOL');
  assert.equal(request.amountBaseUnits, 125_000_001n);
  assert.equal(request.amountDisplay, '0.125000001');
  assert.equal(request.reference, OTHER);
  assert.equal(request.memo, 'order-42');

  assert.throws(
    () => parseSolanaPaymentRequest(`solana:${RECIPIENT}?amount=1&amount=2`, 'SOL'),
    /duplicate amount/i,
  );
  assert.throws(
    () => parseSolanaPaymentRequest(`solana:${RECIPIENT}?amount=0.0000000001`, 'SOL'),
    /at most 9/i,
  );
  assert.throws(
    () => parseSolanaPaymentRequest(`solana:${RECIPIENT}?spl-token=${OTHER}`, 'SOL'),
    /selected asset/i,
  );
  assert.throws(
    () => parseSolanaPaymentRequest(`solana:${RECIPIENT}?danger=true`, 'SOL'),
    /unsupported parameter/i,
  );
});

test('builds a canonical amount-bound SOL receive request', () => {
  const uri = buildSolanaReceiveRequest({
    recipientAddress: RECIPIENT,
    asset: 'SOL',
    amountBaseUnits: 42_000_001n,
  });
  const parsed = parseSolanaPaymentRequest(uri, 'SOL');
  assert.equal(parsed.recipientAddress, RECIPIENT);
  assert.equal(parsed.amountBaseUnits, 42_000_001n);
  assert.equal(parsed.label, 'Opago Wallet');
});

test('extracts native and SPL-token deltas as bigint base units', () => {
  const owner = new PublicKey(RECIPIENT);
  const mint = new PublicKey(OTHER);
  const transaction = {
    transaction: {
      message: {
        instructions: [
          { program: 'system', parsed: { type: 'transfer', info: { source: OTHER, destination: RECIPIENT, lamports: 10 } } },
          { program: 'system', parsed: { type: 'transfer', info: { source: RECIPIENT, destination: OTHER, lamports: '3' } } },
        ],
      },
    },
    meta: {
      preTokenBalances: [{ owner: RECIPIENT, mint: OTHER, uiTokenAmount: { amount: '9007199254740993' } }],
      postTokenBalances: [{ owner: RECIPIENT, mint: OTHER, uiTokenAmount: { amount: '9007199254741000' } }],
    },
  };
  assert.equal(getNativeTransferDeltaLamports(transaction, owner), 7n);
  assert.equal(getTokenTransferDeltaBaseUnits(transaction, owner, mint), 7n);
});

test('persists exact pending Solana payments and reconciles only authoritative success', async () => {
  const storage = memoryStorage();
  const journal = createSolanaPaymentJournal(
    storage,
    () => new Date('2026-08-14T10:00:00.000Z'),
  );
  await journal.recordSubmitted({
    signature: SIGNATURE,
    recipientAddress: RECIPIENT,
    asset: 'SOL',
    amountBaseUnits: 9_007_199_254_740_993n,
  });
  let [record] = await journal.list();
  assert.equal(record.amountBaseUnits, '9007199254740993');
  assert.equal(record.state, 'pending');
  assert.doesNotMatch(
    storage.values.get(SOLANA_PAYMENT_JOURNAL_KEY),
    /mnemonic|recovery|private.?key|secret.?key|signed.?transaction/i,
  );

  [record] = await createSolanaPaymentJournal(storage).reconcile(async signature => ({
    signature,
    state: 'success',
    result: 'FINALIZED',
    confirmationStatus: 'finalized',
    explorerUrl: 'https://explorer.solana.com/tx/example?cluster=devnet',
  }));
  assert.equal(record.state, 'confirmed');
  assert.equal(record.result, 'FINALIZED');
});

test('keeps ambiguous Solana payments pending across restart and malformed journals fail closed', async () => {
  const storage = memoryStorage();
  await createSolanaPaymentJournal(storage).recordSubmitted({
    signature: SIGNATURE,
    recipientAddress: RECIPIENT,
    asset: 'USDC',
    amountBaseUnits: 1n,
  });
  const records = await createSolanaPaymentJournal(storage).reconcile(async () => {
    throw new Error('offline');
  });
  assert.equal(records[0].state, 'pending');

  storage.values.set(SOLANA_PAYMENT_JOURNAL_KEY, JSON.stringify({
    version: 1,
    records: [{ state: 'confirmed' }],
  }));
  await assert.rejects(createSolanaPaymentJournal(storage).list(), /invalid record/i);
});

test('keeps resolved journal records immutable and rejects signature metadata substitution', async () => {
  const storage = memoryStorage();
  const journal = createSolanaPaymentJournal(storage);
  await journal.recordSubmitted({
    signature: SIGNATURE,
    recipientAddress: RECIPIENT,
    asset: 'SOL',
    amountBaseUnits: 1n,
  });
  await assert.rejects(
    journal.recordSubmitted({
      signature: SIGNATURE,
      recipientAddress: OTHER,
      asset: 'SOL',
      amountBaseUnits: 1n,
    }),
    /different payment details/i,
  );
  await journal.recordResolved({ signature: SIGNATURE, state: 'confirmed', result: 'CONFIRMED' });
  await assert.rejects(
    journal.recordResolved({ signature: SIGNATURE, state: 'failed', result: 'FAILED' }),
    /cannot be changed/i,
  );
});

test('builds cluster-bound Explorer evidence from validated signatures and addresses', () => {
  assert.equal(parseSolanaSignature(`  ${SIGNATURE}  `), SIGNATURE);
  assert.equal(
    getSolanaTransactionExplorerUrl(SIGNATURE),
    `https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet`,
  );
  assert.equal(
    getSolanaAccountExplorerUrl(RECIPIENT),
    `https://explorer.solana.com/address/${RECIPIENT}?cluster=devnet`,
  );
  assert.throws(() => parseSolanaSignature(RECIPIENT), /signature is invalid/i);
});

test('native Solana execution journals before broadcast and avoids float-based chain amounts', () => {
  const root = path.resolve(__dirname, '..');
  const payments = readFileSync(path.join(root, 'lib', 'solana', 'payments.ts'), 'utf8');
  const account = readFileSync(path.join(root, 'lib', 'solana', 'account.ts'), 'utf8');
  const config = readFileSync(path.join(root, 'lib', 'solana', 'config.ts'), 'utf8');
  const journal = readFileSync(path.join(root, 'lib', 'solana', 'payment-journal.ts'), 'utf8');
  const submittedAt = payments.indexOf('onSubmitted?.');
  const broadcastAt = payments.indexOf('sendRawTransaction');
  assert.ok(submittedAt >= 0 && broadcastAt > submittedAt);
  assert.match(payments, /confirmTransaction\(\{/);
  assert.match(payments, /lastValidBlockHeight/);
  assert.match(payments, /getFeeForMessage/);
  assert.doesNotMatch(payments, /amount\s*\*\s*10\s*\*\*/);
  assert.doesNotMatch(account, /uiAmount\b/);
  assert.doesNotMatch(payments, /console\.(?:log|debug|info)/);
  assert.match(account, /createSolanaReadConnection/);
  assert.match(payments, /createSolanaConnection/);
  assert.match(config, /disableRetryOnRateLimit: true/);
  assert.match(journal, /MAX_RECONCILIATIONS_PER_REFRESH = 5/);
});

test('devnet funding requires only a public address and verifies the cluster before airdrop', () => {
  const script = readFileSync(
    path.resolve(__dirname, '..', 'scripts', 'solana-fund-devnet.cjs'),
    'utf8',
  );
  assert.match(script, /SOLANA_WALLET_ADDRESS/);
  assert.match(script, /EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG/);
  assert.ok(script.indexOf('getGenesisHash') < script.indexOf('requestAirdrop'));
  assert.doesNotMatch(script, /PRIVATE_KEY|SECRET_KEY|MNEMONIC|RECOVERY/i);
});
