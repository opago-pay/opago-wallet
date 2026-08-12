'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Interface, solidityPackedKeccak256 } = require('ethers');

process.env.NODE_ENV = 'test';
process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP = 'true';
process.env.EXPO_PUBLIC_HEDERA_NETWORK = 'testnet';
process.env.EXPO_PUBLIC_HEDERA_MAX_TEST_TRANSFER_HBAR = '1';
process.env.EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID = '0.0.7777';
process.env.EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256 =
  'f3df0a62b10f205b0f29768aa3d69e777154caaa179f64aabb0a4899c666b017';
require('./register-typescript.cjs');

const {
  buildHederaCheckoutRequest,
  buildHederaCheckoutTransaction,
  computeHederaCheckoutPaymentId,
  parseHederaCheckoutRequest,
  verifyHederaCheckoutRequest,
} = require('../lib/hedera/checkout.ts');
const {
  createRequest: createPhase4Request,
  replaceParameter: replacePhase4Parameter,
} = require('../scripts/hedera-phase4-checkout-fixtures.cjs');

function requestUri(overrides = {}) {
  const values = {
    network: 'testnet',
    contractId: '0.0.7777',
    merchant: '0.0.8888',
    merchantEvmAddress: '0x1111111111111111111111111111111111111111',
    amount: '0.01',
    requestNonce: '0x' + 'cd'.repeat(32),
    expiresAt: '1700000300',
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, 'paymentId')) {
    values.paymentId = computeHederaCheckoutPaymentId({
      contractId: values.contractId,
      merchantEvmAddress: values.merchantEvmAddress,
      amountTinybars: BigInt(values.amount.replace('.', '').padEnd(9, '0')),
      requestNonce: values.requestNonce,
      expiresAt: Number(values.expiresAt),
    });
  }
  return 'opagowallet://hedera-checkout?' + new URLSearchParams(values).toString();
}

test('matches Solidity packed payment-ID derivation exactly', () => {
  const input = {
    contractId: '0.0.7777',
    merchantEvmAddress: '0x1111111111111111111111111111111111111111',
    amountTinybars: 1_000_000n,
    requestNonce: '0x' + 'cd'.repeat(32),
    expiresAt: 1_700_000_300,
  };
  const expected = solidityPackedKeccak256(
    ['bytes32', 'uint256', 'address', 'bytes32', 'address', 'uint256', 'uint64'],
    [
      '0x2cbcc7376617198b16e5d1ca7f3f2c64fb4cefed7bf20cd26d6e5a1af0230d9c',
      296n,
      '0x0000000000000000000000000000000000001e61',
      input.requestNonce,
      input.merchantEvmAddress,
      input.amountTinybars,
      input.expiresAt,
    ],
  );
  assert.equal(computeHederaCheckoutPaymentId(input), expected);
});

test('generates reproducible physical Phase 4 checkout fixtures without secrets', () => {
  const request = createPhase4Request({
    contractId: '0.0.7777',
    contractAddress: '0x0000000000000000000000000000000000001e61',
    merchantId: '0.0.8888',
    merchantEvmAddress: '0x1111111111111111111111111111111111111111',
    amountTinybars: 1n,
    expiresAt: 1_700_000_300,
  });
  assert.equal(parseHederaCheckoutRequest(request, 1_700_000_000).amountTinybars, 1n);
  assert.throws(
    () => parseHederaCheckoutRequest(
      replacePhase4Parameter(request, 'amount', '0.00000002'),
      1_700_000_000,
    ),
    /payment ID does not match/i,
  );
  assert.doesNotMatch(request, /private|mnemonic|operator/i);
});

test('parses a contract-bound exact Hedera checkout request', () => {
  const request = parseHederaCheckoutRequest(requestUri(), 1_700_000_000);
  assert.deepEqual(request, {
    kind: 'checkout',
    network: 'testnet',
    contractId: '0.0.7777',
    merchantAccountId: '0.0.8888',
    merchantEvmAddress: '0x1111111111111111111111111111111111111111',
    amountTinybars: 1_000_000n,
    amountHbar: '0.01',
    paymentId: computeHederaCheckoutPaymentId({
      contractId: '0.0.7777',
      merchantEvmAddress: '0x1111111111111111111111111111111111111111',
      amountTinybars: 1_000_000n,
      requestNonce: '0x' + 'cd'.repeat(32),
      expiresAt: 1_700_000_300,
    }),
    requestNonce: '0x' + 'cd'.repeat(32),
    expiresAt: 1_700_000_300,
  });
  assert.deepEqual(
    Object.fromEntries(new URL(buildHederaCheckoutRequest(request)).searchParams),
    Object.fromEntries(new URL(requestUri()).searchParams),
  );
});

test('rejects contract substitution, expiry abuse, and unknown parameters', () => {
  assert.throws(
    () => parseHederaCheckoutRequest(requestUri({ contractId: '0.0.9999' }), 1_700_000_000),
    /configured/i,
  );
  assert.throws(
    () => parseHederaCheckoutRequest(requestUri({ expiresAt: '1700000005' }), 1_700_000_000),
    /expired/i,
  );
  assert.throws(
    () => parseHederaCheckoutRequest(requestUri({ expiresAt: '1700010000' }), 1_700_000_000),
    /far in the future/i,
  );
  assert.throws(
    () => parseHederaCheckoutRequest(requestUri() + '&redirect=https://example.com', 1_700_000_000),
    /unsupported/i,
  );
});

