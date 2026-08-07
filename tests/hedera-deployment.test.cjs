'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { ContractCreateFlow } = require('@hiero-ledger/sdk');
const {
  buildDeploymentRecord,
  sha256,
  transactionUrl,
} = require('../scripts/hedera-deploy-checkout.cjs');
const {
  consensusTimestampToIso,
} = require('../scripts/hedera-verify-checkout.cjs');

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

test('converts Hedera consensus timestamps into reproducible ISO evidence', () => {
  assert.equal(
    consensusTimestampToIso('1700000000.123456789'),
    '2023-11-14T22:13:20.123Z',
  );
  assert.throws(() => consensusTimestampToIso('not-a-timestamp'), /invalid/i);
});