'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const eas = JSON.parse(readFileSync(join(__dirname, '..', 'eas.json'), 'utf8'));
const profile = eas.build?.production;
if (!profile || !profile.env || profile.developmentClient ||
    profile.distribution === 'internal' || profile.credentialsSource !== 'remote') {
  throw new Error('EAS production profile is missing or is not a store profile.');
}
const apkProfile = eas.build?.['production-apk'];
if (apkProfile?.extends !== 'production' ||
    apkProfile.distribution !== 'internal' ||
    apkProfile.developmentClient !== false ||
    apkProfile.android?.buildType !== 'apk' ||
    apkProfile.android?.gradleCommand ||
    apkProfile.android?.withoutCredentials ||
    apkProfile.credentialsSource ||
    apkProfile.env ||
    apkProfile.environment ||
    apkProfile.node ||
    apkProfile.autoIncrement !== undefined) {
  throw new Error('EAS production-apk must inherit production settings and build a standalone release APK.');
}
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const app = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8'));
if (eas.cli?.appVersionSource !== 'remote' || profile.autoIncrement !== true) {
  throw new Error('EAS production version source and autoIncrement must be configured.');
}
if (pkg.scripts?.['eas-build-post-install'] !== 'node ./scripts/eas-production-gate.cjs') {
  throw new Error('EAS production build must run the repository quality gate.');
}
const buildProperties = app.expo?.plugins?.find(plugin =>
  Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
if (buildProperties?.[1]?.ios?.buildReactNativeFromSource !== true) {
  throw new Error('iOS production must build React Native from the patched source.');
}
const result = spawnSync(process.execPath, ['scripts/verify-production-mainnet-build-config.cjs'], {
  cwd: join(__dirname, '..'),
  env: { ...process.env, ...profile.env, NODE_ENV: 'production' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
