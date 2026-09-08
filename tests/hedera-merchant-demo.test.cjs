'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { solidityPackedKeccak256 } = require('ethers');
const {
  NETWORKS,
  checkoutUri,
  formatTinybars,
  loadDeployment,
  parseHbar,
  resolveDemoNetwork,
} = require('../demo/hedera-checkout-merchant.cjs');

const PAYMENT_DOMAIN =
  '0x2cbcc7376617198b16e5d1ca7f3f2c64fb4cefed7bf20cd26d6e5a1af0230d9c';

test('keeps the merchant demo on testnet unless Mainnet is explicit', () => {
  assert.equal(resolveDemoNetwork(undefined).name, 'testnet');
  assert.equal(resolveDemoNetwork('testnet').chainId, 296n);
  assert.equal(resolveDemoNetwork('mainnet').chainId, 295n);
  assert.throws(() => resolveDemoNetwork('previewnet'), /testnet or mainnet/i);
});

test('builds a chain-bound Mainnet checkout request with exact tinybars', () => {
  const deployment = {
    contractId: '0.0.8888',
    evmAddress: '0x00000000000000000000000000000000000022b8',
  };
  const merchantId = '0.0.10848889';
  const merchantAddress = '0x0000000000000000000000000000000000a58a79';
  const tinybars = parseHbar('0.01');
  const checkout = checkoutUri({
    deployment,
    merchantId,
    merchantAddress,
    tinybars,
    network: NETWORKS.mainnet,
    nowSeconds: 1_700_000_000,
  });
  const url = new URL(checkout.uri);
  assert.equal(url.searchParams.get('network'), 'mainnet');
  assert.equal(url.searchParams.get('amount'), '0.01');
  assert.equal(url.searchParams.get('expiresAt'), '1700000300');
  assert.equal(formatTinybars(tinybars), '0.01');
  assert.equal(
    checkout.paymentId,
    solidityPackedKeccak256(
      ['bytes32', 'uint256', 'address', 'bytes32', 'address', 'uint256', 'uint64'],
      [
        PAYMENT_DOMAIN,
        295n,
        deployment.evmAddress,
        checkout.requestNonce,
        merchantAddress,
        tinybars,
        checkout.expiresAt,
      ],
    ),
  );
});

test('refuses to generate Mainnet QR requests before verified deployment evidence exists', () => {
  assert.throws(
    () => loadDeployment(NETWORKS.mainnet),
    /deploy and verify.*mainnet first/i,
  );
  assert.equal(loadDeployment(NETWORKS.testnet).contractId, '0.0.9972670');
});

test('bounds merchant demo amounts using exact HBAR decimal parsing', () => {
  assert.equal(parseHbar('1'), 100_000_000n);
  assert.equal(parseHbar('0.00000001'), 1n);
  assert.throws(() => parseHbar('0'), /greater than zero/i);
  assert.throws(() => parseHbar('1.00000001'), /at most 1 HBAR/i);
  assert.throws(() => parseHbar('0.000000001'), /decimal places/i);
});
