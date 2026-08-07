'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const qrcode = require('qrcode-terminal');
const { solidityPackedKeccak256 } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const DEPLOYMENT_PATH = path.join(ROOT, 'deployments', 'hedera-testnet.json');
const MIRROR = 'https://testnet.mirrornode.hedera.com';
const TINYBARS_PER_HBAR = 100_000_000n;
const MAX_TINYBARS = TINYBARS_PER_HBAR;
const HEDERA_TESTNET_CHAIN_ID = 296n;
const PAYMENT_DOMAIN =
  '0x2cbcc7376617198b16e5d1ca7f3f2c64fb4cefed7bf20cd26d6e5a1af0230d9c';
const PORT = Number.parseInt(process.env.HEDERA_MERCHANT_DEMO_PORT || '3334', 10);
const BIND_HOST = process.env.HEDERA_MERCHANT_DEMO_BIND_HOST || '127.0.0.1';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseHbar(value) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(value.trim());
  if (!match) throw new Error('Amount must use at most 8 HBAR decimal places.');
  const tinybars =
    BigInt(match[1]) * TINYBARS_PER_HBAR +
    BigInt((match[2] || '').padEnd(8, '0') || '0');
  if (tinybars <= 0n || tinybars > MAX_TINYBARS) {
    throw new Error('Demo amount must be greater than zero and at most 1 HBAR.');
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

function loadDeployment() {
  if (!fs.existsSync(DEPLOYMENT_PATH)) throw new Error('Deployment manifest is missing.');
  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, 'utf8'));
  if (
    deployment.status !== 'deployed' ||
    !/^0\.0\.[1-9]\d*$/.test(deployment.contractId || '') ||
    !/^0x[0-9a-f]{40}$/i.test(deployment.evmAddress || '') ||
    !/^[0-9a-f]{64}$/i.test(deployment.runtimeBytecodeSha256 || '') ||
    deployment.sourceVerification?.status !== 'verified'
  ) {
    throw new Error('Deploy and verify OpagoHbarCheckout on Hedera testnet first.');
  }
  return {
    contractId: deployment.contractId,
    evmAddress: deployment.evmAddress.toLowerCase(),
    runtimeBytecodeSha256: deployment.runtimeBytecodeSha256.toLowerCase(),
  };
}

function requiredMerchantId() {
  const value = process.env.HEDERA_MERCHANT_ID?.trim();
  if (!value || !/^0\.0\.[1-9]\d*$/.test(value)) {
    throw new Error('HEDERA_MERCHANT_ID must use numeric 0.0.x testnet format.');
  }
  return value;
}

async function merchantEvmAddress(accountId) {
  const response = await fetch(
    MIRROR + '/api/v1/accounts/' + encodeURIComponent(accountId),
    {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error('Merchant Mirror Node lookup failed with HTTP ' + response.status + '.');
  }
  const account = await response.json();
  const evm = String(account.evm_address || '').toLowerCase();
  if (
    account.deleted ||
    account.account !== accountId ||
    !/^0x[0-9a-f]{40}$/.test(evm) ||
    evm === '0x' + '0'.repeat(40)
  ) {
    throw new Error('Merchant account has no usable Hedera testnet EVM address.');
  }
  return evm;
}

function checkoutUri({ deployment, merchantId, merchantAddress, tinybars }) {
  const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;
  const requestNonce = '0x' + crypto.randomBytes(32).toString('hex');
  const paymentId = solidityPackedKeccak256(
    ['bytes32', 'uint256', 'address', 'bytes32', 'address', 'uint256', 'uint64'],
    [
      PAYMENT_DOMAIN,
      HEDERA_TESTNET_CHAIN_ID,
      deployment.evmAddress,
      requestNonce,
      merchantAddress,
      tinybars,
      expiresAt,
    ],
  );
  const params = new URLSearchParams({
    network: 'testnet',
    contractId: deployment.contractId,
    merchant: merchantId,
    merchantEvmAddress: merchantAddress,
    amount: formatTinybars(tinybars),
    paymentId,
    requestNonce,
    expiresAt: String(expiresAt),
  });
  return {
    uri: 'opagowallet://hedera-checkout?' + params.toString(),
    paymentId,
    requestNonce,
    expiresAt,
  };
}

function qrText(uri) {
  return new Promise(resolve => qrcode.generate(uri, { small: true }, resolve));
}

async function renderPage(requestUrl) {
  const deployment = loadDeployment();
  const merchantId = requiredMerchantId();
  const amount = requestUrl.searchParams.get('amount') || '0.01';
  const tinybars = parseHbar(amount);
  const merchantAddress = await merchantEvmAddress(merchantId);
  const checkout = checkoutUri({ deployment, merchantId, merchantAddress, tinybars });
  const qr = await qrText(checkout.uri);

  console.log('\nNew Hedera testnet checkout request:');
  console.log(checkout.uri);
  console.log(qr);

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Opago HBAR Checkout Demo</title>',
    '<style>body{font-family:system-ui;background:#0b0d10;color:#f4f6f8;margin:0;padding:32px}',
    'main{max-width:760px;margin:auto;background:#15191f;padding:28px;border-radius:18px}',
    '.badge{display:inline-block;background:#f3c33c;color:#111;padding:6px 10px;border-radius:999px;font-weight:800}',
    'pre{background:#fff;color:#000;padding:20px;overflow:auto;line-height:1;font-size:14px}',
    'code{overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:180px 1fr;gap:10px}',
    'input,button{font:inherit;padding:10px;border-radius:8px;border:0}button{font-weight:700}</style>',
    '</head><body><main><span class="badge">HEDERA TESTNET</span>',
    '<h1>Opago HBAR Checkout</h1>',
    '<form method="get"><label>Amount in HBAR <input name="amount" value="' +
      escapeHtml(formatTinybars(tinybars)) +
      '"></label> <button>New payment request</button></form>',
    '<pre>' + escapeHtml(qr) + '</pre><div class="grid">',
    '<strong>Amount</strong><span>' + escapeHtml(formatTinybars(tinybars)) + ' HBAR</span>',
    '<strong>Merchant</strong><code>' + escapeHtml(merchantId) + '</code>',
    '<strong>Contract</strong><code>' + escapeHtml(deployment.contractId) + '</code>',
    '<strong>Payment ID</strong><code>' + escapeHtml(checkout.paymentId) + '</code>',
    '<strong>Request nonce</strong><code>' + escapeHtml(checkout.requestNonce) + '</code>',
    '<strong>Expires</strong><span>' +
      escapeHtml(new Date(checkout.expiresAt * 1000).toISOString()) +
      '</span></div>',
    '<h2>Request URI</h2><code>' + escapeHtml(checkout.uri) + '</code>',
    '</main></body></html>',
  ].join('\n');
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    if (request.method !== 'GET' || url.pathname !== '/') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const html = await renderPage(url);
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    });
    response.end(html);
  } catch (error) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : 'Checkout demo failed.');
  }
});

server.listen(PORT, BIND_HOST, () => {
  console.log('Opago Hedera merchant demo: http://' + BIND_HOST + ':' + PORT);
  console.log('Merchant: ' + (process.env.HEDERA_MERCHANT_ID || '(not configured)'));
});