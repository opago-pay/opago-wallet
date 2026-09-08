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
const NETWORKS = Object.freeze({
  testnet: Object.freeze({
    name: 'testnet',
    chainId: 296,
    deploymentPath: path.join(ROOT, 'deployments', 'hedera-testnet.json'),
    hashscan: 'https://hashscan.io/testnet',
    mirror: 'https://testnet.mirrornode.hedera.com',
    maxTransactionFeeTinybars: '2000000000',
  }),
  mainnet: Object.freeze({
    name: 'mainnet',
    chainId: 295,
    deploymentPath: path.join(ROOT, 'deployments', 'hedera-mainnet.json'),
    hashscan: 'https://hashscan.io/mainnet',
    mirror: 'https://mainnet.mirrornode.hedera.com',
    maxTransactionFeeTinybars: '2000000000',
    minimumStartingBalanceTinybars: '3000000000',
  }),
});
// This is a transaction fee ceiling, not the amount charged. ContractCreateFlow
// needs enough headroom for bytecode file operations plus contract creation.
// The pinned SDK validates this value through Long.toInt(), so it must remain at
// or below 2,147,483,647 tinybars even though Hbar itself supports larger values.
const MAINNET_APPROVAL = 'DEPLOY_OPAGO_HBAR_CHECKOUT_TO_MAINNET';

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

function resolveDeploymentNetwork(argv = process.argv.slice(2)) {
  let value = 'testnet';
  const equalsArgument = argv.find(argument => argument.startsWith('--network='));
  const index = argv.indexOf('--network');
  if (equalsArgument) value = equalsArgument.slice('--network='.length);
  if (index >= 0) value = argv[index + 1] || '';
  if (!Object.prototype.hasOwnProperty.call(NETWORKS, value)) {
    throw new Error('Deployment network must be explicitly set to testnet or mainnet.');
  }
  return NETWORKS[value];
}

function transactionUrl(transactionId, network = 'testnet') {
  if (!NETWORKS[network]) throw new Error('Deployment transaction network is invalid.');
  const match = /^(\d+\.\d+\.\d+)@(\d+)\.(\d{1,9})$/.exec(transactionId);
  if (!match) throw new Error('Deployment transaction ID is invalid.');
  const canonical = match[1] + '@' + match[2] + '.' + match[3].padStart(9, '0');
  return NETWORKS[network].hashscan + '/transaction/' + encodeURIComponent(canonical);
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

function refuseAccidentalRedeploy(network) {
  if (!fs.existsSync(network.deploymentPath)) return;
  const current = JSON.parse(fs.readFileSync(network.deploymentPath, 'utf8'));
  if (current.status === 'deployed' && process.env.HEDERA_ALLOW_REDEPLOY !== 'true') {
    throw new Error(
      'A ' + network.name +
        ' deployment is already recorded. Set HEDERA_ALLOW_REDEPLOY=true explicitly.',
    );
  }
}

function assertMainnetDeploymentApproved(network, runtimeBytecodeSha256) {
  if (network.name !== 'mainnet') return;
  if (process.env.HEDERA_MAINNET_DEPLOY_APPROVAL !== MAINNET_APPROVAL) {
    throw new Error(
      'Mainnet deployment requires HEDERA_MAINNET_DEPLOY_APPROVAL=' + MAINNET_APPROVAL + '.',
    );
  }
  const approvedRuntime = required('HEDERA_APPROVED_RUNTIME_SHA256').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(approvedRuntime) || approvedRuntime !== runtimeBytecodeSha256) {
    throw new Error(
      'HEDERA_APPROVED_RUNTIME_SHA256 must exactly match the compiled runtime bytecode. No transaction was submitted.',
    );
  }
}

async function loadOperatorAccount(network, accountId) {
  const response = await fetch(
    network.mirror + '/api/v1/accounts/' + encodeURIComponent(accountId),
    {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      network.name + ' Mirror Node operator lookup failed with HTTP ' + response.status + '.',
    );
  }
  const account = await response.json();
  if (account.deleted) throw new Error('The Hedera operator account is deleted.');
  return account;
}

function assertSufficientOperatorBalance(network, balanceTinybars) {
  const balance = BigInt(balanceTinybars ?? 0);
  if (balance <= 0n) {
    throw new Error('The Hedera operator account has no HBAR. No transaction was submitted.');
  }
  if (
    network.name === 'mainnet' &&
    balance < BigInt(network.minimumStartingBalanceTinybars)
  ) {
    throw new Error(
      'The Mainnet operator account needs at least 30 HBAR before this deployment flow. No transaction was submitted.',
    );
  }
}

function buildDeploymentRecord(input, networkName = 'testnet') {
  const network = NETWORKS[networkName];
  if (!network) throw new Error('Deployment record network is invalid.');
  return {
    schemaVersion: 1,
    network: network.name,
    chainId: network.chainId,
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
    hashscanContractUrl: network.hashscan + '/contract/' + input.contractId,
    hashscanTransactionUrl: transactionUrl(input.transactionId, network.name),
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
  const network = resolveDeploymentNetwork();
  refuseAccidentalRedeploy(network);
  const artifact = loadArtifact();
  const runtimeBytecodeSha256 = sha256(artifact.deployedBytecode);
  assertMainnetDeploymentApproved(network, runtimeBytecodeSha256);
  const operatorIdValue = required('HEDERA_OPERATOR_ID');
  if (!/^0\.0\.[1-9]\d*$/.test(operatorIdValue)) {
    throw new Error('HEDERA_OPERATOR_ID must use numeric 0.0.x format.');
  }
  const operatorId = AccountId.fromString(operatorIdValue);
  const operatorKey = parseOperatorKey(required('HEDERA_OPERATOR_KEY'));
  const operatorAccount = await loadOperatorAccount(network, operatorIdValue);
  const { assertOperatorKeyMatchesAccount } = require('./hedera-provision-testnet.cjs');
  assertOperatorKeyMatchesAccount(operatorKey, operatorAccount);
  assertSufficientOperatorBalance(network, operatorAccount.balance?.balance);
  const client = (network.name === 'mainnet' ? Client.forMainnet() : Client.forTestnet())
    .setOperator(operatorId, operatorKey);
  client.setDefaultMaxTransactionFee(
    Hbar.fromTinybars(network.maxTransactionFeeTinybars),
  );

  try {
    const response = await new ContractCreateFlow()
      .setBytecode(artifact.bytecode)
      .setGas(1_500_000)
      .setContractMemo('Opago HBAR Checkout ' + network.name)
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
    }, network.name);
    fs.writeFileSync(network.deploymentPath, JSON.stringify(deployment, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o644,
    });
    console.log('Deployed OpagoHbarCheckout to Hedera ' + network.name + '.');
    console.log('  contract: ' + contractId);
    console.log('  EVM address: ' + evmAddress);
    console.log('  transaction: ' + transactionId);
    console.log('  explorer: ' + deployment.hashscanContractUrl);
    console.log('Next: run npm run contract:verify:' + network.name + '.');
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

module.exports = {
  MAINNET_APPROVAL,
  NETWORKS,
  assertMainnetDeploymentApproved,
  assertSufficientOperatorBalance,
  buildDeploymentRecord,
  loadArtifact,
  loadOperatorAccount,
  resolveDeploymentNetwork,
  sha256,
  transactionUrl,
};
