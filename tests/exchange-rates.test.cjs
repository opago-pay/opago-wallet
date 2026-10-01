'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
require('./register-typescript.cjs');

const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(fetchJson, storage = { raw: null }, startAt = 1_000_000) {
  let now = startAt;
  let current;
  const requests = [];
  const intervals = new Set();
  const snapshots = [];
  const dependencies = {
    react: {
      useState: initial => {
        const instance = current;
        const index = instance.cursor++;
        if (!(index in instance.state)) instance.state[index] = typeof initial === 'function' ? initial() : initial;
        return [instance.state[index], value => { instance.state[index] = typeof value === 'function' ? value(instance.state[index]) : value; }];
      },
      useEffect: callback => { if (!current.mounted) current.effects.push(callback); },
      useMemo: callback => callback(),
      useCallback: (callback,deps) => {
        const index=current.callbackCursor++;
        const saved=current.callbacks[index];
        if(!saved||!deps.every((value,i)=>Object.is(value,saved.deps[i])))current.callbacks[index]={callback,deps};
        return current.callbacks[index].callback;
      },
    },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '@/lib/http': { fetchJson: async (url, init, options) => { requests.push({ url, options }); return fetchJson(url); } },
    '@/lib/performance-trace': { measurePerformance: async (_, callback) => callback() },
    '@/lib/exchange-rate-snapshot': { rememberBitcoinRate: (rate, at) => snapshots.push({ rate, at }) },
    '@/lib/exchange-rates-cache': {
      ...require('../lib/exchange-rates-cache.ts'),
      parseExchangeRateCache: raw => require('../lib/exchange-rates-cache.ts').parseExchangeRateCache(raw, now),
      mergeExchangeRateCache: (previous, next) => require('../lib/exchange-rates-cache.ts').mergeExchangeRateCache(previous, next, now),
      exchangeRateCacheView: cache => require('../lib/exchange-rates-cache.ts').exchangeRateCacheView(cache, now),
    },
    '@/lib/exchange-rates-cache-native': { exchangeRateCacheStorage: {
      read: async () => { if (storage.readError) throw Error('Storage unavailable'); return storage.raw; },
      write: async raw => { if (storage.writeError) throw Error('Storage unavailable'); storage.raw = raw; },
    } },
    '@/lib/promise-timeout': require('../lib/promise-timeout.ts'),
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'hooks/useExchangeRates.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'Date', 'setInterval', 'clearInterval', code)(
    name => {
      if (!dependencies[name]) throw new Error('Unexpected dependency: ' + name);
      return dependencies[name];
    }, exports, { now: () => now }, callback => { intervals.add(callback); return callback; }, callback => intervals.delete(callback),
  );
  return {
    requests, snapshots,
    advance: milliseconds => { now += milliseconds; },
    tick: () => { intervals.forEach(callback => callback()); },
    mount: () => {
      const instance = { state: [], effects: [], callbacks:[], callbackCursor:0, cursor: 0, mounted: false };
      const read = () => { current = instance; instance.cursor = 0; instance.callbackCursor=0; return exports.useExchangeRates(); };
      read();
      instance.mounted = true;
      const cleanups = instance.effects.map(callback => callback());
      return { read, unmount: () => cleanups.forEach(cleanup => cleanup()) };
    },
  };
}

function mount(context, rates) {
  const hook = rates.mount();
  context.after(hook.unmount);
  return hook;
}

