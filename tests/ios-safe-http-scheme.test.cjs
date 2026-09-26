'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { selectSafeHttpTest } = require('../scripts/select-ios-safe-http-test-scheme.cjs');
const selector = path.join(__dirname, '..', 'scripts/select-ios-safe-http-test-scheme.cjs');

const xcodebuildList = (schemes, targets) => ({
  project: {
    name: 'Pods',
    configurations: ['Debug', 'Release'],
    schemes,
    targets,
  },
});

test('selects the generated CocoaPods Unit-Tests scheme and its actual target', () => {
  const list = xcodebuildList(
    ['Pods-opago-wallet', 'OpagoSafeHttp', 'OpagoSafeHttp-Unit-Tests', 'ExpoModulesCore'],
    ['OpagoSafeHttp', 'ExpoModulesCore', 'OpagoSafeHttp-Unit-Tests', 'Pods-opago-wallet'],
  );
  assert.deepEqual(selectSafeHttpTest(list), {
    scheme: 'OpagoSafeHttp-Unit-Tests', target: 'OpagoSafeHttp-Unit-Tests',
  });
});

test('fails if the test scheme or matching test target is absent', () => {
  assert.throws(() => selectSafeHttpTest(xcodebuildList(
    ['Pods-opago-wallet', 'OpagoSafeHttp'], ['OpagoSafeHttp-Unit-Tests'],
  )), /missing or ambiguous/);
  assert.throws(() => selectSafeHttpTest(xcodebuildList(
    ['OpagoSafeHttp-Unit-Tests'], ['OpagoSafeHttp'],
  )), /missing or ambiguous/);
  assert.throws(() => selectSafeHttpTest({ project: { schemes: [] } }), /missing/);
});

test('fails on ambiguous or mismatched CocoaPods test choices', () => {
  assert.throws(() => selectSafeHttpTest(xcodebuildList(
    ['OpagoSafeHttp-Unit-Tests', 'OpagoSafeHttp-Tests'],
    ['OpagoSafeHttp-Unit-Tests', 'OpagoSafeHttp-Tests'],
  )), /ambiguous/);
  assert.throws(() => selectSafeHttpTest(xcodebuildList(
    ['OpagoSafeHttp-Unit-Tests'], ['OpagoSafeHttp-Tests'],
  )), /ambiguous/);
  assert.throws(() => selectSafeHttpTest(xcodebuildList(
    ['OpagoSafeHttp-Unit-Tests', 'OpagoSafeHttp-Unit-Tests'],
    ['OpagoSafeHttp-Unit-Tests'],
  )), /ambiguous/);
});

test('CLI consumes xcodebuild JSON and prints scheme plus test target for the harness', () => {
  const list = xcodebuildList(
    ['OpagoSafeHttp', 'OpagoSafeHttp-Unit-Tests'],
    ['OpagoSafeHttp', 'OpagoSafeHttp-Unit-Tests'],
  );
  const run = value => spawnSync(process.execPath, [selector], {
    input: JSON.stringify(value), encoding: 'utf8',
  });
  const selected = run(list);
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(selected.stdout, 'OpagoSafeHttp-Unit-Tests\tOpagoSafeHttp-Unit-Tests\n');
  assert.notEqual(run(xcodebuildList(['OpagoSafeHttp'], ['OpagoSafeHttp'])).status, 0);
});
