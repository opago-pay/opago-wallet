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
const { calculatePortfolioEur } = require('../lib/portfolio-valuation.ts');

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
  assert.equal(getWalletAssetPresentation('usdc', false).name, 'USDC');
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
  assert.match(icon, /hedera-logo\.png/);
  assert.doesNotMatch(icon, /\\u210f/);
  for (const asset of ['lightning', 'solana', 'usdc', 'hedera']) {
    assert.match(portfolio, new RegExp(`asset="${asset}"`));
  }
  assert.match(portfolio, /Development networks - real mainnet payments are blocked/);
  assert.doesNotMatch(portfolio, /Test HBAR has no real-world value/);
  assert.match(send, /<AssetIcon asset=\{item\.asset\}/);
  assert.match(receive, /<AssetIcon asset=\{item\.asset\}/);
  assert.doesNotMatch(portfolio, /assetDot/);
});

test('values development-network balances at their mainnet-equivalent EUR prices', () => {
  assert.equal(
    calculatePortfolioEur(
      {
        sparkSats: 100_000_000,
        solLamports: 2_000_000_000n,
        usdcBaseUnits: 3_000_000n,
        hbarTinybars: 4_000_000_000n,
      },
      {
        btcToEur: 50_000,
        solToEur: 100,
        usdcToEur: 0.9,
        hbarToEur: 0.2,
      },
    ),
    50_210.7,
  );

  const portfolio = readSource('app', '(tabs)', 'index.tsx');
  assert.doesNotMatch(portfolio, /Not valued/);
  assert.match(portfolio, /Mainnet-price estimate only/);
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

test('bundles native explorer links statically', () => {
  const sources = [
    readSource('lib', 'hedera', 'explorer-native.ts'),
    readSource('lib', 'solana', 'explorer-native.ts'),
  ];

  for (const source of sources) {
    assert.match(source, /import \* as Linking from 'expo-linking';/);
    assert.doesNotMatch(source, /await import\(['"]expo-linking['"]\)/);
  }
});
