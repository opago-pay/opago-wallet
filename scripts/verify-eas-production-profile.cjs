'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const eas = JSON.parse(readFileSync(join(__dirname, '..', 'eas.json'), 'utf8'));
const profile = eas.build?.production;
if (!profile || !profile.env || profile.developmentClient || profile.distribution === 'internal') {
  throw new Error('EAS production profile is missing or is not a store profile.');
}
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
if (eas.cli?.appVersionSource !== 'remote' || profile.autoIncrement !== true) {
  throw new Error('EAS production version source and autoIncrement must be configured.');
}
if (pkg.scripts?.['eas-build-post-install'] !== 'node ./scripts/eas-production-gate.cjs') {
  throw new Error('EAS production build must run the repository quality gate.');
}
const result = spawnSync(process.execPath, ['scripts/verify-production-mainnet-build-config.cjs'], {
  cwd: join(__dirname, '..'),
  env: { ...process.env, ...profile.env, NODE_ENV: 'production' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