test('CoinGecko failure loads both BTC/EUR and HBAR/EUR from Kraken', async context => {
  const rates = fixture(async url => {
    if (url.includes('coingecko')) throw new Error('HTTP 429');
    return { error: [], result: { 'BTC/EUR': { c: ['74000.25'] }, 'HBAR/EUR': { c: ['0.09457'] } } };
  });
  const hook = mount(context, rates);
  await flush();
  const value = hook.read();
  assert.equal(value.btcToEur, 74000.25);
  assert.equal(value.hbarToEur, 0.09457);
  assert.equal(value.isLoading, false);
  assert.equal(value.updatedAt, 1_000_000);
  assert.equal(rates.requests.length, 2);
  const fallback = new URL(rates.requests[1].url);
  assert.equal(fallback.searchParams.get('pair'), 'XBTEUR,HBAREUR');
  assert.equal(fallback.searchParams.get('assetVersion'), '1');
  assert.equal(rates.requests[1].options.trustedFixedOrigin, true);
  assert.equal(rates.requests[1].options.timeoutMs, 5_000);
  assert.deepEqual(rates.snapshots, [{ rate: 74000.25, at: 1_000_000 }]);
});

test('missing HBAR alone uses its fallback without replacing the valid Bitcoin price', async context => {
  const rates = fixture(async url => url.includes('coingecko')
    ? { bitcoin: { eur: 73000 } }
    : { error: [], result: { 'HBAR/EUR': { c: ['0.12'] }, 'BTC/EUR': { c: ['99999'] } } });
  const hook = mount(context, rates);
  await flush();
  assert.equal(hook.read().btcToEur, 73000);
  assert.equal(hook.read().hbarToEur, 0.12);
  assert.equal(new URL(rates.requests[1].url).searchParams.get('pair'), 'HBAREUR');
});

test('a valid HBAR price remains available when Bitcoin and its fallback are unavailable', async context => {
  const rates = fixture(async url => {
    if (url.includes('coingecko')) return { 'hedera-hashgraph': { eur: 0.15 } };
    throw new Error('Kraken unavailable');
  });
  const hook = mount(context, rates);
  await flush();
  assert.equal(hook.read().hbarToEur, 0.15);
  assert.equal(hook.read().btcToEur, 0);
  assert.equal(hook.read().updatedAt, 1_000_000);
  assert.equal(hook.read().isLoading, false);
  assert.deepEqual(rates.snapshots, []);
});

test('legacy Kraken pair names still resolve the correct asset prices', async context => {
  const rates = fixture(async url => url.includes('coingecko') ? {}
    : { error: [], result: { XXBTZEUR: { c: ['75000'] }, HBAREUR: { c: ['0.14'] } } });
  const hook = mount(context, rates);
  await flush();
  assert.equal(hook.read().btcToEur, 75000);
  assert.equal(hook.read().hbarToEur, 0.14);
});

test('invalid primary HBAR prices trigger fallback instead of becoming a quote', async context => {
  for (const invalid of [0, -1, Infinity, NaN, true, 'NaN', 1e13]) {
    const rates = fixture(async url => url.includes('coingecko')
      ? { bitcoin: { eur: 75000 }, 'hedera-hashgraph': { eur: invalid } }
      : { error: [], result: { 'HBAR/EUR': { c: ['0.11'] } } });
    const hook = mount(context, rates);
    await flush();
    assert.equal(hook.read().btcToEur, 75000);
    assert.equal(hook.read().hbarToEur, 0.11);
  }
});

test('missing HBAR retries after 30 seconds instead of waiting for the full cache lifetime', async context => {
  let recovered = false;
  const rates = fixture(async url => url.includes('coingecko')
    ? { bitcoin: { eur: 75000 }, ...(recovered ? { 'hedera-hashgraph': { eur: 0.13 } } : {}) }
    : { error: [], result: { 'HBAR/EUR': { c: ['0'] } } });
  const hook = mount(context, rates);
  await flush();
  assert.equal(hook.read().hbarToEur, 0);
  assert.equal(hook.read().btcToEur, 75000);
  recovered = true;
  rates.advance(29_999);
  rates.tick();
  await flush();
  assert.equal(rates.requests.length, 2);
  rates.advance(1);
  rates.tick();
  await flush();
  assert.equal(rates.requests.length, 3);
  assert.equal(hook.read().hbarToEur, 0.13);
  assert.equal(hook.read().updatedAt, 1_030_000);
});

