'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
require('./register-typescript.cjs');
const { createTransactionRateStore } = require('../lib/transaction-rates-sqlite.ts');
const { loadHistoricalTransactionRate } = require('../lib/historical-rates.ts');
const { assertRateRequest } = require('../lib/transaction-rates.ts');
const { withBitcoinRateTracking } = require('../lib/bitcoin/rate-tracking.ts');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const at = '2026-09-24T10:00:25.000Z';
const minute = Date.parse('2026-09-24T10:00:00.000Z');
const scope = 'btc:MAINNET:' + 'a'.repeat(64);
const request = (key = 'ln:one') => ({ scope, key, asset: 'BTC', transactionAt: at, timeBasis: 'recorded' });
const quote = (asset = 'BTC', transactionAt = at) => ({ asset, eurPerCoin: asset === 'BTC' ? 70000 : 0.07,
  transactionAt, rateAt: new Date(Math.floor(Date.parse(transactionAt)/60000)*60000).toISOString(),
  fetchedAt: '2026-09-30T10:00:00.000Z', source: 'Binance', method: 'minute-open', timeBasis: 'network' });
function fixture(t) {
  const native = new DatabaseSync(':memory:');t.after(()=>native.close());
  const db = { async execAsync(sql) { native.exec(sql); },
    async runAsync(sql,...args) { return native.prepare(sql).run(...args); },
    async getFirstAsync(sql,...args) { return native.prepare(sql).get(...args) ?? null; },
    async getAllAsync(sql,...args) { return native.prepare(sql).all(...args); } };
  return { store:createTransactionRateStore(async()=>db), restart:()=>createTransactionRateStore(async()=>db), native };
}
test('quotes and retry jobs survive restart without being trimmed or crossing wallet/network scopes',async t=>{
  const {store,restart}=fixture(t);
  await store.observe(request());
  const [pending]=await store.due(scope,0);await store.finish(pending,quote(),Date.now());
  const next=restart();assert.equal((await next.get(scope,pending.key)).quote.eurPerCoin,70000);
  assert.deepEqual(await next.due(scope,Date.now()),[]);
  assert.equal(await next.get(scope.replace('MAINNET','REGTEST'),pending.key),null);
  assert.equal(await next.get(scope.replace('a'.repeat(64),'b'.repeat(64)),pending.key),null);
  for(let i=0;i<105;i++) await next.observe(request('ln:'+i));
  assert.equal((await next.due(scope,Date.now(),20)).length,20);
  assert.equal((await next.get(scope,'ln:one')).quote.eurPerCoin,70000);
});
test('outages retain durable backoff and repeated observation does not bypass it',async t=>{
  const {store,restart}=fixture(t);await store.observe(request());
  const [job]=await store.due(scope,100);await store.finish(job,null,100);
  await store.observe(request());assert.deepEqual(await store.due(scope,30099),[]);
  const next=restart();assert.equal((await next.due(scope,30100))[0].attempts,1);
  await next.finish((await next.due(scope,30100))[0],quote(),30100);
  assert.ok((await next.get(scope,job.key)).quote);
});
test('network time corrects a provisional quote; stale responses cannot overwrite it or move it backwards',async t=>{
  const {store}=fixture(t);await store.observe(request());const old=await store.get(scope,'ln:one');
  await store.finish(old,quote(),Date.now());
  const authoritative={...request(),timeBasis:'network',transactionAt:'2026-09-24T09:57:12.000Z'};
  const corrected=await store.observe(authoritative);assert.equal(corrected.quote,null);
  await store.finish(old,quote(),Date.now());assert.equal((await store.get(scope,old.key)).quote,null);
  await store.finish(corrected,quote('BTC',authoritative.transactionAt),Date.now());
  await store.observe(request());assert.equal((await store.get(scope,old.key)).quote.transactionAt,authoritative.transactionAt);
});
test('wallet wipe invalidates queued observations and never revives a late quote',async t=>{
  const {store}=fixture(t);await store.observe(request());const job=await store.get(scope,'ln:one');
  const stale=store.observe(request('ln:late'));const wipe=store.clear();
  await assert.rejects(stale,/Wallet changed/);await wipe;
  await store.finish(job,quote(),Date.now());assert.equal(await store.get(scope,job.key),null);
});
const reader=(overrides={})=>async url=>{
  const symbol=new URL(url).searchParams.get('symbol');
  if(symbol) return [[minute,String(({BTCEUR:70000,BTCUSDT:100000,HBARUSDT:0.1,...overrides})[symbol]),0,0,0,0,minute+59999]];
  return {confirmed:true,block_time:minute/1000+25,block_hash:'b'.repeat(64)};
};
test('historical BTC and HBAR use the payment UTC minute and aligned EUR cross rates, never today prices',async()=>{
  const calls=[];const read=async url=>{calls.push(url);return reader()(url);};
  const btc=await loadHistoricalTransactionRate({...request(),quote:null},read,Date.parse('2026-09-30T10:00:00Z'));
  assert.equal(btc.eurPerCoin,70000);assert.equal(btc.rateAt,new Date(minute).toISOString());
  const hbar=await loadHistoricalTransactionRate({...request(),scope:'hbar:mainnet:'+'a'.repeat(64),asset:'HBAR'},read,Date.parse('2026-09-30T10:00:00Z'));
  assert.ok(Math.abs(hbar.eurPerCoin-0.07)<1e-10);assert.equal(hbar.method,'cross-minute-open');
  assert.ok(calls.every(url=>url.includes('startTime='+minute)&&url.includes('endTime='+(minute+59999))));
  assert.ok(calls.every(url=>!url.includes('ln:one')&&!url.includes('a'.repeat(64))));
});
test('confirmed Bitcoin block time replaces discovery time, including deposits discovered days later',async()=>{
  const result=await loadHistoricalTransactionRate({...request(),transactionAt:'2026-09-30T08:00:00Z',bitcoinTxId:'c'.repeat(64)},reader(),Date.parse('2026-09-30T10:00:00Z'));
  assert.equal(result.transactionAt,at);assert.equal(result.timeBasis,'block');
  await assert.rejects(loadHistoricalTransactionRate({...request(),bitcoinTxId:'c'.repeat(64)},async()=>({confirmed:false})),/block time/);
});
test('missing/future timestamps, absent candles and invalid prices stay pending instead of using a current rate',async()=>{
  await assert.rejects(loadHistoricalTransactionRate({...request(),transactionAt:null},reader()),/time unavailable/);
  await assert.rejects(loadHistoricalTransactionRate(request(),reader(),minute-1000000),/time unavailable/);
  await assert.rejects(loadHistoricalTransactionRate(request(),async()=>[]),/price unavailable/);
  await assert.rejects(loadHistoricalTransactionRate(request(),reader({BTCEUR:0})),/Invalid historical/);
  await assert.rejects(loadHistoricalTransactionRate(request(),async()=>[[minute+60000,'70000',0,0,0,0,minute+119999]]),/unavailable/);
  assert.throws(()=>assertRateRequest({...request(),scope:'hbar:mainnet:'+'a'.repeat(64)}),/Invalid/);
  assert.throws(()=>assertRateRequest({...request(),bitcoinTxId:'bad'}),/Invalid/);
});
test('committed Bitcoin operation changes are tracked while observer failure cannot invalidate a payment',async()=>{
  const observed=[];const record={id:'deposit:one',state:'confirmed'};
  const base={async begin(){},async update(){return record;},async upsertDiscoveredDeposits(){},async mergeProviderWithdrawals(_,updates){for(const item of updates)item.transform();}};
  const decorated=withBitcoinRateTracking(base,item=>{observed.push(item.id);throw Error('price storage unavailable');});
  await decorated.begin(record,()=>{});assert.equal(await decorated.update('scope',record.id,()=>record,()=>{}),record);
  await decorated.upsertDiscoveredDeposits('scope',[record],()=>{});
  await decorated.mergeProviderWithdrawals('scope',[{transform:()=>record}],()=>{});
  assert.equal(observed.length,4);
});

