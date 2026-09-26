'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function fixture(initial, reconciled) {
  const calls = { lists: 0, reconciles: 0, writes: [] };
  const deps = {
    '../database': { addTransaction: async (...args) => { calls.writes.push(args); } },
    '../lightning': { createPaymentReference: hash => 'ln:' + hash },
    '../promise-timeout': { withTimeout: promise => promise },
    '../wallet-session': { walletSession: { captureRuntime: () => () => {} } },
    './payment-journal-native': { lightningPaymentJournalFor: () => ({
      list: async () => { calls.lists++; return initial; },
      reconcile: async () => { calls.reconciles++; return reconciled; },
    }) },
    './spark-history': {},
  };
  const source = fs.readFileSync(path.join(__dirname, '../lib/lightning/reconcile-native.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (!(name in deps)) throw new Error('Unexpected dependency: ' + name);
    return deps[name];
  }, exports);
  return { reconcile: exports.reconcileLightningPayments, calls };
}

const pending = { paymentHash: 'a'.repeat(64), amountSats: 20, requestId: null, state: 'pending' };

test('ordinary Send visits do not rewrite settled payment history', async () => {
  const records = [{ ...pending, state: 'confirmed' }];
  const app = fixture(records, records);
  assert.deepEqual(await app.reconcile({}, { network: 'REGTEST', publicKey: 'a'.repeat(64) }), records);
  assert.deepEqual(app.calls, { lists: 1, reconciles: 0, writes: [] });
});

test('an unresolved status poll writes no duplicate local activity, but a real resolution does', async () => {
  const unchanged = fixture([pending], [pending]);
  await unchanged.reconcile({}, { network: 'REGTEST', publicKey: 'a'.repeat(64) });
  assert.equal(unchanged.calls.writes.length, 0);
  const resolved = fixture([pending], [{ ...pending, state: 'confirmed', requestId: 'request-1' }]);
  await resolved.reconcile({}, { network: 'REGTEST', publicKey: 'a'.repeat(64) });
  assert.equal(resolved.calls.writes.length, 1);
  assert.equal(resolved.calls.writes[0][3].status, 'confirmed');
});
