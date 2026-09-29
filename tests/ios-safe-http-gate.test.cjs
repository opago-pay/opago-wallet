'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.join(__dirname, '..');
const checker = path.join(repo, 'scripts/check-ios-safe-http-xcresult.cjs');
const source = fs.readFileSync(path.join(repo, 'modules/opago-safe-http/ios/Tests/OpagoSafeHttpTests.swift'), 'utf8');
const expected = [...source.matchAll(/^  func (test[A-Za-z0-9_]+)\(/gm)].length;

test('native evidence gate rejects zero, skipped and missing tests', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opago-ios-gate-'));
  try {
    const file = path.join(directory, 'summary.json');
    const run = summary => {
      fs.writeFileSync(file, JSON.stringify(summary));
      return spawnSync(process.execPath, [checker, file], { encoding: 'utf8' });
    };
    const good = { result: 'Passed', totalTestCount: expected,
      passedTests: expected, failedTests: 0, skippedTests: 0 };
    assert.equal(run(good).status, 0);
    assert.notEqual(run({ ...good, totalTestCount: 0, passedTests: 0 }).status, 0);
    assert.notEqual(run({ ...good, passedTests: expected - 1, skippedTests: 1 }).status, 0);
    assert.notEqual(run({ ...good, totalTestCount: expected - 1, passedTests: expected - 1 }).status, 0);
    assert.notEqual(run({ ...good, result: 'Failed', failedTests: 1, passedTests: expected - 1 }).status, 0);
    const unitCount = [...source.split('final class OpagoSafeHttpControlledIntegrationTests')[0]
      .matchAll(/^  func (test[A-Za-z0-9_]+)\(/gm)].length;
    fs.writeFileSync(file, JSON.stringify({ result: 'Passed', totalTestCount: unitCount,
      passedTests: unitCount, failedTests: 0, skippedTests: 0 }));
    assert.equal(spawnSync(process.execPath, [checker, file, '--unit']).status, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