test('delayed receipt indexing keeps unknown payment time explicit, then corrects it from an authoritative timestamp without duplicates',async t=>{
  const native=new DatabaseSync(':memory:');t.after(()=>native.close());
  native.exec('CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, amount REAL NOT NULL, asset TEXT NOT NULL, status TEXT NOT NULL, timestamp TEXT NOT NULL)');
  const db={async execAsync(sql){native.exec(sql);},async getAllAsync(sql,...args){return native.prepare(sql).all(...(Array.isArray(args[0])?args[0]:args));},
    async runAsync(sql,args){return native.prepare(sql).run(...args);}};
  const app=hookFixture('lib/database.ts',()=>({'expo-sqlite':{openDatabaseAsync:async()=>db},
    './exchange-rate-snapshot':{currentBitcoinRateSnapshot:()=>null}}),exports=>exports);
  const database=app.render();const txId='ln:'+'c'.repeat(64);
  await database.addTransaction('incoming',20,'SAT',{txId,captureFiatRate:false});
  let rows=await database.getTransactionPage(5);assert.equal(rows.length,1);assert.equal(rows[0].rateTimeUnknown,1);
  assert.equal(rows[0].btcEurRate,null);
  await database.addTransaction('incoming',20,'SAT',{txId,captureFiatRate:false,timestamp:at});
  rows=await database.getTransactionPage(5);assert.equal(rows.length,1);assert.equal(rows[0].rateTimeUnknown,0);assert.equal(rows[0].timestamp,at);
});
