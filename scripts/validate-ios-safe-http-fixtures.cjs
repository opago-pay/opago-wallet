'use strict';

const fs = require('node:fs');
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/validate-ios-safe-http-fixtures.cjs <Fixtures.json>');
  process.exit(2);
}
const fixtures = JSON.parse(fs.readFileSync(file, 'utf8'));
const required = ['json', 'text', 'rebinding', 'private', 'mixed', 'redirect',
  'invalidCertificate', 'gzip', 'oversizedNoLength', 'oversizedFalseLength',
  'malformedLength', 'timeout', 'slow', 'proxyOnly', 'nat64Public',
  'nat64Private', 'nat64Mixed', 'nat64DnsChange'];
for (const key of required) {
  const value = fixtures[key];
  if (typeof value !== 'string' || !/^https:\/\/[^\s/?#]+(?:[:/]|$)/.test(value) ||
      /example\.|\.invalid(?:[:/]|$)/i.test(value)) {
    console.error(`Missing controlled HTTPS fixture: ${key}`);
    process.exit(1);
  }
}
console.log(`Validated ${required.length} controlled HTTPS fixture URLs.`);
