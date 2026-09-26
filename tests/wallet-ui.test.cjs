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
    ['lightning', 'hedera'].map(asset =>
      getWalletAssetPresentation(asset, false).networkBadge,
    ),
    ['REGTEST', 'TESTNET'],
  );
  assert.equal(getWalletAssetPresentation('lightning', true).networkBadge, '');
  assert.equal(getWalletAssetPresentation('hedera', true).networkBadge, 'TESTNET');
  assert.equal(
    getWalletAssetPresentation('hedera', true, 'mainnet').networkBadge,
    'MAINNET',
  );
  assert.equal(getWalletAssetPresentation('hedera', false).name, 'HBAR');
  assert.equal(getWalletAssetPresentation('lightning', false).name, 'Bitcoin');
});

test('maps transaction symbols to the same icons used by asset cards', () => {
  assert.equal(walletAssetKeyFromSymbol('SAT'), 'bitcoin');
  assert.equal(walletAssetKeyFromSymbol('BTC'), 'bitcoin');
  assert.equal(walletAssetKeyFromSymbol('HBAR'), 'hedera');
});

test('uses accessible asset icons throughout portfolio, send, and receive views', () => {
  const icon = readSource('components', 'ui', 'asset-icon.tsx');
  const portfolio = readSource('app', '(tabs)', 'index.tsx');
  const send = readSource('components', 'send', 'payment-form.tsx');
  const receive = readSource('app', '(tabs)', 'receive.tsx');

  assert.match(icon, /accessibilityRole="image"/);
  assert.match(icon, /props\.asset === 'lightning'/);
  assert.match(icon, /props\.asset === 'hedera'/);
  assert.match(icon, /hedera-logo\.png/);
  assert.doesNotMatch(icon, /\\u210f/);
  assert.match(portfolio, /asset="hedera"/);
  assert.doesNotMatch(portfolio, /asset="lightning"/);
  assert.match(portfolio, /walletAssetKeyFromSymbol\(transaction\.asset\)/);
  assert.doesNotMatch(portfolio, /HBAR payments are live/);
  assert.doesNotMatch(portfolio, /Your HBAR is live/);
  assert.doesNotMatch(portfolio, /Test HBAR has no real-world value/);
  assert.match(send, /<AssetIcon asset=\{item\.asset\}/);
  assert.match(receive, /<AssetIcon asset="hedera"/);
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
  const lightningReview = readSource('components', 'send', 'lightning-payment-views.tsx');
  assert.match(review, /Show payment details/);
  assert.match(review, /t\('Send \{amount\} HBAR', \{ amount: props\.payment\.amountHbar \}\)/);
  assert.match(review, /View receipt/);
  assert.match(lightningReview, /Show payment details/);
  const unifiedReview = readSource('components', 'bitcoin', 'payment-ui.tsx');
  assert.match(unifiedReview, /Fee, at most/);
  assert.match(unifiedReview, /label=\{t\('Send'\)\}/);
});

test('requires an explicit Lightning review and device authorization before submission', () => {
  const send = readSource('app', '(tabs)', 'send.tsx');
  const authorization = readSource('lib', 'payment-authorization.ts');
  assert.match(send, /setPendingLightning/);
  assert.match(send, /<LightningReviewView/);
  assert.match(send, /await authorizeAndPayPreparedSparkPayment\(/);
  assert.match(send, /const assertAuthorized = await authorizePayment\(\)/);
  assert.match(authorization, /authorizeWalletAction/);
  const deviceAuth = readSource('lib', 'device-authentication.ts');
  assert.match(deviceAuth, /authenticateAsync/);
  assert.match(deviceAuth, /disableDeviceFallback: !allowDeviceCredential/);
});

test('shows a clearly labelled estimate for development-network balances', () => {
  assert.equal(
    calculatePortfolioEur(
      {
        sparkSats: 100_000_000,
        hbarTinybars: 4_000_000_000n,
      },
      {
        btcToEur: 50_000,
        hbarToEur: 0.2,
      },
    ),
    50_008,
  );

  const portfolio = readSource('app', '(tabs)', 'index.tsx');
  assert.doesNotMatch(portfolio, /Not valued/);
  assert.match(portfolio, /<NetworkBadge label=\{presentation\.networkBadge\}/);
  assert.match(portfolio, /if \(!label\.trim\(\) \|\| label === 'MAINNET'\) return null/);
  assert.doesNotMatch(portfolio, /Demo balance based on current market prices|Based on current market prices/);
});

test('uses graphical confirmation states instead of prototype OK text', () => {
  const sources = [
    readSource('app', '(tabs)', 'receive.tsx'),
    readSource('components', 'send', 'hedera-payment-views.tsx'),
    readSource('components', 'bitcoin', 'payment-progress.tsx'),
  ];

  for (const source of sources) {
    assert.match(source, /name="checkmark"/);
    assert.doesNotMatch(source, />OK<\/Text>/);
  }
  const lightning = readSource('components', 'send', 'lightning-payment-views.tsx');
  assert.match(lightning, /<BitcoinPaymentProgress phase="success"/);
  assert.doesNotMatch(lightning, />OK<\/Text>/);
});

test('keeps send and request focused on the first consumer decision', () => {
  assert.equal(inferPaymentSourceFromRequest('hedera:0.0.123?amount=1'), 'hedera');
  assert.equal(inferPaymentSourceFromRequest('0.0.123'), 'hedera');
  assert.equal(
    inferPaymentSourceFromRequest('opagowallet://hedera-checkout?paymentId=abc'),
    'hedera',
  );
  assert.equal(inferPaymentSourceFromRequest('lnbc123', 'spark'), 'spark');

  const send = readSource('components', 'send', 'payment-form.tsx');
  const receive = readSource('app', '(tabs)', 'receive.tsx');
  assert.match(send, /Scan to pay/);
  assert.match(send, /or enter a payment request/);
  assert.match(send, /sourceSelected/);
  assert.match(receive, /Receive Bitcoin/);
  assert.match(receive, /createLightningInvoice/);
  assert.match(receive, /<StableQRCode value=\{qrValue\}/);
  assert.doesNotMatch(receive, />Invoice amount</);
  assert.doesNotMatch(receive, />Create 10-minute invoice</);
});

test('bundles native explorer links statically', () => {
  const sources = [readSource('lib', 'hedera', 'explorer-native.ts')];

  for (const source of sources) {
    assert.match(source, /import \* as Linking from 'expo-linking';/);
    assert.doesNotMatch(source, /await import\(['"]expo-linking['"]\)/);
  }
});
