'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { solidityPackedKeccak256 } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const DEPLOYMENT_PATH = path.join(ROOT, 'deployments', 'hedera-testnet.json');
const MIRROR = 'https://testnet.mirrornode.hedera.com';
const PAYMENT_DOMAIN =
  '0x2cbcc7376617198b16e5d1ca7f3f2c64fb4cefed7bf20cd26d6e5a1af0230d9c';
const HEDERA_TESTNET_CHAIN_ID = 296n;
const TINYBARS_PER_HBAR = 100_000_000n;

function parseHbar(value) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(value.trim());
  if (!match) throw new Error('Amount must use at most 8 HBAR decimal places.');
  const tinybars =
    BigInt(match[1]) * TINYBARS_PER_HBAR +
    BigInt((match[2] || '').padEnd(8, '0') || '0');
  if (tinybars <= 0n || tinybars > TINYBARS_PER_HBAR) {
    throw new Error('Amount must be greater than zero and at most 1 HBAR.');
  }
  return tinybars;
}

function formatTinybars(tinybars) {
  const whole = tinybars / TINYBARS_PER_HBAR;
  const fractional = (tinybars % TINYBARS_PER_HBAR)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');
  return fractional ? whole + '.' + fractional : whole.toString();
}

function deployment() {
  const value = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, 'utf8'));
  if (value.network !== 'testnet' || value.status !== 'deployed') {
    throw new Error('The locked Hedera testnet checkout deployment is unavailable.');
  }
  return value;
}

async function merchantAddress(accountId) {
  const response = await fetch(MIRROR + '/api/v1/accounts/' + encodeURIComponent(accountId), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Merchant lookup failed with HTTP ' + response.status + '.');
  const account = await response.json();
  const address = String(account.evm_address || '').toLowerCase();
  if (
    account.deleted ||
    account.account !== accountId ||
    !/^0x[0-9a-f]{40}$/.test(address) ||
    address === '0x' + '0'.repeat(40)
  ) {
    throw new Error('Merchant account has no usable Hedera testnet EVM address.');
  }
  return address;
}

function createRequest({ contractId, contractAddress, merchantId, merchantEvmAddress, amountTinybars, expiresAt }) {
  const requestNonce = '0x' + crypto.randomBytes(32).toString('hex');
  const paymentId = solidityPackedKeccak256(
    ['bytes32', 'uint256', 'address', 'bytes32', 'address', 'uint256', 'uint64'],
    [
      PAYMENT_DOMAIN,
      HEDERA_TESTNET_CHAIN_ID,
      contractAddress,
      requestNonce,
      merchantEvmAddress,
      amountTinybars,
      expiresAt,
    ],
  );
  const params = new URLSearchParams({
    network: 'testnet',
    contractId,
    merchant: merchantId,
    merchantEvmAddress,
    amount: formatTinybars(amountTinybars),
    paymentId,
    requestNonce,
    expiresAt: String(expiresAt),
  });
  return 'opagowallet://hedera-checkout?' + params.toString();
}

function replaceParameter(uri, name, value) {
  const parsed = new URL(uri);
  parsed.searchParams.set(name, value);
  return parsed.toString();
}

async function main() {
  const merchantId = String(process.env.HEDERA_MERCHANT_ID || '').trim();
  if (!/^0\.0\.[1-9]\d*$/.test(merchantId)) {
    throw new Error('HEDERA_MERCHANT_ID must use numeric 0.0.x testnet format.');
  }
  const amountTinybars = parseHbar(process.env.HEDERA_PHASE4_AMOUNT_HBAR || '0.00000001');
  const locked = deployment();
  const merchantEvmAddress = await merchantAddress(merchantId);
  const now = Math.floor(Date.now() / 1000);
  const shared = {
    contractId: locked.contractId,
    contractAddress: locked.evmAddress,
    merchantId,
    merchantEvmAddress,
    amountTinybars,
  };
  const validAndReplay = createRequest({ ...shared, expiresAt: now + 10 * 60 });
  const expired = createRequest({ ...shared, expiresAt: now - 60 });
  const alteredNonce = replaceParameter(
    validAndReplay,
    'requestNonce',
    '0x' + 'ff'.repeat(32),
  );
  const wrongAmount = replaceParameter(
    validAndReplay,
    'amount',
    formatTinybars(amountTinybars + 1n),
  );

  process.stdout.write(JSON.stringify({
    generatedAt: new Date().toISOString(),
    network: 'testnet',
    merchantId,
    amountTinybars: amountTinybars.toString(),
    validAndReplay,
    expired,
    alteredNonce,
    wrongAmount,
  }, null, 2) + '\n');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Fixture generation failed.');
    process.exitCode = 1;
  });
}

module.exports = { createRequest, parseHbar, replaceParameter };
