'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ContractCreateFlow } = require('@hiero-ledger/sdk');
const {
  MAINNET_APPROVAL,
  NETWORKS,
  assertMainnetDeploymentApproved,
  assertSufficientOperatorBalance,
  buildDeploymentRecord,
  resolveDeploymentNetwork,
  sha256,
  transactionUrl,
} = require('../scripts/hedera-deploy-checkout.cjs');
const {
  consensusTimestampToIso,
  isExactRuntimeMatch,
  resolveVerificationNetwork,
  sourcifyCompilerVersion,
} = require('../scripts/hedera-verify-checkout.cjs');
const {
  assertPublicOperatorAccount,
  formatTinybars,
  normalizeNumericAccountId,
} = require('../scripts/hedera-mainnet-preflight.cjs');

test('builds complete public deployment evidence from a successful receipt', () => {
  const artifact = {
    bytecode: '0x6000',
    deployedBytecode: '0x6001',
  };
  const deployment = buildDeploymentRecord({
    artifact,
    contractId: '0.0.7777',
    evmAddress: '0x0000000000000000000000000000000000001e61',
    transactionId: '0.0.1234@1700000000.123',
    deploymentSubmittedAt: '2026-08-07T01:02:03.000Z',
    deploymentConsensusTimestamp: '1700000000.123456789',
    deployedAt: '2023-11-14T22:13:20.123Z',
  });

  assert.equal(deployment.network, 'testnet');
  assert.equal(deployment.chainId, 296);
  assert.equal(deployment.status, 'deployed');
  assert.equal(deployment.contractId, '0.0.7777');
  assert.equal(deployment.compilerSourceLineEndings, 'CRLF');
  assert.equal(deployment.deploymentConsensusTimestamp, '1700000000.123456789');
  assert.equal(
    deployment.bytecodeSha256,
    crypto.createHash('sha256').update(Buffer.from('6000', 'hex')).digest('hex'),
  );
  assert.equal(
    deployment.runtimeBytecodeSha256,
    crypto.createHash('sha256').update(Buffer.from('6001', 'hex')).digest('hex'),
  );
  assert.equal(
    deployment.hashscanTransactionUrl,
    'https://hashscan.io/testnet/transaction/0.0.1234%401700000000.000000123',
  );
  assert.doesNotMatch(JSON.stringify(deployment), /operator|private.?key|faucet/i);
});

test('uses the SDK-supported artifact bytecode format and strict helper validation', () => {
  const flow = new ContractCreateFlow().setBytecode('0x6000');
  assert.equal(Buffer.from(flow.bytecode).toString('utf8'), '0x6000');
  assert.equal(
    sha256('0x6000'),
    crypto.createHash('sha256').update(Buffer.from('6000', 'hex')).digest('hex'),
  );
  assert.throws(() => sha256('0x123'), /invalid/i);
  assert.throws(() => transactionUrl('not-a-transaction'), /invalid/i);
});

test('builds network-specific Mainnet evidence without weakening testnet defaults', () => {
  const input = {
    artifact: { bytecode: '0x6000', deployedBytecode: '0x6001' },
    contractId: '0.0.8888',
    evmAddress: '0x00000000000000000000000000000000000022b8',
    transactionId: '0.0.1234@1700000000.123',
    deploymentSubmittedAt: '2026-09-07T01:02:03.000Z',
    deploymentConsensusTimestamp: '1700000000.123456789',
    deployedAt: '2023-11-14T22:13:20.123Z',
  };
  const deployment = buildDeploymentRecord(input, 'mainnet');
  assert.equal(deployment.network, 'mainnet');
  assert.equal(deployment.chainId, 295);
  assert.equal(
    deployment.hashscanContractUrl,
    'https://hashscan.io/mainnet/contract/0.0.8888',
  );
  assert.match(deployment.hashscanTransactionUrl, /hashscan\.io\/mainnet\/transaction/);
  assert.equal(resolveDeploymentNetwork([]).name, 'testnet');
  assert.equal(resolveDeploymentNetwork(['--network', 'mainnet']).name, 'mainnet');
  assert.equal(resolveVerificationNetwork(['--network=mainnet']).name, 'mainnet');
  assert.throws(() => resolveDeploymentNetwork(['--network', 'previewnet']), /testnet or mainnet/i);
  assert.throws(() => transactionUrl(input.transactionId, 'previewnet'), /network is invalid/i);
});