test('complete prices share one in-flight request across screens and keep the five-minute cache', async context => {
  let resolve;
  const rates = fixture(() => new Promise(done => { resolve = done; }));
  const first = mount(context, rates);
  const second = mount(context, rates);
  await flush();
  assert.equal(rates.requests.length, 1);
  resolve({ bitcoin: { eur: 75000 }, 'hedera-hashgraph': { eur: 0.1 } });
  await flush();
  assert.equal(first.read().hbarToEur, 0.1);
  assert.equal(second.read().hbarToEur, 0.1);
  assert.equal(first.read().isLoading, false);
  assert.equal(second.read().isLoading, false);
  rates.advance(299_999);
  rates.tick();
  await flush();
  const third = mount(context, rates);
  await flush();
  assert.equal(third.read().hbarToEur, 0.1);
  assert.equal(rates.requests.length, 1);
  rates.advance(1);
  rates.tick();
  await flush();
  assert.equal(rates.requests.length, 2);
  resolve({ bitcoin: { eur: 76000 }, 'hedera-hashgraph': { eur: 0.12 } });
  await flush();
  assert.equal(first.read().hbarToEur, 0.12);
  assert.equal(second.read().btcToEur, 76000);
});

test('total outage keeps last known prices with their original timestamp', async context => {
  let unavailable = false;
  const rates = fixture(async () => {
    if (unavailable) throw new Error('offline');
    return { bitcoin: { eur: 75000 }, 'hedera-hashgraph': { eur: 0.1 } };
  });
  const hook = mount(context, rates);
  await flush();
  unavailable = true;
  rates.advance(301_000);
  await hook.read().refresh();
  assert.equal(hook.read().hbarToEur, 0.1);
  assert.equal(hook.read().btcToEur, 75000);
  assert.equal(hook.read().updatedAt, 1_000_000);
  assert.equal(hook.read().isLoading, false);
});

test('Kraken errors and invalid prices never become invented HBAR values', async context => {
  for (const ticker of [
    { error: ['EGeneral:Unavailable'], result: { 'HBAR/EUR': { c: ['0.5'] } } },
    { error: [], result: { 'HBAR/EUR': { c: ['Infinity'] } } },
    { error: [], result: { 'HBAR/EUR': { c: ['-1'] } } },
  ]) {
    const rates = fixture(async url => url.includes('coingecko') ? { bitcoin: { eur: 75000 } } : ticker);
    const hook = mount(context, rates);
    await flush();
    assert.equal(hook.read().btcToEur, 75000);
    assert.equal(hook.read().hbarToEur, 0);
  }
});

test('a new app runtime restores both coin prices offline and shares them with every mounted screen',async context=>{
  const storage={raw:null};
  const first=fixture(async()=>({bitcoin:{eur:75000},'hedera-hashgraph':{eur:0.1}}),storage);
  mount(context,first);await flush();
  assert.ok(storage.raw);
  const restarted=fixture(async()=>{throw Error('offline');},storage,1_400_000);
  const home=mount(context,restarted);const send=mount(context,restarted);
  await flush();
  for(const hook of [home,send]) {
    assert.equal(hook.read().btcToEur,75000);assert.equal(hook.read().hbarToEur,0.1);
    assert.equal(hook.read().btcUpdatedAt,1_000_000);assert.equal(hook.read().hbarUpdatedAt,1_000_000);
  }
  assert.equal(JSON.parse(storage.raw).btc.at,1_000_000);
});

test('HBAR-only loading persists independently of Bitcoin and survives restart',async context=>{
  const storage={raw:null};
  const first=fixture(async url=>url.includes('coingecko')?{'hedera-hashgraph':{eur:0.15}}:{},storage);
  mount(context,first);await flush();
  assert.equal(JSON.parse(storage.raw).hbar.eur,0.15);
  assert.equal(JSON.parse(storage.raw).btc,undefined);
  const restarted=fixture(async()=>{throw Error('offline');},storage,1_001_000);
  const hook=mount(context,restarted);await flush();
  assert.equal(hook.read().hbarToEur,0.15);assert.equal(hook.read().btcToEur,0);
});

