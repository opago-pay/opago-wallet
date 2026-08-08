'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  AccountId,
  Client,
  ContractCreateFlow,
  Hbar,
} = require('@hiero-ledger/sdk');
const { parseOperatorKey } = require('./hedera-provision-testnet.cjs');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_PATH = path.join(
  ROOT,
  'artifacts',
  'contracts',
  'OpagoHbarCheckout.sol',
  'OpagoHbarCheckout.json',
);
const DEPLOYMENT_PATH = path.join(ROOT, 'deployments', 'hedera-testnet.json');
const HASHSCAN = 'https://hashscan.io/testnet';
// This is a transaction fee ceiling, not the amount charged. ContractCreateFlow
// needs enough headroom for bytecode file operations plus contract creation.
const MAX_DEPLOYMENT_FEE_TINYBAR = '5000000000';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required.');
  return value;
}

function rejectBundledSecrets() {
  const names = Object.keys(process.env).filter(
    name =>
      name.startsWith('EXPO_PUBLIC_') &&
      /(OPERATOR|FAUCET|PRIVATE.*KEY)/i.test(name),
  );
  if (names.length) {
    throw new Error('Refusing bundled operator/private-key variables: ' + names.join(', '));
  }
}

function sha256(bytecode) {
  const normalized = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
  if (!normalized || !/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Compiled contract bytecode is invalid.');
  }
  return crypto.createHash('sha256').update(Buffer.from(normalized, 'hex')).digest('hex');
}

function transactionUrl(transactionId) {
  const match = /^(\d+\.\d+\.\d+)@(\d+)\.(\d{1,9})$/.exec(transactionId);
  if (!match) throw new Error('Deployment transaction ID is invalid.');
  const canonical = match[1] + '@' + match[2] + '.' + match[3].padStart(9, '0');
  return HASHSCAN + '/transaction/' + encodeURIComponent(canonical);
}

function loadArtifact() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error('Contract artifact is missing. Run npm run contract:compile first.');
  }
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
  if (
    artifact.contractName !== 'OpagoHbarCheckout' ||
    typeof artifact.bytecode !== 'string' ||
    artifact.bytecode === '0x' ||
    typeof artifact.deployedBytecode !== 'string' ||
    artifact.deployedBytecode === '0x'
  ) {
    throw new Error('OpagoHbarCheckout artifact is incomplete.');
  }
  return artifact;
}

function refuseAccidentalRedeploy() {
  if (!fs.existsSync(DEPLOYMENT_PATH)) return;
  const current = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, 'utf8'));
  if (current.status === 'deployed' && process.env.HEDERA_ALLOW_REDEPLOY !== 'true') {
    throw new Error(
      'A testnet deployment is already recorded. Set HEDERA_ALLOW_REDEPLOY=true explicitly.',
    );
  }
}

function buildDeploymentRecord(input) {
  return {
    schemaVersion: 1,
    network: 'testnet',
    chainId: 296,
    status: 'deployed',
    contractName: 'OpagoHbarCheckout',
    contractId: input.contractId,
    evmAddress: input.evmAddress,
    deploymentTransactionId: input.transactionId,
    bytecodeSha256: sha256(input.artifact.bytecode),
    runtimeBytecodeSha256: sha256(input.artifact.deployedBytecode),
    deploymentSubmittedAt: input.deploymentSubmittedAt,
    deploymentConsensusTimestamp: input.deploymentConsensusTimestamp,
    deployedAt: input.deployedAt,
    hashscanContractUrl: HASHSCAN + '/contract/' + input.contractId,
    hashscanTransactionUrl: transactionUrl(input.transactionId),
    compiler: require('solc').version(),
    compilerSourceLineEndings: 'CRLF',
    sourceVerification: {
      provider: 'Sourcify',
      status: 'pending',
      verifiedAt: null,
    },
  };
}

async function main() {
  rejectBundledSecrets();
  refuseAccidentalRedeploy();
  const artifact = loadArtifact();
  const operatorIdValue = required('HEDERA_OPERATOR_ID');
  if (!/^0\.0\.[1-9]\d*$/.test(operatorIdValue)) {
    throw new Error('HEDERA_OPERATOR_ID must use numeric 0.0.x format.');
  }
  const operatorId = AccountId.fromString(operatorIdValue);
  const operatorKey = parseOperatorKey(required('HEDERA_OPERATOR_KEY'));
  const client = Client.forTestnet().setOperator(operatorId, operatorKey);
  client.setDefaultMaxTransactionFee(Hbar.fromTinybars(MAX_DEPLOYMENT_FEE_TINYBAR));

  try {
    const response = await new ContractCreateFlow()
      .setBytecode(artifact.bytecode)
      .setGas(1_500_000)
      .setContractMemo('Opago HBAR Checkout Phase 3')
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== 'SUCCESS' || !receipt.contractId) {
      throw new Error('Contract deployment returned ' + receipt.status.toString() + '.');
    }
    const contractId = receipt.contractId.toString();
    const transactionId = response.transactionId.toString();
    const evmAddress = '0x' + receipt.contractId.toSolidityAddress();
    let deploymentConsensusTimestamp = null;
    let deployedAt = null;
    try {
      const record = await response.getRecord(client);
      if (record.consensusTimestamp) {
        deploymentConsensusTimestamp = record.consensusTimestamp.toString();
        deployedAt = record.consensusTimestamp.toDate().toISOString();
      }
    } catch {
      console.warn('Deployment succeeded; consensus time will be filled from Mirror Node.');
    }
    const deployment = buildDeploymentRecord({
      artifact,
      contractId,
      evmAddress,
      transactionId,
      deploymentSubmittedAt: new Date().toISOString(),
      deploymentConsensusTimestamp,
      deployedAt,
    });
    fs.writeFileSync(DEPLOYMENT_PATH, JSON.stringify(deployment, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o644,
    });
    console.log('Deployed OpagoHbarCheckout to Hedera testnet.');
    console.log('  contract: ' + contractId);
    console.log('  EVM address: ' + evmAddress);
    console.log('  transaction: ' + transactionId);
    console.log('  explorer: ' + deployment.hashscanContractUrl);
    console.log('Next: run npm run contract:verify:testnet.');
    console.log('After verification configure the app build with:');
    console.log('  EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID=' + contractId);
    console.log(
      '  EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256=' + deployment.runtimeBytecodeSha256,
    );
  } finally {
    client.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      'Hedera checkout deployment failed: ' +
        (error instanceof Error ? error.message : 'unknown error'),
    );
    process.exitCode = 1;
  });
}

module.exports = { buildDeploymentRecord, sha256, transactionUrl };
