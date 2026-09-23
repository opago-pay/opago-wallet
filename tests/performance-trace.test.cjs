'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function fixture(enabled) {
  const source = fs.readFileSync(path.join(__dirname, '../lib/performance-trace.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const logs = [];
  const timers = [];
  let now = 0;
  const result = {};
  new Function('exports', 'process', 'performance', 'console', 'setTimeout', 'setInterval', 'clearInterval', code)(
    result,
    { env: { EXPO_PUBLIC_PERF_TRACE: enabled ? 'true' : 'false' } },
    { now: () => now },
    { info: value => logs.push(value) },
    callback => { timers.push(callback); return timers.length; },
    () => 1,
    () => {},
  );
  return { ...result, logs, advance: ms => { now += ms; }, flush: () => { timers.splice(0).forEach(fn => fn()); } };
}

test('timing records contain only fixed stage names, duration, outcome and timestamp', async () => {
  const f = fixture(true);
  const secret = 'private-ln-invoice';
  const value = await f.measurePerformance('scanner.recognize', async () => { f.advance(23); return secret; });
  assert.equal(value, secret);
  f.recordPerformanceDuration(secret, 500);
  f.flush();
  const report = JSON.parse(f.getPerformanceReport());
  assert.equal(report.entries.length, 1);
  assert.deepEqual(Object.keys(report.entries[0]), ['at', 'stage', 'durationMs', 'outcome']);
  assert.equal(report.entries[0].stage, 'scanner.recognize');
  assert.equal(report.entries[0].durationMs, 23);
  assert.doesNotMatch(JSON.stringify(report) + f.logs.join(''), /private-ln-invoice/);
});

test('disabled diagnostics do not schedule logs or retain timing entries', async () => {
  const f = fixture(false);
  assert.equal(await f.measurePerformance('balance.spark', async () => 7), 7);
  f.recordPerformanceDuration('ui.handler', 2);
  f.flush();
  assert.deepEqual(JSON.parse(f.getPerformanceReport()).entries, []);
  assert.deepEqual(f.logs, []);
});
