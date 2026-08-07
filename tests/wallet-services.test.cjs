'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PublicKey } = require('@solana/web3.js');
require('./register-typescript.cjs');

const {
  deriveHederaPrivateKey,
  deriveSolanaKeypair,
  HEDERA_DERIVATION_PATH,
  SOLANA_DERIVATION_PATH,
} = require('../lib/wallet-keys.ts');
const { getNativeTransferDeltaLamports } = require('../lib/solana.ts');

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EXPECTED_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const EXPECTED_HEDERA_PUBLIC_KEY =
  '793af21fd5a0a7cc1076195263717fab12600496dfc7ad49e902acdd0bf22331';

test('derives the documented Solana account deterministically from BIP39', () => {
  assert.equal(SOLANA_DERIVATION_PATH, "m/44'/501'/0'/0'");
  assert.equal(deriveSolanaKeypair(MNEMONIC).publicKey.toBase58(), EXPECTED_ADDRESS);
  assert.equal(
    deriveSolanaKeypair('  ' + MNEMONIC.toUpperCase().replaceAll(' ', '   ') + '  ').publicKey.toBase58(),
    EXPECTED_ADDRESS,
  );
  assert.throws(() => deriveSolanaKeypair('not a recovery phrase'), /valid BIP39/i);
});

test('counts only parsed system transfers involving the wallet', () => {

test('derives the documented Hedera Ed25519 account deterministically from BIP39', () => {
  assert.equal(HEDERA_DERIVATION_PATH, "m/44'/3030'/0'/0'");
  assert.equal(
    deriveHederaPrivateKey(MNEMONIC).publicKey.toStringRaw(),
    EXPECTED_HEDERA_PUBLIC_KEY,
  );
  assert.equal(
    deriveHederaPrivateKey('  ' + MNEMONIC.toUpperCase().replaceAll(' ', '   ') + ' ')
      .publicKey.toStringRaw(),
    EXPECTED_HEDERA_PUBLIC_KEY,
  );
  assert.throws(() => deriveHederaPrivateKey('not a recovery phrase'), /valid BIP39/i);
});
  const wallet = new PublicKey(EXPECTED_ADDRESS);
  const other = '11111111111111111111111111111111';
  const transaction = {
    transaction: {
      message: {
        instructions: [
          { program: 'system', parsed: { type: 'transfer', info: { source: other, destination: EXPECTED_ADDRESS, lamports: 1_000_000 } } },
          { program: 'system', parsed: { type: 'transfer', info: { source: EXPECTED_ADDRESS, destination: other, lamports: 250_000 } } },
          { program: 'spl-token', parsed: { type: 'transfer', info: { source: other, destination: EXPECTED_ADDRESS, lamports: 9_000_000 } } },
        ],
      },
    },
    meta: {
      innerInstructions: [{
        instructions: [
          { program: 'system', parsed: { type: 'transferChecked', info: { source: other, destination: EXPECTED_ADDRESS, lamports: 500_000 } } },
          { program: 'system', parsed: { type: 'transfer', info: { source: other, destination: EXPECTED_ADDRESS, lamports: -1 } } },
        ],
      }],
    },
  };

  assert.equal(getNativeTransferDeltaLamports(transaction, wallet), 1_250_000);
  assert.equal(getNativeTransferDeltaLamports({ transaction: {} }, wallet), 0);
});
