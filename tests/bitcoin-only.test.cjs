'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const { BitcoinOnlyPreference, BITCOIN_ONLY_STORAGE_KEY } = require('../lib/bitcoin-only.ts');
const { paymentDetailReferences, bitcoinExplorerUrl } = require('../lib/payment-details.ts');
const { mergeOnchainHistory } = require('../lib/onchain/history.ts');

test('Bitcoin Only defaults on before and after empty or corrupt preference storage', async () => {
  for (const saved of [null, '', 'true', 'invalid']) {
    const preference = new BitcoinOnlyPreference();
    assert.equal(preference.getSnapshot().bitcoinOnly, true);
    await preference.initialize({getItem:async()=>saved,setItem:async()=>{}});
    assert.deepEqual(preference.getSnapshot(), {bitcoinOnly:true,ready:true});
  }
});
test('Bitcoin Only persists off across restart and publishes only a successful save', async () => {
  let stored = null; let fail = false; let notices = 0;
  const storage={getItem:async key=>{assert.equal(key,BITCOIN_ONLY_STORAGE_KEY);return stored;},
    setItem:async(key,value)=>{assert.equal(key,BITCOIN_ONLY_STORAGE_KEY);if(fail)throw Error('disk');stored=value;}};
  const preference=new BitcoinOnlyPreference(); await preference.initialize(storage);
  preference.subscribe(()=>notices++);
  await preference.setBitcoinOnly(false); assert.equal(notices,1);
  const restored=new BitcoinOnlyPreference();await restored.initialize(storage);
  assert.equal(restored.getSnapshot().bitcoinOnly,false);
  fail=true;await assert.rejects(preference.setBitcoinOnly(true));
  assert.equal(preference.getSnapshot().bitcoinOnly,false);assert.equal(notices,1);
  fail=false;await preference.setBitcoinOnly(true);assert.equal(stored,'true');
});
test('Bitcoin Only serializes rapid settings changes and safely handles failed reads',async()=>{
  const writes=[];const preference=new BitcoinOnlyPreference();
  await preference.initialize({getItem:async()=>{throw Error('disk');},setItem:async(_,value)=>writes.push(value)});
  await Promise.all([preference.setBitcoinOnly(false),preference.setBitcoinOnly(true)]);
  assert.deepEqual(writes,['false','true']);assert.equal(preference.getSnapshot().bitcoinOnly,true);
});
test('native onchain receipts share payment details and label txids correctly on their own network',()=>{
  const txid='a'.repeat(64);
  const rows=mergeOnchainHistory([{key:'hbar',asset:'HBAR',txId:'hedera-id',timestamp:'2026-01-01',type:'incoming',amountDisplay:'1',status:'confirmed'}],
    [{txid,receivedSats:1000,sentSats:0,feeSats:null,confirmed:true,observedAt:Date.parse('2026-02-01')}],[],'en','signet');
  assert.equal(rows.length,2);assert.equal(rows[0].account,'bitcoin_onchain');
  assert.deepEqual(paymentDetailReferences(rows[0]),[{label:'Transaction ID',value:txid}]);
  assert.equal(bitcoinExplorerUrl(rows[0]),`https://mempool.space/signet/tx/${txid}`);
  assert.equal(bitcoinExplorerUrl({...rows[0],onchainNetwork:'regtest'}),null);
});
