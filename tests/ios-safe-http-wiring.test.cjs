'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(repo, name), 'utf8');

test('Expo discovers the iOS safe transport pod and module', () => {
  const config = JSON.parse(read('modules/opago-safe-http/expo-module.config.json'));
  assert.deepEqual(config.apple.modules, ['OpagoSafeHttpModule']);
  const podspec = read('modules/opago-safe-http/ios/OpagoSafeHttp.podspec');
  assert.match(podspec, /s\.name = 'OpagoSafeHttp'/);
  assert.match(podspec, /s\.dependency 'ExpoModulesCore'/);
  assert.match(podspec, /test_spec\.requires_app_host = true/);
  assert.match(podspec, /test_spec\.resources = 'Tests\/Fixtures\.json'/);
  assert.match(read('modules/opago-safe-http/ios/OpagoSafeHttpModule.swift'),
    /Name\("OpagoSafeHttp"\)/);
});

test('isolated native harness opts only this pod into the XCTest spec', () => {
  const harness = read('scripts/ios-safe-http-test-gate.sh');
  assert.match(harness, /testspecs => \['Tests'\]/);
  assert.match(harness, /\.opago-safe-http-test-copy/);
  assert.match(harness, /select-ios-safe-http-test-scheme\.cjs/);
  assert.match(harness, /-only-testing:\$test_target\/OpagoSafeHttpTests/);
  assert.match(harness, /xcresulttool get test-results summary/);
});

test('untrusted iOS payment URLs retain the native fail-closed boundary', () => {
  const transport = read('lib/strict-http-transport.ts');
  const lnurl = read('lib/lnurl-safe.ts');
  const ocp = read('lib/ocp-safe.ts');
  assert.match(transport, /if \(trustedFixedOrigin\) \{/);
  assert.match(transport, /throw new Error\('Secure network transport is unavailable on this device\.'\)/);
  assert.match(transport, /boundedNativeResponses\.set\(response, maxBytes\)/);
  assert.doesNotMatch(lnurl, /trustedFixedOrigin\s*:\s*true/);
  assert.doesNotMatch(ocp, /trustedFixedOrigin\s*:\s*true/);
  assert.match(lnurl, /fetchJson/);
  assert.match(ocp, /fetchJson/);
});
