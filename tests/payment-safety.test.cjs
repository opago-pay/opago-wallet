'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

process.env.NODE_ENV = 'test';
process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP = 'true';
delete process.env.EXPO_PUBLIC_ENABLE_MAINNET;
delete process.env.EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS;

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  calculateMaxLightningFee,
  createPaymentReference,
  isBolt11Invoice,
  decodeLightningInvoice,
  normalizeLightningInput,
  resolveInvoiceAmount,
} = require('../lib/lightning.ts');
const { assertSafeRemoteUrl } = require('../lib/config.ts');
const { sparkTransferMatchesInvoice, verifyPaymentPreimage } = require('../lib/payments.ts');

function invoice(amountSats) {
  return {
    invoice: 'lnbc-placeholder',
    amountSats,
    paymentHash: 'a'.repeat(64),
    expiresAt: Date.now() + 60_000,
  };
}

test('normalizes Lightning schemes and payment-link parameters without changing the invoice', () => {
  assert.equal(normalizeLightningInput(' LIGHTNING:LNBC123 '), 'LNBC123');
  assert.equal(
    normalizeLightningInput('https://merchant.example/pay?lightning=LNBC1ABC%3Ffoo%3Dbar'),
    'LNBC1ABC?foo=bar',
  );
  assert.throws(() => normalizeLightningInput('lnbc1 bad'), /whitespace/i);
});

test('recognizes supported BOLT11 networks only', () => {
  assert.equal(isBolt11Invoice('lnbc1abc'), true);
  assert.equal(isBolt11Invoice('lntb1abc'), true);
  assert.equal(isBolt11Invoice('lnbcrt1abc'), true);
  assert.equal(isBolt11Invoice('bitcoin:bc1abc'), false);
});
test('rejects mainnet invoices in the default safe development network before decoding', () => {
  assert.throws(
    () => decodeLightningInvoice('lnbc1not-a-real-invoice'),
    /safe development build only accepts Lightning regtest/i,
  );
});

test('binds selected amounts to fixed and amountless invoices', () => {
  assert.equal(resolveInvoiceAmount(invoice(21), 21), 21);
  assert.throws(() => resolveInvoiceAmount(invoice(21), 22), /mismatch/i);
  assert.equal(resolveInvoiceAmount(invoice(null), 42), 42);
  assert.throws(() => resolveInvoiceAmount(invoice(null)), /requires a positive amount/i);
});

test('caps Lightning fees and fails closed on insufficient balance', () => {
  assert.equal(calculateMaxLightningFee(1_000, 1_005), 5);
  assert.equal(calculateMaxLightningFee(100_000, 100_100), 100);
  assert.throws(() => calculateMaxLightningFee(1_000, 1_004), /maximum fee/i);
  assert.throws(() => calculateMaxLightningFee(-1, 100), /invalid payment amount/i);
});

test('matches incoming Spark transfers by direction, state, hash, and exact amount', () => {
  const transfer = {
    id: 'transfer-1',
    transferDirection: 'INCOMING',
    status: 'COMPLETED',
    totalValue: 50,
    userRequest: { invoice: { paymentHash: 'B'.repeat(64) } },
  };
  assert.equal(sparkTransferMatchesInvoice(transfer, 'b'.repeat(64), 50), true);
  assert.equal(sparkTransferMatchesInvoice({ ...transfer, totalValue: 51 }, 'b'.repeat(64), 50), false);
  assert.equal(sparkTransferMatchesInvoice({ ...transfer, transferDirection: 'OUTGOING' }, 'b'.repeat(64), 50), false);
});

test('verifies that a returned Lightning preimage hashes to the invoice payment hash', () => {
  const preimage = '00'.repeat(32);
  const paymentHash = '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925';
  assert.equal(verifyPaymentPreimage(preimage, paymentHash), preimage);
  assert.throws(
    () => verifyPaymentPreimage('01'.repeat(32), paymentHash),
    /does not match/i,
  );
});

test('creates stable non-sensitive payment references', () => {
  assert.equal(createPaymentReference('ABCDEF'), 'ln:abcdef');
});

test('allows HTTPS and explicitly enabled local development HTTP only', () => {
  assert.equal(assertSafeRemoteUrl('https://merchant.example/pay', 'test').protocol, 'https:');
  assert.equal(assertSafeRemoteUrl('http://127.0.0.1:3333/ocp', 'test').protocol, 'http:');
  assert.throws(() => assertSafeRemoteUrl('http://merchant.example/pay', 'test'), /must use HTTPS/i);
  assert.equal(assertSafeRemoteUrl('http://[::1]:3333/ocp', 'test').protocol, 'http:');
  assert.throws(() => assertSafeRemoteUrl('https://user:pass@merchant.example/pay', 'test'), /credentials/i);
});
