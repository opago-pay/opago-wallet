'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const qrcode = require('qrcode-terminal');
const { solidityPackedKeccak256 } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const TINYBARS_PER_HBAR = 100_000_000n;
const MAX_TINYBARS = TINYBARS_PER_HBAR;
const PAYMENT_DOMAIN =
  '0x2cbcc7376617198b16e5d1ca7f3f2c64fb4cefed7bf20cd26d6e5a1af0230d9c';
const PORT = Number.parseInt(process.env.HEDERA_MERCHANT_DEMO_PORT || '3334', 10);
const BIND_HOST = process.env.HEDERA_MERCHANT_DEMO_BIND_HOST || '127.0.0.1';
const NETWORKS = Object.freeze({
  testnet: Object.freeze({
    name: 'testnet',
    label: 'HEDERA TESTNET',
    chainId: 296n,
    mirror: 'https://testnet.mirrornode.hedera.com',
    hashscan: 'https://hashscan.io/testnet',
    deploymentPath: path.join(ROOT, 'deployments', 'hedera-testnet.json'),
  }),
  mainnet: Object.freeze({
    name: 'mainnet',
    label: 'HEDERA MAINNET — REAL HBAR',
    chainId: 295n,
    mirror: 'https://mainnet.mirrornode.hedera.com',
    hashscan: 'https://hashscan.io/mainnet',
    deploymentPath: path.join(ROOT, 'deployments', 'hedera-mainnet.json'),
  }),
});

function resolveDemoNetwork(value) {
  let configured = value;
  if (configured === undefined) {
    const argv = process.argv.slice(2);
    const equalsArgument = argv.find(argument => argument.startsWith('--network='));
    const index = argv.indexOf('--network');
    configured = equalsArgument
      ? equalsArgument.slice('--network='.length)
      : index >= 0
        ? argv[index + 1]
        : process.env.HEDERA_MERCHANT_DEMO_NETWORK || 'testnet';
  }
  const normalized = String(configured || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(NETWORKS, normalized)) {
    throw new Error('HEDERA_MERCHANT_DEMO_NETWORK must be testnet or mainnet.');
  }
  return NETWORKS[normalized];
}

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

function loadDeployment(network = resolveDemoNetwork()) {
  if (!fs.existsSync(network.deploymentPath)) throw new Error('Deployment manifest is missing.');
  const deployment = JSON.parse(fs.readFileSync(network.deploymentPath, 'utf8'));
  if (
    deployment.network !== network.name ||
    BigInt(deployment.chainId ?? 0) !== network.chainId ||
    deployment.status !== 'deployed' ||
    !/^0\.0\.[1-9]\d*$/.test(deployment.contractId || '') ||
    !/^0x[0-9a-f]{40}$/i.test(deployment.evmAddress || '') ||
    !/^[0-9a-f]{64}$/i.test(deployment.runtimeBytecodeSha256 || '') ||
    deployment.sourceVerification?.status !== 'verified'
  ) {
    throw new Error(
      'Deploy and verify OpagoHbarCheckout on Hedera ' + network.name + ' first.',
    );
  }
  return {
    contractId: deployment.contractId,
    evmAddress: deployment.evmAddress.toLowerCase(),
    runtimeBytecodeSha256: deployment.runtimeBytecodeSha256.toLowerCase(),
    hashscanContractUrl:
      deployment.hashscanContractUrl || network.hashscan + '/contract/' + deployment.contractId,
  };
}

function requiredMerchantId(network = resolveDemoNetwork()) {
  const value = process.env.HEDERA_MERCHANT_ID?.trim();
  if (!value || !/^0\.0\.[1-9]\d*$/.test(value)) {
    throw new Error(
      'HEDERA_MERCHANT_ID must use numeric 0.0.x ' + network.name + ' format.',
    );
  }
  return value;
}

