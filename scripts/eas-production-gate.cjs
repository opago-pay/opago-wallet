'use strict';

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

// This hook runs on the EAS worker after dependencies and native prebuild.
// A direct `eas build --profile production` must pass the same repo gate as CI.
if (!process.env.EAS_BUILD_PROFILE) {
  throw new Error('EAS_BUILD_PROFILE is required for the EAS build quality hook.');
}
if (!['production', 'mainnet-candidate'].includes(process.env.EAS_BUILD_PROFILE)) {
  process.stdout.write(`Skipping release gate for ${process.env.EAS_BUILD_PROFILE}.\n`);
  process.exit(0);
}
if (process.version !== 'v22.23.1') {
  throw new Error(`Release gate requires Node 22.23.1; found ${process.version}.`);
}
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm CLI path is unavailable on the EAS build worker.');
// The release build needs its EXPO_PUBLIC_* settings, but the application tests
// use isolated regtest/testnet fixtures. Do not let the build profile change
// their network or make a test accidentally exercise a live endpoint.
const testEnvironment = { ...process.env, CI: '1' };
for (const name of Object.keys(testEnvironment)) {
  if (name.startsWith('EXPO_PUBLIC_')) delete testEnvironment[name];
}
const result = spawnSync(process.execPath, [npmCli, 'run', 'phase5:verify'], {
  cwd: join(__dirname, '..'), stdio: 'inherit', env: testEnvironment,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
