'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const previous=new Set(Object.keys(require.cache));require('./register-typescript.cjs');const converters=require('../lib/opago/tx-sources.ts');
for(const n of Object.keys(require.cache))if(n.endsWith('.ts')&&!previous.has(n))delete require.cache[n];
function load(dependencies){const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/opago/tx-sources-native.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','exports',code)(name=>dependencies[name]||{},exports);return exports;}
test('F5 native source readers preserve distinct Spark and journal identities, all directions and independent cursors without payment dispatch',async()=>{
  const hederaKey='aa'.repeat(32),sparkKey='02'+'bb'.repeat(32);const calls=[];
  const dependencies={
    './tx-sources':converters,'../promise-timeout':{withTimeout:p=>p},
    '../lightning/payment-journal-native':{lightningPaymentJournalFor:(network,key)=>{calls.push(['journal-scope',network,key]);return{async list(){return[{paymentHash:'55'.repeat(32),requestId:'ln-send',amountSats:10,state:'pending',result:null}];}};}},
    '../bitcoin/receive-archive':{async listArchivedBitcoinRequests(scope){calls.push(['receive-scope',scope]);return[{requestId:'ln-receive',paymentHash:'66'.repeat(32),amountSats:12,state:'confirmed'}];}},
    '../bitcoin/store-native':{bitcoinStore:{async list(scope){calls.push(['bitcoin-scope',scope]);return[{id:'deposit',transferId:'credit',kind:'deposit',state:'confirmed',amountSats:14},{id:'old-withdrawal',kind:'withdrawal',state:'pending'}];}}},
    '../lightning/spark-history':{sparkUserRequestPaymentHash:()=> 'cc'.repeat(32),async loadSparkTransferPage(w,limit,offset){calls.push(['transfers',limit,offset]);return{transfers:[{id:'transfer',status:'TRANSFER_STATUS_COMPLETED',transferDirection:'INCOMING',totalValue:16}],next:100};}},
  };
  const wallet={async getUserRequests(input){calls.push(['requests',input]);return{entities:[{id:'request',typename:'LightningReceiveRequest',status:'TRANSFER_COMPLETED',transfer:{totalAmount:{originalUnit:'MILLISATOSHI',originalValue:1001}}},{typename:'CoopExitRequest'}],pageInfo:{hasNextPage:true,endCursor:'next-request'}};},payLightningInvoice(){throw Error('must not send');},withdraw(){throw Error('must not withdraw');}};
  const allSources=load(dependencies).sparkSyncSources(wallet,'REGTEST',hederaKey,sparkKey);
  const sources=allSources.filter(s=>!s.id.endsWith('-head'));
  const pages=await Promise.all(sources.map(source=>source.read(source.id==='spark-transfers'?'50':source.id==='spark-requests'?'after':null)));
  assert.ok(calls.some(c=>c[0]==='receive-scope'&&c[1]==='REGTEST:'+sparkKey));assert.ok(calls.some(c=>c[0]==='bitcoin-scope'&&c[1]==='REGTEST:'+sparkKey));
  assert.ok(calls.some(c=>c[0]==='journal-scope'&&c[2]===hederaKey));assert.equal(pages[0].next,'95');assert.equal(pages[1].next,'next-request');assert.equal(pages[1].skipped,1);
  assert.equal(pages[1].items[0].report.amount_msat,1001);assert.equal(pages[3].items[0].report.status,'settled');assert.equal(pages[4].skipped,1);
  assert.equal(pages[1].items[0].report.payment_hash,'cc'.repeat(32));
  const heads=await Promise.all(allSources.filter(s=>s.id.endsWith('-head')).map(s=>s.read('ignored-backfill-cursor')));
  assert.equal(heads.every(p=>p.next===null),true);assert.ok(calls.some(c=>c[0]==='transfers'&&c[2]===0));assert.ok(calls.some(c=>c[0]==='requests'&&c[1].after===undefined));
});
test('F5 Hedera native reader keeps provider pagination separate from the journal and excludes unsupported checkout evidence',async()=>{
  const calls=[];const dependencies={'./tx-sources':converters,
    '../hedera/payment-journal-native':{hederaPaymentJournalFor:(network,key)=>({async list(){calls.push([network,key]);return[{mode:'direct',transactionId:'0.0.123@1.1',amountTinybars:'123',recipientAccountId:'0.0.456',state:'pending',result:null},{mode:'checkout'}];}})},
    '../hedera/mirror':{async listMirrorTransactionsForSync(account,cursor){calls.push([account,cursor]);return{transactions:[{name:'CONTRACTCALL',nonce:1}],next:'provider-continuation'};}}};
  const sources=load(dependencies).hederaSyncSources('testnet','aa'.repeat(32),'0.0.123').filter(s=>!s.id.endsWith('-head'));
  const mirror=await sources[0].read('provider-cursor');const journal=await sources[1].read(null);
  assert.deepEqual(calls[0],['0.0.123','provider-cursor']);assert.equal(mirror.next,'provider-continuation');assert.equal(mirror.skipped,1);
  assert.equal(journal.next,null);assert.equal(journal.items[0].report.source_payment_id,'0.0.123@1.000000001');assert.equal(journal.skipped,1);
});
