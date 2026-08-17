'use strict';

const { spawnSync } = require('node:child_process');

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  process.stderr.write('Run this verifier through `npm run phase5:verify`.\n');
  process.exit(1);
}

const commonEnvironment = {
  ...process.env,
  CI: '1',
  HARDHAT_DISABLE_TELEMETRY_PROMPT: 'true',
};

const gates = [
  { label: 'TypeScript', command: process.execPath, args: [npmCli, 'run', 'typecheck'] },
  { label: 'ESLint', command: process.execPath, args: [npmCli, 'run', 'lint'] },
  { label: 'Application tests', command: process.execPath, args: [npmCli, 'test'] },
  {
    label: 'Contract compilation',
    command: process.execPath,
    args: [npmCli, 'run', 'contract:compile'],
  },
  {
    label: 'Contract tests',
    command: process.execPath,
    args: [npmCli, 'run', 'contract:test'],
  },
  { label: 'eID backend syntax', command: process.execPath, args: ['--check', 'server/eid-backend.js'] },
  { label: 'OCP demo syntax', command: process.execPath, args: ['--check', 'demo/ocp-server.js'] },
  {
    label: 'Travel Rule demo syntax',
    command: process.execPath,
    args: ['--check', 'demo/travel-rule-merchant.js'],
  },
  {
    label: 'Hedera merchant demo syntax',
    command: process.execPath,
    args: ['--check', 'demo/hedera-checkout-merchant.cjs'],
  },
  {
    label: 'Solana devnet funding syntax',
    command: process.execPath,
    args: ['--check', 'scripts/solana-fund-devnet.cjs'],
  },
  {
    label: 'Hedera provisioning syntax',
    command: process.execPath,
    args: ['--check', 'scripts/hedera-provision-testnet.cjs'],
  },
  {
    label: 'Hedera deployment syntax',
    command: process.execPath,
    args: ['--check', 'scripts/hedera-deploy-checkout.cjs'],
  },
  {
    label: 'Hedera verification syntax',
    command: process.execPath,
    args: ['--check', 'scripts/hedera-verify-checkout.cjs'],
  },
];

for (const gate of gates) {
  process.stdout.write(`\n=== ${gate.label} ===\n`);
  const result = spawnSync(gate.command, gate.args, {
    cwd: process.cwd(),
    env: commonEnvironment,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    process.stderr.write(`${gate.label} could not start: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(`${gate.label} failed with exit code ${String(result.status)}.\n`);
    process.exit(result.status || 1);
  }
}

process.stdout.write('\nPhase 5 quality verification passed.\n');
