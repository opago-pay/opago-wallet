'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { categorizeAuthFailure, getAuthDiagnosticReport, recordAuthDiagnostic } = require('../lib/auth-diagnostics.ts');

test('authentication report records only allowed labels and never error messages or wallet material', () => {
  const secret = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  recordAuthDiagnostic('device_auth.begin');
  recordAuthDiagnostic('mnemonic_read.failed', categorizeAuthFailure(new Error('Keychain rejected ' + secret)));
  recordAuthDiagnostic(secret); // Runtime validation also protects JavaScript callers.
  recordAuthDiagnostic('device_auth.failed', secret);
  const report = JSON.parse(getAuthDiagnosticReport());
  assert.equal(report.scope, 'authentication-only');
  assert.ok(report.entries.some(entry => entry.event === 'mnemonic_read.failed' && entry.category === 'keychain'));
  assert.equal(JSON.stringify(report).includes(secret), false);
  assert.ok(report.entries.every(entry => Object.keys(entry).every(key => ['at', 'sinceStartMs', 'event', 'category'].includes(key))));
});
