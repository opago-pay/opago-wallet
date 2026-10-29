const test = require('node:test');
const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const { assertContract, routeContract } = require('../lib/opago/contract.ts');
const fixture = require('../docs/lnurl-spark-contracts/v2/fixtures/schema-cases.json').cases.find(c => c.schema === 'Registration' && c.valid).value;
test('Payment routes validate the accepted 0.2.1 response while preserving closed F3 0.2.0', () => {
  const current = { ...fixture, amount: null, currency: null };
  const route = routeContract('POST', '/api/v2/payments/registrations');
  assert.equal(route.response, 'payment-0.2.1:Registration');
  assertContract(route.response, current);
  assert.throws(() => assertContract(route.response, fixture));
  assert.throws(() => assertContract(route.response, { ...current, extra: true }));
  assertContract('Registration', fixture);
  assert.throws(() => assertContract('Registration', current));
});