test('rejects payment IDs whose merchant, amount, expiry, or nonce was altered', () => {
  const original = new URL(requestUri());
  for (const [name, value] of [
    ['merchantEvmAddress', '0x2222222222222222222222222222222222222222'],
    ['amount', '0.02'],
    ['expiresAt', '1700000301'],
    ['requestNonce', '0x' + 'ef'.repeat(32)],
  ]) {
    const changed = new URL(original);
    changed.searchParams.set(name, value);
    assert.throws(
      () => parseHederaCheckoutRequest(changed.toString(), 1_700_000_000),
      /bound request fields/i,
    );
  }
});

test('builds the exact payable contract call used by the Android client', () => {
  const now = Math.floor(Date.now() / 1000);
  const request = parseHederaCheckoutRequest(
    requestUri({ expiresAt: String(now + 300) }),
    now,
  );
  const transaction = buildHederaCheckoutTransaction(request);
  const expectedCall = new Interface([
    'function pay(bytes32,bytes32,address,uint256,uint64)',
  ]).encodeFunctionData('pay', [
    request.paymentId,
    request.requestNonce,
    request.merchantEvmAddress,
    request.amountTinybars,
    request.expiresAt,
  ]);

  assert.equal(transaction.contractId.toString(), request.contractId);
  assert.equal(transaction.gas.toString(), '300000');
  assert.equal(transaction.payableAmount.toTinybars().toString(), '1000000');
  assert.equal(
    '0x' + Buffer.from(transaction.functionParameters).toString('hex'),
    expectedCall,
  );
});

function mirrorResponse(body) {
  return {
    redirected: false,
    ok: true,
    status: 200,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
    text: async () => JSON.stringify(body),
  };
}

test('verifies merchant alias and the pinned contract runtime through Mirror Node', async t => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async input => {
    const url = new URL(String(input));
    return mirrorResponse(
      url.pathname.includes('/accounts/')
        ? {
            account: '0.0.8888',
            deleted: false,
            evm_address: '0x1111111111111111111111111111111111111111',
          }
        : {
            contract_id: '0.0.7777',
            deleted: false,
            evm_address: '0x0000000000000000000000000000000000001e61',
            runtime_bytecode: '0x6000',
          },
    );
  };
  const now = Math.floor(Date.now() / 1000);
  const request = parseHederaCheckoutRequest(
    requestUri({ expiresAt: String(now + 300) }),
    now,
  );
  await verifyHederaCheckoutRequest(request);
});

test('rejects a Mirror Node merchant alias mismatch', async t => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async input => {
    const url = new URL(String(input));
    return mirrorResponse(
      url.pathname.includes('/accounts/')
        ? {
            account: '0.0.8888',
            deleted: false,
            evm_address: '0x2222222222222222222222222222222222222222',
          }
        : {
            contract_id: '0.0.7777',
            deleted: false,
            runtime_bytecode: '0x6000',
          },
    );
  };
  const now = Math.floor(Date.now() / 1000);
  const request = parseHederaCheckoutRequest(
    requestUri({ expiresAt: String(now + 300) }),
    now,
  );
  await assert.rejects(verifyHederaCheckoutRequest(request), /do not match/i);
});

test('rejects an active contract whose runtime bytecode is not the pinned build', async t => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async input => {
    const url = new URL(String(input));
    return mirrorResponse(
      url.pathname.includes('/accounts/')
        ? {
            account: '0.0.8888',
            deleted: false,
            evm_address: '0x1111111111111111111111111111111111111111',
          }
        : {
            contract_id: '0.0.7777',
            deleted: false,
            evm_address: '0x0000000000000000000000000000000000001e61',
            runtime_bytecode: '0x6001',
          },
    );
  };
  const now = Math.floor(Date.now() / 1000);
  const request = parseHederaCheckoutRequest(
    requestUri({ expiresAt: String(now + 300) }),
    now,
  );
  await assert.rejects(verifyHederaCheckoutRequest(request), /pinned build/i);
});

test('keeps deployment evidence honest and operator secrets out of public data', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'deployments', 'hedera-testnet.json'), 'utf8'),
  );
  assert.equal(manifest.network, 'testnet');
  assert.equal(manifest.chainId, 296);
  assert.equal(manifest.status, 'deployed');
  assert.equal(manifest.contractId, '0.0.9972670');
  assert.equal(manifest.evmAddress, '0x0000000000000000000000000000000000982bbe');
  assert.match(manifest.deploymentTransactionId, /^0\.0\.\d+@\d+\.\d{9}$/);
  assert.match(manifest.bytecodeSha256, /^[0-9a-f]{64}$/);
  assert.match(manifest.runtimeBytecodeSha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.compilerSourceLineEndings, 'CRLF');
  assert.equal(manifest.sourceVerification.provider, 'Sourcify');
  assert.equal(manifest.sourceVerification.status, 'verified');
  assert.ok(Date.parse(manifest.sourceVerification.verifiedAt));
  assert.equal(
    manifest.hashscanContractUrl,
    'https://hashscan.io/testnet/contract/0.0.9972670',
  );
  const publicEvidence = JSON.stringify(manifest);
  assert.doesNotMatch(publicEvidence, /operator|private.?key|faucet/i);

  const bundledSources = [
    path.join(root, 'app'),
    path.join(root, 'components'),
    path.join(root, 'hooks'),
    path.join(root, 'lib'),
  ];
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.[jt]sx?$/.test(entry.name)) files.push(file);
    }
  };
  bundledSources.forEach(visit);
  const unsafe = files.filter(file =>
    /EXPO_PUBLIC_[A-Z0-9_]*(?:OPERATOR|FAUCET|PRIVATE.*KEY)/i.test(
      fs.readFileSync(file, 'utf8'),
    ),
  );
  assert.deepEqual(unsafe, []);
});