test('requires an exact artifact hash and explicit approval before Mainnet deployment', t => {
  const approval = process.env.HEDERA_MAINNET_DEPLOY_APPROVAL;
  const approvedRuntime = process.env.HEDERA_APPROVED_RUNTIME_SHA256;
  t.after(() => {
    if (approval === undefined) delete process.env.HEDERA_MAINNET_DEPLOY_APPROVAL;
    else process.env.HEDERA_MAINNET_DEPLOY_APPROVAL = approval;
    if (approvedRuntime === undefined) delete process.env.HEDERA_APPROVED_RUNTIME_SHA256;
    else process.env.HEDERA_APPROVED_RUNTIME_SHA256 = approvedRuntime;
  });
  const runtimeHash = 'a'.repeat(64);
  delete process.env.HEDERA_MAINNET_DEPLOY_APPROVAL;
  delete process.env.HEDERA_APPROVED_RUNTIME_SHA256;
  assert.throws(
    () => assertMainnetDeploymentApproved(NETWORKS.mainnet, runtimeHash),
    /requires HEDERA_MAINNET_DEPLOY_APPROVAL/i,
  );
  process.env.HEDERA_MAINNET_DEPLOY_APPROVAL = MAINNET_APPROVAL;
  process.env.HEDERA_APPROVED_RUNTIME_SHA256 = 'b'.repeat(64);
  assert.throws(
    () => assertMainnetDeploymentApproved(NETWORKS.mainnet, runtimeHash),
    /exactly match/i,
  );
  process.env.HEDERA_APPROVED_RUNTIME_SHA256 = runtimeHash;
  assert.doesNotThrow(() => assertMainnetDeploymentApproved(NETWORKS.mainnet, runtimeHash));
  assert.doesNotThrow(() => assertMainnetDeploymentApproved(NETWORKS.testnet, runtimeHash));
});

test('blocks underfunded Mainnet deployment before any network transaction', () => {
  assert.throws(
    () => assertSufficientOperatorBalance(NETWORKS.mainnet, 0n),
    /no HBAR/i,
  );
  assert.throws(
    () => assertSufficientOperatorBalance(NETWORKS.mainnet, 2_999_999_999n),
    /at least 30 HBAR/i,
  );
  assert.doesNotThrow(() =>
    assertSufficientOperatorBalance(NETWORKS.mainnet, 3_000_000_000n),
  );
  assert.doesNotThrow(() => assertSufficientOperatorBalance(NETWORKS.testnet, 1n));
});

test('validates public Mainnet preflight inputs without requiring private material', () => {
  assert.equal(normalizeNumericAccountId('0.0.10848889-xohme'), '0.0.10848889');
  assert.throws(() => normalizeNumericAccountId('0.0.0'), /numeric/i);
  assert.equal(formatTinybars(500_000_000n), '5');
  assert.equal(formatTinybars(153_000_000n), '1.53');
  assert.equal(
    assertPublicOperatorAccount(
      {
        account: '0.0.10848889',
        deleted: false,
        key: {
          _type: 'ED25519',
          key: 'da2595f23c42f0a9c88f01bf68a23bb044822fea417fe158334c5c3b42502670',
        },
      },
      '0.0.10848889',
    ),
    'ED25519',
  );
  assert.throws(
    () => assertPublicOperatorAccount({ account: '0.0.1', deleted: true }, '0.0.1'),
    /deleted/i,
  );
});

test('keeps Mainnet evidence explicitly undeployed until a real receipt exists', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'deployments', 'hedera-mainnet.json'), 'utf8'),
  );
  assert.equal(manifest.network, 'mainnet');
  assert.equal(manifest.chainId, 295);
  assert.equal(manifest.status, 'not-deployed');
  assert.equal(manifest.contractId, null);
  assert.equal(manifest.deploymentTransactionId, null);
  assert.equal(manifest.runtimeBytecodeSha256, null);
  assert.doesNotMatch(JSON.stringify(manifest), /private.?key|mnemonic|recovery phrase/i);
});

test('converts Hedera consensus timestamps into reproducible ISO evidence', () => {
  assert.equal(
    consensusTimestampToIso('1700000000.123456789'),
    '2023-11-14T22:13:20.123Z',
  );
  assert.throws(() => consensusTimestampToIso('not-a-timestamp'), /invalid/i);
});

test('sends Sourcify a downloadable Solidity compiler version', () => {
  assert.equal(
    sourcifyCompilerVersion('0.8.28+commit.7893614a.Emscripten.clang'),
    '0.8.28+commit.7893614a',
  );
  assert.equal(
    sourcifyCompilerVersion('v0.8.28+commit.7893614a'),
    '0.8.28+commit.7893614a',
  );
  assert.throws(() => sourcifyCompilerVersion('0.8.28'), /invalid/i);
});

test('accepts only Sourcify exact runtime-match statuses', () => {
  assert.equal(isExactRuntimeMatch('exact_match'), true);
  assert.equal(isExactRuntimeMatch('match'), true);
  assert.equal(isExactRuntimeMatch('partial_match'), false);
  assert.equal(isExactRuntimeMatch(null), false);
});
