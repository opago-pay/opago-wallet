'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('App Store privacy manifest is a valid property-list XML with approved app reasons', () => {
 const xml = read('privacy/PrivacyInfo.xcprivacy');
 assert.match(xml, /^<\?xml version="1\.0"/);
 const parsed = execFileSync('python3', ['-c',
   'import plistlib,sys,json; d=plistlib.loads(sys.stdin.buffer.read()); print(json.dumps(d))'],
   {input:xml,encoding:'utf8'});
 const manifest = JSON.parse(parsed);
 assert.equal(manifest.NSPrivacyTracking, false);
 assert.equal(Object.hasOwn(manifest,'NSPrivacyCollectedDataTypes'),false);
 const reasons = Object.fromEntries(manifest.NSPrivacyAccessedAPITypes.map(x=>[x.NSPrivacyAccessedAPIType,x.NSPrivacyAccessedAPITypeReasons]));
 assert.deepEqual(reasons,{
  NSPrivacyAccessedAPICategoryUserDefaults:['CA92.1'],
  NSPrivacyAccessedAPICategoryFileTimestamp:['C617.1'],
  NSPrivacyAccessedAPICategorySystemBootTime:['35F9.1'],
  NSPrivacyAccessedAPICategoryDiskSpace:['E174.1'],
 });
});

test('App Store additions preserve bdk native plugin, store permissions and production network config', () => {
 const config = read('app.config.js');
 assert.match(config, /\.\/plugins\/with-bitcoin-bdk/);
 assert.match(config, /\.\/plugins\/with-privacy-manifest/);
 const app = JSON.parse(read('app.json'));
 assert.equal(app.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption, true);
 assert.match(app.expo.plugins.find(x=>Array.isArray(x)&&x[0]==='expo-camera')[1].cameraPermission,/scan payment QR codes/);
 const eas=JSON.parse(read('eas.json'));
 assert.equal(eas.build.production.env.EXPO_PUBLIC_ENABLE_BITCOIN_MAINNET,'true');
 assert.equal(eas.build.production.env.EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET,'true');
 assert.equal(eas.build.production.env.EXPO_PUBLIC_ENABLE_HEDERA_MAINNET,'true');
 assert.equal(eas.build.production.env.EXPO_PUBLIC_OPAGO_F3_ENABLED,'true');
});

test('privacy manifest Xcode resource registration is idempotent across two prebuild passes', () => {
 const { addPrivacyResourceIfMissing } = require('../plugins/with-privacy-manifest.js');
 const references = {};
 const buildFiles = [];
 const project = {
  pbxFileReferenceSection: () => references,
  getFirstTarget: () => ({uuid:'APP_TARGET'}),
  addResourceFile: (relativePath, options) => {
   assert.equal(options.target, 'APP_TARGET');
   buildFiles.push({fileRef:'PRIVACY_REF',comment:'PrivacyInfo.xcprivacy in Resources'});
   references.PRIVACY_REF={isa:'PBXFileReference',name:'"PrivacyInfo.xcprivacy"',
     path:'"opago-wallet/PrivacyInfo.xcprivacy"'};
  },
 };
 // Mimic Xcode: PBXBuildFile entries have fileRef/comment, not a path.
 addPrivacyResourceIfMissing(project,'opago-wallet/PrivacyInfo.xcprivacy');
 addPrivacyResourceIfMissing(project,'opago-wallet/PrivacyInfo.xcprivacy');
 assert.equal(buildFiles.length,1);
 assert.equal(Object.hasOwn(buildFiles[0],'path'),false);
 // Also recognize a file reference that exposes only a (quoted) path.
 const pathOnly={...project,pbxFileReferenceSection:()=>({OTHER:{path:'"Other/PrivacyInfo.xcprivacy"'}}),
  addResourceFile:()=>{throw new Error('duplicate privacy resource');}};
 addPrivacyResourceIfMissing(pathOnly,'opago-wallet/PrivacyInfo.xcprivacy');
});
