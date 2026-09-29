'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { HomeBalancePreviewStore, parseHomeBalancePreview } = require('../lib/home-balance-preview.ts');
const { loadDisplaySparkBalance, markSparkWalletSynchronized } = require('../lib/display-spark-balance.ts');
const { calculatePortfolioEur } = require('../lib/portfolio-valuation.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
const scope = 'public-fixture:mainnet:MAINNET';
const record = () => ({ version: 1, scope, spark: { definition: 'available', value: 4200, at: Date.now() }, hedera: { value: '200000000', at: Date.now() }, rates: { btcToEur: 50000, hbarToEur: 0.2, at: Date.now() } });

test('a new Home instance can display the last known full portfolio without a network connection', async () => {
  let stored = null;
  const storage = { get: async () => stored, set: async value => { stored = value; }, remove: async () => { stored = null; } };
  await new HomeBalancePreviewStore(storage).update(record(), () => {});
  const preview = await new HomeBalancePreviewStore(storage).read(scope);
  assert.equal(calculatePortfolioEur({ sparkSats: preview.spark.value, hbarTinybars: BigInt(preview.hedera.value) }, preview.rates), 2.5);
  assert.equal(await new HomeBalancePreviewStore(storage).read('another-wallet:mainnet:MAINNET'), null);
  assert.equal(await new HomeBalancePreviewStore(storage).read('public-fixture:testnet:REGTEST'), null);
});

test('expired, corrupt, future and unsafe preview values never become a current or zero balance', () => {
  const at = Date.now();
  assert.equal(parseHomeBalancePreview('not-json', scope), null);
  assert.equal(parseHomeBalancePreview(JSON.stringify({ ...record(), version: 2 }), scope), null);
  for (const value of [-1, Number.MAX_SAFE_INTEGER + 1, '0', null]) {
    const result = parseHomeBalancePreview(JSON.stringify({ ...record(), spark: { definition: 'available', value, at } }), scope);
    assert.equal(result.spark, undefined);
  }
  for (const timestamp of [at + 60000, at - 8 * 86400000, 0]) {
    const result = parseHomeBalancePreview(JSON.stringify({ ...record(), spark: { definition: 'available', value: 0, at: timestamp } }), scope, at);
    assert.equal(result.spark, undefined);
  }
  const result = parseHomeBalancePreview(JSON.stringify({ ...record(), hedera: { value: '9223372036854775808', at } }), scope);
  assert.equal(result.hedera, undefined);
  assert.equal(parseHomeBalancePreview(JSON.stringify({ ...record(), spark: { definition: 'available', value: 0, at } }), scope).spark.value, 0);
});

test('independent balance updates merge without resetting older observation timestamps', async () => {
  let stored = JSON.stringify(record());
  const original = JSON.parse(stored);
  const store = new HomeBalancePreviewStore({ get: async () => stored, set: async value => { stored = value; }, remove: async () => {} });
  await store.update({ version: 1, scope, spark: { definition: 'available', value: 4300, at: Date.now() } }, () => {});
  const saved = JSON.parse(stored);
  assert.equal(saved.spark.value, 4300);
  assert.deepEqual(saved.hedera, original.hedera);
  assert.deepEqual(saved.rates, original.rates);
});

test('removing a wallet wins over in-flight and queued preview writes', async () => {
  let stored = null;
  let finishWrite;
  const store = new HomeBalancePreviewStore({
    get: async () => stored,
    set: value => new Promise(resolve => { finishWrite = () => { stored = value; resolve(); }; }),
    remove: async () => { stored = null; },
  });
  const first = store.update(record(), () => {});
  await flush();
  const queued = store.update(record(), () => {});
  const remove = store.clear();
  finishWrite();
  await Promise.all([first, queued, remove]);
  assert.equal(stored, null);
});

test('a lock during preview storage lookup prevents the queued write', async () => {
  let finishRead;
  let locked = false;
  let writes = 0;
  const store = new HomeBalancePreviewStore({ get: () => new Promise(resolve => { finishRead = resolve; }), set: async () => { writes++; }, remove: async () => {} });
  const operation = store.update(record(), () => { if (locked) throw new Error('locked'); });
  await flush();
  locked = true;
  finishRead(null);
  await assert.rejects(operation, /locked/);
  assert.equal(writes, 0);
});

test('first Lightning display reuses completed startup sync; later refreshes query fresh data', async () => {
  let freshCalls = 0;
  let cachedCalls = 0;
  const wallet = {
    getCachedBalance: async () => { cachedCalls++; return { balance: 120n }; },
    getBalance: async () => { freshCalls++; return { balance: 130n }; },
  };
  markSparkWalletSynchronized(wallet);
  const [home, send] = await Promise.all([loadDisplaySparkBalance(wallet), loadDisplaySparkBalance(wallet)]);
  assert.equal(home.balance, 120n);
  assert.equal(send.balance, 120n);
  assert.equal(cachedCalls, 1);
  assert.equal(freshCalls, 0);
  assert.equal((await loadDisplaySparkBalance(wallet)).balance, 130n);
  assert.equal(freshCalls, 1);
});

test('a missing or failing SDK cache falls back to a fresh balance', async () => {
  let freshCalls = 0;
  const wallet = { getCachedBalance: async () => { throw new Error('cache unavailable'); }, getBalance: async () => { freshCalls++; return { balance: 5n }; } };
  markSparkWalletSynchronized(wallet);
  assert.equal((await loadDisplaySparkBalance(wallet)).balance, 5n);
  assert.equal(freshCalls, 1);
});

test('a transient Hedera outage preserves the account binding and does not start another lookup', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(__dirname, '../lib/hedera/account-binding-native.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const events = [];
  let failure = new Error('Network request failed');
  const deps = {
    '@react-native-async-storage/async-storage': { getItem: async () => 'saved binding', removeItem: async () => events.push('remove'), setItem: async () => events.push('save') },
    './account': { loadHederaAccount: async () => { events.push('verify'); throw failure; }, findHederaAccount: async () => { events.push('discover'); return null; } },
    './account-binding': { getHederaAccountBindingStorageKey: () => 'binding', parseHederaAccountBinding: () => ({ accountId: '0.0.123456' }) },
    './config': { HEDERA_NETWORK: 'mainnet' },
    './keys': { normalizeHederaPublicKey: key => key },
    '../retry': require('../lib/retry.ts'),
  };
  const exports = {};
  new Function('require', 'exports', code)(name => { if (!(name in deps)) throw new Error(name); return deps[name]; }, exports);
  await assert.rejects(exports.resolveHederaWalletAccount('public fixture'), /Network request failed/);
  assert.deepEqual(events, ['verify']);
  events.length = 0;
  failure = new Error('Hedera account key does not match this wallet.');
  assert.equal(await exports.resolveHederaWalletAccount('public fixture'), null);
  assert.deepEqual(events, ['verify', 'remove', 'discover']);
});
