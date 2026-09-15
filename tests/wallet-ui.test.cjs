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
const {
  compactWalletIdentifier,
  formatEurValue,
  friendlyPaymentStatus,
} = require('../lib/wallet-display.ts');
const { inferPaymentSourceFromRequest } = require('../lib/payment-input.ts');

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
  assert.equal(
    getWalletAssetPresentation('hedera', true, 'mainnet').networkBadge,
    'MAINNET',
  );
  assert.equal(getWalletAssetPresentation('usdc', false).name, 'USDC');
  assert.equal(getWalletAssetPresentation('hedera', false).name, 'HBAR');
  assert.equal(getWalletAssetPresentation('lightning', false).name, 'Bitcoin');
  assert.equal(
    getWalletAssetPresentation('usdc', false).description,
    'Digital dollars on Solana',
  );
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
  assert.match(portfolio, /HBAR payments are live/);
  assert.match(portfolio, /Bitcoin, Solana and USDC are still for testing/);
  assert.doesNotMatch(portfolio, /Test HBAR has no real-world value/);
  assert.match(send, /<AssetIcon asset=\{item\.asset\}/);
  assert.match(receive, /<AssetIcon asset=\{item\.asset\}/);
  assert.doesNotMatch(portfolio, /assetDot/);
});

test('keeps technical wallet data behind friendly display labels', () => {
  assert.equal(compactWalletIdentifier('0.0.10861984'), 'Account ••• 61984');
  assert.equal(compactWalletIdentifier('Da9biHrA6ghVMz19Lj6b4nmin'), 'Da9bi…4nmin');
  assert.equal(friendlyPaymentStatus('SUCCESS'), 'Completed');
  assert.equal(friendlyPaymentStatus('submitted'), 'Processing');
  assert.equal(friendlyPaymentStatus('action_required'), 'Needs attention');
  assert.match(formatEurValue(12.5), /12\.50/);

  const review = readSource('components', 'send', 'hedera-payment-views.tsx');
  assert.match(review, /Show payment details/);
  assert.match(review, /Send \{props\.payment\.amountHbar\} HBAR/);
  assert.match(review, /View receipt/);
});

test('shows a clearly labelled estimate for development-network balances', () => {
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
  assert.match(portfolio, /Demo balance based on current market prices/);
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

test('keeps send and request focused on the first consumer decision', () => {
  assert.equal(inferPaymentSourceFromRequest('hedera:0.0.123?amount=1'), 'hedera');
  assert.equal(inferPaymentSourceFromRequest('0.0.123'), 'hedera');
  assert.equal(
    inferPaymentSourceFromRequest('opagowallet://hedera-checkout?paymentId=abc'),
    'hedera',
  );
  assert.equal(inferPaymentSourceFromRequest('solana:abc'), 'solana');
  assert.equal(inferPaymentSourceFromRequest('solana:abc?spl-token=mint'), 'usdc');
  assert.equal(inferPaymentSourceFromRequest('lnbc123', 'spark'), 'spark');

  const send = readSource('components', 'send', 'payment-form.tsx');
  const receive = readSource('app', '(tabs)', 'receive.tsx');
  assert.match(send, /Scan to pay/);
  assert.match(send, /or choose what to send/);
  assert.match(send, /sourceSelected/);
  assert.match(receive, /What would you like to receive\?/);
  assert.match(receive, /useState\(true\)/);
  assert.match(receive, /Create request/);
  assert.doesNotMatch(receive, />Invoice amount</);
  assert.doesNotMatch(receive, />Create 10-minute invoice</);
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