test('partial refresh keeps the missing coin price and its age in memory and on disk',async context=>{
  const storage={raw:null};let phase='both';
  const rates=fixture(async url=>{
    if(!url.includes('coingecko'))return {};
    return phase==='both'?{bitcoin:{eur:75000},'hedera-hashgraph':{eur:0.1}}
      :phase==='btc'?{bitcoin:{eur:76000}}:{'hedera-hashgraph':{eur:0.2}};
  },storage);
  const hook=mount(context,rates);await flush();
  rates.advance(301_000);phase='btc';await hook.read().refresh();await flush();
  assert.equal(hook.read().hbarToEur,0.1);assert.equal(hook.read().hbarUpdatedAt,1_000_000);
  assert.equal(hook.read().btcUpdatedAt,1_301_000);
  assert.equal(JSON.parse(storage.raw).hbar.at,1_000_000);
  rates.advance(301_000);phase='hbar';await hook.read().refresh();await flush();
  assert.equal(hook.read().btcToEur,76000);assert.equal(hook.read().updatedAt,1_301_000);
  assert.equal(hook.read().hbarUpdatedAt,1_602_000);
  assert.equal(rates.snapshots.at(-1).at,1_301_000); // Fresh HBAR never renews a stale BTC payment quote.
  assert.equal(JSON.parse(storage.raw).btc.at,1_301_000);
});

test('fresh restored prices reuse the disk cache without another provider request',async context=>{
  const storage={raw:JSON.stringify({version:1,btc:{eur:75000,at:1_000_000},hbar:{eur:0.1,at:1_000_000}})};
  const rates=fixture(async()=>{throw Error('Should use fresh cache');},storage,1_001_000);
  const hook=mount(context,rates);await flush();
  assert.equal(hook.read().btcToEur,75000);assert.equal(hook.read().isLoading,false);
  assert.equal(rates.requests.length,0);
});

test('invalid or expired persisted coins are rejected independently',async context=>{
  const {EXCHANGE_RATE_MAX_AGE_MS}=require('../lib/exchange-rates-cache.ts');
  const now=EXCHANGE_RATE_MAX_AGE_MS+1_000_000;
  for(const btc of [{eur:NaN,at:now},{eur:1e13,at:now},{eur:75000,at:now+1},{eur:75000,at:999_999}]) {
    const storage={raw:JSON.stringify({version:1,btc,hbar:{eur:0.1,at:now}})};
    const rates=fixture(async()=>{throw Error('offline');},storage,now);
    const hook=mount(context,rates);await flush();
    assert.equal(hook.read().btcToEur,0);assert.equal(hook.read().hbarToEur,0.1);
  }
});

test('storage read/write failures leave live rates and wallet views usable',async context=>{
  const storage={raw:null,readError:true,writeError:true};
  const rates=fixture(async()=>({bitcoin:{eur:75000},'hedera-hashgraph':{eur:0.1}}),storage);
  const hook=mount(context,rates);await flush();
  assert.equal(hook.read().btcToEur,75000);assert.equal(hook.read().hbarToEur,0.1);
  assert.equal(hook.read().isLoading,false);
});

test('refresh callback identity stays stable through loading and price updates',async context=>{
  const rates=fixture(async()=>({bitcoin:{eur:75000},'hedera-hashgraph':{eur:0.1}}));
  const hook=mount(context,rates);const refresh=hook.read().refresh;
  await flush();assert.equal(hook.read().refresh,refresh);
  const request=refresh();await flush();assert.equal(hook.read().refresh,refresh);
  await request;assert.equal(hook.read().refresh,refresh);
});
