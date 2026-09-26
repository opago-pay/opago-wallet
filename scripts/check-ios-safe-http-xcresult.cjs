'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'modules/opago-safe-http/ios/Tests/OpagoSafeHttpTests.swift'), 'utf8');
const unitOnly = process.argv[3] === '--unit';
const expectedSource = unitOnly ? source.split('final class OpagoSafeHttpControlledIntegrationTests')[0] : source;
const expected = [...expectedSource.matchAll(/^  func (test[A-Za-z0-9_]+)\(/gm)].length;
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/check-ios-safe-http-xcresult.cjs <xcresult-summary.json> [--unit]');
  process.exit(2);
}
const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
const counts = {
  expected,
  total: summary.totalTestCount,
  passed: summary.passedTests,
  failed: summary.failedTests,
  skipped: summary.skippedTests,
  result: summary.result,
};
console.log(JSON.stringify(counts));
if (expected < (unitOnly ? 6 : 8) || summary.totalTestCount !== expected ||
    summary.passedTests !== expected || summary.failedTests !== 0 ||
    summary.skippedTests !== 0 || summary.result !== 'Passed') {
  console.error('iOS native test evidence is incomplete or failed.');
  process.exit(1);
}
