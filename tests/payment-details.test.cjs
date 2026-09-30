'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const { bitcoinOperationHistoryItem, lightningHashFromPayment, paymentDetailStatus,
  paymentDetailReferences, bitcoinExplorerUrl, paymentMethodLabel, paymentEurQuote,
  paymentEurValueAtCurrentRate } = require('../lib/payment-details.ts');
const { assertBitcoinOperation } = require('../lib/bitcoin/store.ts');

const txid = 'ab'.repeat(32);
const operation = {
  id: 'withdraw:quote-1', scope: 'MAINNET:synthetic', network: 'MAINNET', kind: 'withdrawal',
  address: 'bc1qsynthetic', amountSats: 20, feeSats: 3, state: 'pending',
  quoteId: 'quote-1', requestId: 'request-1', createdAt: '2026-09-24T10:00:00.000Z',
};

test('Bitcoin details retain the saved recipient, quote ceiling, references and validated explorer target', () => {
  const completed = { ...operation, txid, state: 'confirmed', actualFeeSats: 2,
    btcEurRate: 80000, btcEurRateAt: operation.createdAt };
  assert.doesNotThrow(() => assertBitcoinOperation(completed));
  assert.throws(() => assertBitcoinOperation({ ...completed, actualFeeSats: 4 }));
  assert.throws(() => assertBitcoinOperation({ ...completed, state: 'pending' }));
  const payment = bitcoinOperationHistoryItem(completed, 'en-US');
  assert.equal(payment.operation.address, operation.address);
  assert.equal(payment.operation.feeSats, 3);
  assert.equal(payment.operation.actualFeeSats, 2);
  assert.equal(paymentDetailStatus(payment), 'Completed');
  assert.deepEqual(paymentEurQuote(payment, { hbarToEur: 0 }), {
    eurValue: 0.016, eurPerAsset: 80000, rateAsset: 'BTC', historical: true,
  });
  assert.equal(bitcoinExplorerUrl(payment), `https://mempool.space/tx/${txid}`);
  assert.deepEqual(paymentDetailReferences(payment), [
    { label: 'Transaction ID', value: txid },
    { label: 'Request ID', value: 'request-1' },
    { label: 'Quote ID', value: 'quote-1' },
  ]);
  assert.equal(bitcoinExplorerUrl(bitcoinOperationHistoryItem({ ...operation, network: 'REGTEST', txid }, 'en-US')), null);
  assert.equal(bitcoinExplorerUrl(bitcoinOperationHistoryItem({ ...operation, txid: 'invalid' }, 'en-US')), null);
});

test('payment EUR quote uses the asset amount and does not invent unavailable rates', () => {
  const payment = { key: 'hedera:1', txId: '1', type: 'incoming', amountDisplay: '12.5', amountValue: 12.5,
    asset: 'HBAR', status: 'success', timestamp: operation.createdAt };
  assert.deepEqual(paymentEurQuote(payment, { btcToEur: 80000, hbarToEur: 0.2 }), {
    eurValue: 2.5, eurPerAsset: 0.2, rateAsset: 'HBAR', historical: false,
  });
  assert.equal(paymentEurQuote(payment, { btcToEur: 80000, hbarToEur: 0 }), null);
  assert.equal(paymentEurQuote({ ...payment, amountValue: undefined }, { btcToEur: 80000, hbarToEur: 0.2 }), null);
  const oldBitcoin = { ...payment, asset: 'SAT', amountValue: 100_000 };
  assert.equal(paymentEurQuote(oldBitcoin, { btcToEur: 80000, hbarToEur: 0.2 }), null);
  assert.deepEqual(paymentEurQuote({ ...oldBitcoin, btcEurRate: 70000 }, { btcToEur: 80000, hbarToEur: 0.2 }), {
    eurValue: 70, eurPerAsset: 70000, rateAsset: 'BTC', historical: true,
  });
});

test('success EUR value uses a recent rate for the confirmed asset', () => {
  const rates = { btcToEur: 50_000, hbarToEur: 0.2, updatedAt: 1_000_000 };
  assert.equal(paymentEurValueAtCurrentRate('SAT', 20, rates, 1_000_100), 0.01);
  assert.equal(paymentEurValueAtCurrentRate('HBAR', 12.5, rates, 1_000_100), 2.5);
  assert.equal(paymentEurValueAtCurrentRate('SAT', 20, rates, 1_300_001), null);
  assert.equal(paymentEurValueAtCurrentRate('HBAR', 12.5, { ...rates, hbarToEur: 0 }, 1_000_100), null);
});

test('restored Bitcoin operations do not invent recipient, amount, fee or explorer target', () => {
  const payment = bitcoinOperationHistoryItem({ ...operation, address: '', amountSats: 0,
    feeSats: null, recoveredFromProvider: true, txid: undefined }, 'en-US');
  assert.equal(payment.amountDisplay, '—');
  assert.equal(bitcoinExplorerUrl(payment), null);
  assert.equal(paymentMethodLabel(payment), 'Bitcoin network');
  assert.equal(paymentMethodLabel({ ...payment, key: 'spark:transfer-1', route: undefined }), 'Bitcoin');
  assert.deepEqual(paymentDetailReferences(payment), [
    { label: 'Request ID', value: 'request-1' },
    { label: 'Quote ID', value: 'quote-1' },
  ]);
  assert.equal(paymentDetailStatus(payment), 'Status unknown');
});

test('Lightning details expose saved hashes and request IDs, but no inferred recipient or fee', () => {
  const payment = { key: 'ln:' + txid, txId: 'ln:' + txid, type: 'outgoing', amountDisplay: '20',
    asset: 'SAT', status: 'pending', timestamp: operation.createdAt, route: 'lightning', requestId: 'spark-request' };
  assert.equal(lightningHashFromPayment(payment), txid);
  assert.equal(paymentDetailStatus(payment), 'Status unknown');
  assert.deepEqual(paymentDetailReferences(payment), [
    { label: 'Payment hash', value: txid },
    { label: 'Request ID', value: 'spark-request' },
  ]);
  assert.equal(bitcoinExplorerUrl(payment), null);
  assert.equal(paymentMethodLabel(payment), 'Lightning');
});
