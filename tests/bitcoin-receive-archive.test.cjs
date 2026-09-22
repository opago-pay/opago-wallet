'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('./register-typescript.cjs');
function archiveFixture(memory = new Map()) {
  const checked = [], activity = new Map(); let confirmed = new Set();
  const dependencies = {
    '@react-native-async-storage/async-storage': { getItem: async key => memory.get(key) ?? null, setItem: async (key,value) => memory.set(key,value), removeItem: async key => memory.delete(key) },
    '../database': { addTransaction: async (direction,amount,asset,details) => activity.set(details.txId, { direction,amount,asset }) },
    '../lightning/receive-status': { resolveLightningReceive: async (_,record) => { checked.push(record.requestId); return confirmed.has(record.requestId) ? 'confirmed' : 'waiting'; } },
    './amount': require('../lib/bitcoin/amount.ts'),
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/bitcoin/receive-archive.ts'),'utf8'),{
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop:true },
  }).outputText;
  const exports = {}; new Function('require','exports',code)(name => dependencies[name] ?? {},exports);
  return { ...exports, memory, checked, activity, pay: ids => { confirmed = new Set(ids); } };
}
const request = n => ({ requestId: `request-${n}`, paymentHash: String(n).padStart(64,'0'), amountSats: 20,
  invoice: 'not retained in archive', expiresAt: Date.now()-1000, createdAt: new Date().toISOString() });
test('a shared deposit address stays watched across restart before its first payment, isolated by wallet and cleared on removal', async () => {
  const {createDepositWatch}=require('../lib/bitcoin/deposit-watch.ts');
  const memory=new Map(); const storage={getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>memory.set(key,value),removeItem:async key=>memory.delete(key)};
  const watch=createDepositWatch(storage); assert.equal(await watch.has('first:MAINNET'),false);
  await watch.enable('first:MAINNET',()=>{});const restarted=createDepositWatch(storage);
  assert.equal(await restarted.has('first:MAINNET'),true);assert.equal(await restarted.has('second:MAINNET'),false);
  await restarted.clear();assert.equal(await restarted.has('first:MAINNET'),false);
  await assert.rejects(restarted.enable('first:MAINNET',()=>{throw Error('locked')}),/locked/);
  assert.equal(await restarted.has('first:MAINNET'),false);
});
test('new request and expiry retain older request IDs across restart without storing full invoices', async () => {
  const first = archiveFixture();
  await first.archiveBitcoinRequest('wallet:MAINNET',request(1),()=>{});
  await first.archiveBitcoinRequest('wallet:MAINNET',request(2),()=>{});
  assert.doesNotMatch([...first.memory.values()].join(''),/not retained/);
  const restarted = archiveFixture(first.memory); restarted.pay(['request-1']);
  assert.equal(await restarted.reconcileArchivedBitcoinRequests({},'wallet:MAINNET',()=>{}),1);
  assert.deepEqual(restarted.checked,['request-1','request-2']);
  assert.equal(restarted.activity.size,1);
  assert.equal(await restarted.reconcileArchivedBitcoinRequests({},'another:MAINNET',()=>{}),0);
  assert.equal(await restarted.reconcileArchivedBitcoinRequests({},'wallet:REGTEST',()=>{}),0);
});
test('two actual receipts of the same amount remain two payments; the payment hash deduplicates repeats', async () => {
  const f=archiveFixture();
  for(const n of [1,2,1]) await f.archiveBitcoinRequest('scope',request(n),()=>{});
  f.pay(['request-1','request-2']);
  assert.equal(await f.reconcileArchivedBitcoinRequests({},'scope',()=>{}),2);
  assert.equal(f.activity.size,2);
  assert.equal(await f.reconcileArchivedBitcoinRequests({},'scope',()=>{}),0);
});
test('bounded polling rotates through every old request and wallet removal erases tracking', async () => {
  const f=archiveFixture();
  for(let n=1;n<=7;n++)await f.archiveBitcoinRequest('scope',request(n),()=>{});
  for(let n=0;n<3;n++)await f.reconcileArchivedBitcoinRequests({},'scope',()=>{});
  assert.equal(new Set(f.checked).size,7);
  await f.clearBitcoinReceiveArchive();assert.equal(f.memory.size,0);
  await assert.rejects(f.archiveBitcoinRequest('scope',request(8),()=>{throw new Error('locked');}),/locked/);
  assert.equal(f.memory.size,0);
});
test('migration discards the old incoming-inclusive preview but keeps rates and HBAR', () => {
  const { parseHomeBalancePreview }=require('../lib/home-balance-preview.ts');
  const at=Date.now();const legacy={version:1,scope:'same',spark:{value:130,at},hedera:{value:'200',at},rates:{btcToEur:50000,hbarToEur:1,at}};
  const migrated=parseHomeBalancePreview(JSON.stringify(legacy),'same');
  assert.equal(migrated.spark,undefined);assert.equal(migrated.hedera.value,'200');assert.equal(migrated.rates.btcToEur,50000);
});
