'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('./register-typescript.cjs');

function fixture(query) {
  const cache = new Map([['stale', { id: 'stale', value: 900 }]]);
  let queries = 0;
  class SparkWallet {
    async getLeaves(balanceCheck) {
      assert.equal(balanceCheck, true);
      queries++;
      return query();
    }
    async getBalance() { assert.fail('Must not call the full token balance method'); }
    async syncTokenOutputs() { assert.fail('Bitcoin must not wait on token services'); }
    async getCachedBalance() { assert.fail('Must not use cached available balances'); }
    leafManager = {
      addLeaves: async leaves => { for (const leaf of leaves) cache.set(leaf.id, leaf); },
      evictStaleAvailable: async ids => { for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id); },
      getOwnedBalance: () => 1000,
      getIncomingBalance: () => 500,
    };
  }
  const source = fs.readFileSync(path.join(__dirname, '../lib/spark-bitcoin-wallet.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === '@buildonspark/spark-sdk') return { SparkWallet };
    if (name === './bitcoin/amount') return require('../lib/bitcoin/amount.ts');
    if (name === './spark-leaf-selection') return require('../lib/spark-leaf-selection.ts');
    if (name === './spark-signer-cache') return require('../lib/spark-signer-cache.ts');
    if (name === './spark-htlc-preparation') return require('../lib/spark-htlc-preparation.ts');
    if (name === './spark-lightning-pipeline') return require('../lib/spark-lightning-pipeline.ts');
    throw Error('Unexpected dependency: ' + name);
  }, exports);
  return { wallet: new exports.BitcoinSparkWallet(), cache, queries: () => queries };
}

test('Bitcoin-only balance uses fresh verified spendable leaves and removes stale cache entries', async () => {
  let leaves = [{ id: 'fresh', value: 22 }];
  const app = fixture(async () => leaves);
  assert.deepEqual(await app.wallet.getBitcoinBalance(), {
    balance: 22n, satsBalance: { available: 22n, owned: 1000n, incoming: 500n },
  });
  assert.deepEqual([...app.cache.keys()], ['fresh']);
  leaves = [];
  const balance = await app.wallet.getBitcoinBalance();
  assert.equal(balance.satsBalance.available, 0n);
  assert.equal(app.cache.size, 0);
  assert.equal(app.queries(), 2);
});

test('a failed coordinator/key validation cannot fall back to stale funds', async () => {
  const app = fixture(async () => { throw Error('Fresh leaf verification failed'); });
  await assert.rejects(app.wallet.getBitcoinBalance(), /Fresh leaf verification failed/);
  assert.equal(app.cache.has('stale'), true);
});

test('malformed and overflowing leaf amounts fail before they can update the spendable cache', async () => {
  for (const values of [[-1], [1.5], [NaN], [Infinity], [Number.MAX_SAFE_INTEGER + 1], [2100000000000000, 1]]) {
    const app = fixture(async () => values.map((value, index) => ({ id: String(index), value })));
    await assert.rejects(app.wallet.getBitcoinBalance(), /Invalid Bitcoin amount/);
    assert.deepEqual([...app.cache.keys()], ['stale']);
  }
});

test('cache refresh/eviction failure aborts the Bitcoin-only balance read', async () => {
  for (const method of ['addLeaves', 'evictStaleAvailable']) {
    const app = fixture(async () => [{ id: 'fresh', value: 22 }]);
    app.wallet.leafManager[method] = async () => { throw Error('Cache unavailable'); };
    await assert.rejects(app.wallet.getBitcoinBalance(), /Cache unavailable/);
  }
});
