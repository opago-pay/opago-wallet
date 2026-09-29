'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_PATH = path.join(
  ROOT,
  'artifacts',
  'contracts',
  'OpagoHbarCheckout.sol',
  'OpagoHbarCheckout.json',
);
const SOURCIFY = 'https://sourcify.dev/server';
const VERIFICATION_POLL_ATTEMPTS = 20;
const VERIFICATION_POLL_INTERVAL_MS = 2_000;
const NETWORKS = Object.freeze({
  testnet: Object.freeze({
    name: 'testnet',
    chainId: '296',
    deploymentPath: path.join(ROOT, 'deployments', 'hedera-testnet.json'),
    mirror: 'https://testnet.mirrornode.hedera.com',
  }),
  mainnet: Object.freeze({
    name: 'mainnet',
    chainId: '295',
    deploymentPath: path.join(ROOT, 'deployments', 'hedera-mainnet.json'),
    mirror: 'https://mainnet.mirrornode.hedera.com',
  }),
});

function resolveVerificationNetwork(argv = process.argv.slice(2)) {
  let value = 'testnet';
  const equalsArgument = argv.find(argument => argument.startsWith('--network='));
  const index = argv.indexOf('--network');
  if (equalsArgument) value = equalsArgument.slice('--network='.length);
  if (index >= 0) value = argv[index + 1] || '';
  if (!Object.prototype.hasOwnProperty.call(NETWORKS, value)) {
    throw new Error('Verification network must be explicitly set to testnet or mainnet.');
  }
  return NETWORKS[value];
}

function sha256(bytecode) {
  const hex = bytecode.replace(/^0x/, '');
  return crypto.createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

function sourcifyCompilerVersion(value) {
  const match = /^(?:v)?(\d+\.\d+\.\d+\+commit\.[0-9a-f]{8})(?:\..+)?$/i.exec(
    String(value).trim(),
  );
  if (!match) throw new Error('Hardhat build info contains an invalid Solidity compiler version.');
  return match[1];
}

function isExactRuntimeMatch(value) {
  return value === 'match' || value === 'exact_match';
}

async function fetchJson(url, options, purpose) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options?.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(purpose + ' returned invalid JSON.');
  }
  return { response, body };
}

function loadBuildInfo() {
  const debugFile = ARTIFACT_PATH.replace(/\.json$/, '.dbg.json');
  if (fs.existsSync(debugFile)) {
    const debug = JSON.parse(fs.readFileSync(debugFile, 'utf8'));
    return JSON.parse(fs.readFileSync(path.resolve(path.dirname(debugFile), debug.buildInfo), 'utf8'));
  }
  const directory = path.join(ROOT, 'artifacts', 'build-info');
  const candidates = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter(name => name.endsWith('.json'))
    : [];
  for (const name of candidates) {
    const build = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    if (build.output?.contracts?.['contracts/OpagoHbarCheckout.sol']?.OpagoHbarCheckout) {
      return build;
    }
  }
  throw new Error('Hardhat build info is missing. Run npm run contract:compile.');
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitForVerification(verificationId) {
  for (let attempt = 0; attempt < VERIFICATION_POLL_ATTEMPTS; attempt += 1) {
    const job = await fetchJson(
      SOURCIFY + '/v2/verify/' + encodeURIComponent(verificationId),
      undefined,
      'Sourcify verification job',
    );
    if (!job.response.ok) {
      throw new Error('Sourcify job lookup failed with HTTP ' + job.response.status + '.');
    }
    if (job.body.isJobCompleted) {
      if (job.body.error || !isExactRuntimeMatch(job.body.contract?.runtimeMatch)) {
        throw new Error(
          'Sourcify verification did not produce an exact runtime match: ' +
            JSON.stringify(job.body.error || job.body.contract || {}),
        );
      }
      return {
        status: 'verified',
        verifiedAt: job.body.contract.verifiedAt || new Date().toISOString(),
      };
    }
    await delay(VERIFICATION_POLL_INTERVAL_MS);
  }
  return { status: 'submitted', verifiedAt: null };
}

function consensusTimestampToIso(value) {
  const match = /^(\d+)\.(\d{1,9})$/.exec(String(value));
  if (!match) throw new Error('Mirror Node contract creation timestamp is invalid.');
  const milliseconds = Number(BigInt(match[1]) * 1000n + BigInt(match[2].padEnd(9, '0')) / 1_000_000n);
  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error('Mirror Node contract creation timestamp is outside the safe date range.');
  }
  return new Date(milliseconds).toISOString();
}

