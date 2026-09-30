'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {IOSConfig}=require('expo/config-plugins');
const root=path.join(__dirname,'..');
const ios=path.join(root,'ios');

test('generated iOS project links privacy-filtered startup before RN and includes native symbol uploads', {
  skip: !fs.existsSync(ios) && 'Generate the iOS project without building before running this integration check.',
},()=>{
  const name=IOSConfig.XcodeUtils.getProjectName(root);
  const source=fs.readFileSync(path.join(ios,name,'AppDelegate.swift'),'utf8');
  assert.equal(source.split('OpagoNativeCrashDiagnostics.start()').length-1,1);
  assert.ok(source.indexOf('OpagoNativeCrashDiagnostics.start()')<source.indexOf('let factory'));
  assert.doesNotMatch(source,/RNSentrySDK\.start\(/);
  const header=fs.readFileSync(path.join(ios,name,`${name}-Bridging-Header.h`),'utf8');
  assert.equal(header.split('#import "OpagoNativeCrashDiagnostics.h"').length-1,1);
  const native=fs.readFileSync(path.join(ios,name,'OpagoNativeCrashDiagnostics.m'),'utf8');
  assert.equal(native,fs.readFileSync(path.join(root,'plugins/native/OpagoNativeCrashDiagnostics.m'),'utf8'));
  const project=fs.readFileSync(path.join(ios,`${name}.xcodeproj/project.pbxproj`),'utf8');
  assert.match(project,/OpagoNativeCrashDiagnostics\.m in Sources/);
  assert.match(project,/lastKnownFileType = sourcecode\.c\.objc/);
  assert.match(project,/Upload Debug Symbols to Sentry/);
  assert.match(project,/sentry-xcode-debug-files\.sh/);
  assert.match(project,/sentry-xcode\.sh/);
  assert.match(project,/DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym"/);
  const plist=fs.readFileSync(path.join(ios,name,'Info.plist'),'utf8');
  assert.match(plist,/<key>OpagoCrashDiagnosticsEnabled<\/key>\s*<(true|false)\/>/);
  assert.match(plist,/<key>OpagoCrashDiagnosticsDSN<\/key>\s*<string>https:\/\//);
  assert.doesNotMatch(plist,/SENTRY_AUTH_TOKEN|synthetic-build-only-token/);
});
