'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
require('./register-typescript.cjs');

const {
  getWalletAssetPresentation,
  walletAssetKeyFromSymbol,
} = require('../lib/wallet-assets.ts');

function readSource(...segments) {
  return readFileSync(path.join(__dirname, '..', ...segments), 'utf8');
}

test('defines presentation metadata for every wallet asset and development network', () => {
  assert.deepEqual(
    ['lightning', 'solana', 'usdc', 'hedera'].map(asset =>
      getWalletAssetPresentation(asset, false).networkBadge,
    ),
    ['REGTEST', 'DEVNET', 'DEVNET', 'TESTNET'],
  );
  assert.equal(getWalletAssetPresentation('lightning', true).networkBadge, 'MAINNET');
  assert.equal(getWalletAssetPresentation('solana', true).networkBadge, 'MAINNET');
  assert.equal(getWalletAssetPresentation('hedera', true).networkBadge, 'TESTNET');
});

test('maps transaction symbols to the same icons used by asset cards', () => {
  assert.equal(walletAssetKeyFromSymbol('SAT'), 'lightning');
  assert.equal(walletAssetKeyFromSymbol('BTC'), 'lightning');
  assert.equal(walletAssetKeyFromSymbol('SOL'), 'solana');
  assert.equal(walletAssetKeyFromSymbol('USDC'), 'usdc');
  assert.equal(walletAssetKeyFromSymbol('HBAR'), 'hedera');
});

test('uses accessible asset icons throughout portfolio, send, and receive views', () => {
  const icon = readSource('components', 'ui', 'asset-icon.tsx');
  const portfolio = readSource('app', '(tabs)', 'index.tsx');
  const send = readSource('components', 'send', 'payment-form.tsx');
  const receive = readSource('app', '(tabs)', 'receive.tsx');

  assert.match(icon, /accessibilityRole="image"/);
  assert.match(icon, /props\.asset === 'lightning'/);
  assert.match(icon, /props\.asset === 'solana'/);
  assert.match(icon, /props\.asset === 'usdc'/);
  assert.match(icon, /props\.asset === 'hedera'/);
  for (const asset of ['lightning', 'solana', 'usdc', 'hedera']) {
    assert.match(portfolio, new RegExp(`asset="${asset}"`));
  }
  assert.match(send, /<AssetIcon asset=\{item\.asset\}/);
  assert.match(receive, /<AssetIcon asset=\{item\.asset\}/);
  assert.doesNotMatch(portfolio, /assetDot/);
});

test('uses graphical confirmation states instead of prototype OK text', () => {
  const sources = [
    readSource('app', '(tabs)', 'receive.tsx'),
    readSource('components', 'send', 'hedera-payment-views.tsx'),
    readSource('components', 'send', 'payment-state-views.tsx'),
  ];

  for (const source of sources) {
    assert.match(source, /name="checkmark"/);
    assert.doesNotMatch(source, />OK<\/Text>/);
  }
});