async function main() {
  const network = resolveVerificationNetwork();
  if (!fs.existsSync(network.deploymentPath)) throw new Error('Deployment manifest is missing.');
  const deployment = JSON.parse(fs.readFileSync(network.deploymentPath, 'utf8'));
  if (
    deployment.network !== network.name ||
    String(deployment.chainId) !== network.chainId ||
    deployment.status !== 'deployed' ||
    !/^0\.0\.[1-9]\d*$/.test(deployment.contractId || '') ||
    !/^0x[0-9a-f]{40}$/i.test(deployment.evmAddress || '')
  ) {
    throw new Error('No real Hedera ' + network.name + ' deployment is recorded yet.');
  }
  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error('Contract artifact is missing. Run npm run contract:compile.');
  }
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
  const mirrorUrl =
    network.mirror + '/api/v1/contracts/' + encodeURIComponent(deployment.contractId);
  const { response: mirrorResponse, body: mirrorContract } = await fetchJson(
    mirrorUrl,
    undefined,
    'Hedera Mirror Node contract lookup',
  );
  if (!mirrorResponse.ok) {
    throw new Error('Mirror Node lookup failed with HTTP ' + mirrorResponse.status + '.');
  }
  if (
    mirrorContract.deleted ||
    mirrorContract.contract_id !== deployment.contractId ||
    ('0x' + String(mirrorContract.evm_address).replace(/^0x/, '')).toLowerCase() !==
      deployment.evmAddress.toLowerCase()
  ) {
    throw new Error('Mirror Node contract identity does not match the manifest.');
  }
  const deploymentConsensusTimestamp = String(mirrorContract.created_timestamp || '');
  const deployedAt = consensusTimestampToIso(deploymentConsensusTimestamp);
  const runtimeHash = sha256(mirrorContract.runtime_bytecode || '');
  const artifactRuntimeHash = sha256(artifact.deployedBytecode);
  if (
    runtimeHash !== artifactRuntimeHash ||
    runtimeHash !== deployment.runtimeBytecodeSha256
  ) {
    throw new Error('Deployed runtime bytecode does not match the compiled artifact.');
  }

  const verifiedUrl =
    SOURCIFY + '/v2/contract/' + network.chainId + '/' + deployment.evmAddress;
  const existing = await fetchJson(
    verifiedUrl,
    undefined,
    'Sourcify contract lookup',
  );
  let verificationStatus = 'verified';
  let verificationId = null;
  let verifiedAt = existing.body.verifiedAt || null;

  if (existing.response.status === 404) {
    verificationId = deployment.sourceVerification?.verificationId || null;
    if (!verificationId) {
      const build = loadBuildInfo();
      const verification = await fetchJson(
        SOURCIFY + '/v2/verify/' + network.chainId + '/' + deployment.evmAddress,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            stdJsonInput: build.input,
            compilerVersion: sourcifyCompilerVersion(build.solcLongVersion),
            contractIdentifier: 'contracts/OpagoHbarCheckout.sol:OpagoHbarCheckout',
          }),
        },
        'Sourcify source verification',
      );
      if (verification.response.status !== 202) {
        throw new Error(
          'Sourcify verification failed with HTTP ' +
            verification.response.status +
            ': ' +
            JSON.stringify(verification.body),
        );
      }
      verificationId = verification.body.verificationId || null;
      if (!verificationId) throw new Error('Sourcify did not return a verification ID.');
    }
    const completed = await waitForVerification(verificationId);
    verificationStatus = completed.status;
    verifiedAt = completed.verifiedAt;
  } else if (!existing.response.ok) {
    throw new Error('Sourcify lookup failed with HTTP ' + existing.response.status + '.');
  } else if (!isExactRuntimeMatch(existing.body.runtimeMatch)) {
    throw new Error('Sourcify does not report an exact runtime bytecode match.');
  }

  deployment.sourceVerification = {
    provider: 'Sourcify',
    status: verificationStatus,
    verificationId,
    verifiedAt: verificationStatus === 'verified' ? verifiedAt || new Date().toISOString() : null,
  };
  deployment.deploymentConsensusTimestamp = deploymentConsensusTimestamp;
  deployment.deployedAt = deployedAt;
  deployment.mirrorBytecodeMatchedAt = new Date().toISOString();
  fs.writeFileSync(network.deploymentPath, JSON.stringify(deployment, null, 2) + '\n', 'utf8');
  console.log('Hedera ' + network.name + ' runtime bytecode matches the locked artifact.');
  console.log('Sourcify status: ' + verificationStatus);
  if (verificationId) console.log('Verification ID: ' + verificationId);
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      'Hedera checkout verification failed: ' +
        (error instanceof Error ? error.message : 'unknown error'),
    );
    process.exitCode = 1;
  });
}

module.exports = {
  consensusTimestampToIso,
  isExactRuntimeMatch,
  resolveVerificationNetwork,
  sha256,
  sourcifyCompilerVersion,
};