async function merchantEvmAddress(accountId, network = resolveDemoNetwork()) {
  const response = await fetch(
    network.mirror + '/api/v1/accounts/' + encodeURIComponent(accountId),
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
    throw new Error('Merchant account has no usable Hedera ' + network.name + ' EVM address.');
  }
  return evm;
}

function checkoutUri({
  deployment,
  merchantId,
  merchantAddress,
  tinybars,
  network = resolveDemoNetwork(),
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const expiresAt = nowSeconds + 5 * 60;
  const requestNonce = '0x' + crypto.randomBytes(32).toString('hex');
  const paymentId = solidityPackedKeccak256(
    ['bytes32', 'uint256', 'address', 'bytes32', 'address', 'uint256', 'uint64'],
    [
      PAYMENT_DOMAIN,
      network.chainId,
      deployment.evmAddress,
      requestNonce,
      merchantAddress,
      tinybars,
      expiresAt,
    ],
  );
  const params = new URLSearchParams({
    network: network.name,
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

async function renderPage(requestUrl, network = resolveDemoNetwork()) {
  const deployment = loadDeployment(network);
  const merchantId = requiredMerchantId(network);
  const amount = requestUrl.searchParams.get('amount') || '0.01';
  const tinybars = parseHbar(amount);
  const merchantAddress = await merchantEvmAddress(merchantId, network);
  const checkout = checkoutUri({
    deployment,
    merchantId,
    merchantAddress,
    tinybars,
    network,
  });
  const qr = await qrText(checkout.uri);

  console.log('\nNew Hedera ' + network.name + ' checkout request:');
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
    '</head><body><main><span class="badge">' + escapeHtml(network.label) + '</span>',
    '<h1>Opago HBAR Checkout</h1>',
    '<form method="get"><label>Amount in HBAR <input name="amount" value="' +
      escapeHtml(formatTinybars(tinybars)) +
      '"></label> <button>New payment request</button></form>',
    '<pre>' + escapeHtml(qr) + '</pre><div class="grid">',
    '<strong>Amount</strong><span>' + escapeHtml(formatTinybars(tinybars)) + ' HBAR</span>',
    '<strong>Merchant</strong><code>' + escapeHtml(merchantId) + '</code>',
    '<strong>Contract</strong><code>' + escapeHtml(deployment.contractId) + '</code>',
    '<strong>Network</strong><code>' + escapeHtml(network.name) + ' / chain ' +
      escapeHtml(network.chainId) + '</code>',
    '<strong>Payment ID</strong><code>' + escapeHtml(checkout.paymentId) + '</code>',
    '<strong>Request nonce</strong><code>' + escapeHtml(checkout.requestNonce) + '</code>',
    '<strong>Expires</strong><span>' +
      escapeHtml(new Date(checkout.expiresAt * 1000).toISOString()) +
      '</span></div>',
    '<h2>Request URI</h2><code>' + escapeHtml(checkout.uri) + '</code>',
    '<p><a href="' + escapeHtml(deployment.hashscanContractUrl) +
      '" rel="noreferrer">Open verified contract in HashScan</a></p>',
    '</main></body></html>',
  ].join('\n');
}

function createServer(network = resolveDemoNetwork()) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      if (request.method !== 'GET' || url.pathname !== '/') {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      const html = await renderPage(url, network);
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
}

if (require.main === module) {
  const network = resolveDemoNetwork();
  const server = createServer(network);
  server.listen(PORT, BIND_HOST, () => {
    console.log('Opago Hedera ' + network.name + ' merchant demo: http://' + BIND_HOST + ':' + PORT);
    console.log('Merchant: ' + (process.env.HEDERA_MERCHANT_ID || '(not configured)'));
  });
}

module.exports = {
  NETWORKS,
  checkoutUri,
  createServer,
  formatTinybars,
  loadDeployment,
  merchantEvmAddress,
  parseHbar,
  renderPage,
  requiredMerchantId,
  resolveDemoNetwork,
};
