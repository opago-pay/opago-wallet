'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { AccountId, PublicKey } = require('@hiero-ledger/sdk');
const {
  NETWORKS,
  loadArtifact,
  sha256,
} = require('./hedera-deploy-checkout.cjs');

const ROOT = path.resolve(__dirname, '..');
const TINYBARS_PER_HBAR = 100_000_000n;
const CONTRACT_GAS_LIMIT = 1_500_000n;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required.');
  return value;
}

function normalizeNumericAccountId(value) {
  const normalized = value.trim().toLowerCase();
  if (!/^0\.0\.[1-9]\d*(?:-[a-z]{5})?$/.test(normalized)) {
    throw new Error('HEDERA_OPERATOR_ID must be a numeric 0.0.x account ID.');
  }
  const withoutChecksum = normalized.replace(/-[a-z]{5}$/, '');
  AccountId.fromString(withoutChecksum);
  return withoutChecksum;
}

function formatTinybars(value) {
  const tinybars = BigInt(value);
  const whole = tinybars / TINYBARS_PER_HBAR;
  const fraction = (tinybars % TINYBARS_PER_HBAR)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');
  return fraction ? whole + '.' + fraction : whole.toString();
}

async function fetchJson(url, purpose) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(purpose + ' failed with HTTP ' + response.status + '.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(purpose + ' returned invalid JSON.');
  }
}

function assertPublicOperatorAccount(account, expectedAccountId) {
  if (account.deleted) throw new Error('The Mainnet operator account is deleted.');
  if (account.account !== expectedAccountId) {
    throw new Error('Mirror Node returned a different Mainnet operator account.');
  }
  try {
    const publicKey = PublicKey.fromString(account.key?.key || '');
    if (!['ED25519', 'ECDSA'].includes(publicKey.type)) throw new Error('unsupported key');
    return publicKey.type;
  } catch {
    throw new Error('Mirror Node did not return a supported operator public key.');
  }
}

function loadMainnetManifest() {
  const deploymentPath = NETWORKS.mainnet.deploymentPath;
  if (!fs.existsSync(deploymentPath)) throw new Error('Mainnet deployment manifest is missing.');
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  if (deployment.network !== 'mainnet' || Number(deployment.chainId) !== 295) {
    throw new Error('Mainnet deployment manifest identifies the wrong network.');
  }
  if (deployment.status === 'deployed') {
    throw new Error('A Mainnet deployment is already recorded; refusing a new deployment preflight.');
  }
  if (deployment.status !== 'not-deployed') {
    throw new Error('Mainnet deployment manifest has an unsupported status.');
  }
  return deployment;
}

async function inspectMainnetPreflight(accountId) {
  const network = NETWORKS.mainnet;
  const artifact = loadArtifact();
  const runtimeBytecodeSha256 = sha256(artifact.deployedBytecode);
  const bytecodeSha256 = sha256(artifact.bytecode);
  loadMainnetManifest();

  const [account, networkFees] = await Promise.all([
    fetchJson(
      network.mirror + '/api/v1/accounts/' + encodeURIComponent(accountId),
      'Mainnet operator lookup',
    ),
    fetchJson(network.mirror + '/api/v1/network/fees', 'Mainnet fee lookup'),
  ]);
  const keyType = assertPublicOperatorAccount(account, accountId);
  const balanceTinybars = BigInt(account.balance?.balance ?? 0);
  const contractFee = networkFees.fees?.find(fee => fee.transaction_type === 'ContractCreate');
  if (!contractFee || !Number.isSafeInteger(contractFee.gas) || contractFee.gas <= 0) {
    throw new Error('Mainnet fee response did not contain a valid ContractCreate gas price.');
  }
  const gasPriceTinybars = BigInt(contractFee.gas);
  const gasCeilingTinybars = gasPriceTinybars * CONTRACT_GAS_LIMIT;
  const transactionFeeCeilingTinybars = BigInt(network.maxTransactionFeeTinybars);
  const recommendedStartingBalanceTinybars = BigInt(
    network.minimumStartingBalanceTinybars,
  );
  return {
    accountId,
    keyType,
    balanceTinybars,
    gasPriceTinybars,
    gasCeilingTinybars,
    transactionFeeCeilingTinybars,
    recommendedStartingBalanceTinybars,
    bytecodeSha256,
    runtimeBytecodeSha256,
  };
}

async function main() {
  if (process.env.HEDERA_OPERATOR_KEY) {
    throw new Error('Public preflight does not accept HEDERA_OPERATOR_KEY. Remove it first.');
  }
  const accountId = normalizeNumericAccountId(required('HEDERA_OPERATOR_ID'));
  const result = await inspectMainnetPreflight(accountId);
  console.log('Hedera Mainnet public deployment preflight');
  console.log('  account: ' + result.accountId);
  console.log('  key type: ' + result.keyType);
  console.log('  balance: ' + formatTinybars(result.balanceTinybars) + ' HBAR');
  console.log('  current ContractCreate gas price: ' + result.gasPriceTinybars + ' tinybar/gas');
  console.log('  1,500,000 gas ceiling: ' + formatTinybars(result.gasCeilingTinybars) + ' HBAR');
  console.log(
    '  configured per-transaction fee ceiling: ' +
      formatTinybars(result.transactionFeeCeilingTinybars) +
      ' HBAR',
  );
  console.log(
    '  recommended starting balance for the complete flow and canary: ' +
      formatTinybars(result.recommendedStartingBalanceTinybars) +
      ' HBAR',
  );
  console.log('  creation bytecode SHA-256: ' + result.bytecodeSha256);
  console.log('  runtime bytecode SHA-256: ' + result.runtimeBytecodeSha256);
  console.log('No transaction was submitted and no private key was used.');
  if (result.balanceTinybars < result.recommendedStartingBalanceTinybars) {
    throw new Error(
      'Operator balance is below the recommended 30 HBAR deployment and canary reserve. Fund the account and rerun.',
    );
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      'Hedera Mainnet preflight failed: ' +
        (error instanceof Error ? error.message : 'unknown error'),
    );
    process.exitCode = 1;
  });
}

module.exports = {
  assertPublicOperatorAccount,
  formatTinybars,
  inspectMainnetPreflight,
  normalizeNumericAccountId,
};
