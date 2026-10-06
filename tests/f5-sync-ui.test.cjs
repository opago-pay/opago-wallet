'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {hookFixture}=require('./react-hooks-fixture.cjs');
const previous=new Set(Object.keys(require.cache));require('./register-typescript.cjs');
const {TransactionSync,SyncError,syncUserError}=require('../lib/opago/tx-sync.ts');
const {TransactionContractTestAdapter}=require('../lib/opago/tx-test-adapter.ts');const {MemoryPrivateStore}=require('../lib/opago/store.ts');
for(const n of Object.keys(require.cache))if(n.endsWith('.ts')&&!previous.has(n))delete require.cache[n];
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const content=t=>Array.isArray(t)?t.map(content).join(' '):t&&typeof t==='object'?content(t.props?.children):typeof t==='string'||typeof t==='number'?String(t):'';
const action=(tree,label)=>nodes(tree).find(n=>n.type==='action'&&n.props.label===label);
async function fixture(t,{dev=true,params={test:'1'},connected=true}={}){
  const old=global.__DEV__;global.__DEV__=dev;t.after(()=>{global.__DEV__=old;});
  const store=new MemoryPrivateStore();let time=Date.UTC(2026,9,6);let selected=[];let focus=true;let background;let factoryCalls=0;
  const publicKey='ab'.repeat(32);const installationId=randomUUID();const runtime=connected?{account:{}}:null;
  const wallet={};const hederaAccount={accountId:'0.0.123'};
  async function factory(guard){factoryCalls++;selected=['BTC','HBAR'].map(asset=>{
    const owner={localWalletId:'synthetic',source:asset==='BTC'?'spark':'hedera',sourceWalletId:asset==='BTC'?'02'+'55'.repeat(32):'0.0.123',network:asset==='BTC'?'regtest':'testnet',subject:'test',installationId,generation:0};
    const adapter=new TransactionContractTestAdapter(store,owner,randomUUID,()=>time,asset==='BTC'?'a5555555-5555-4555-8555-555555555555':'b5555555-5555-4555-8555-555555555555');
    const report=asset==='BTC'?{asset:'BTC',rail:'spark',id_source:'SPARK_TRANSFER_ID',source_payment_id:'transfer-test',direction:'incoming',sdk_status:'pending',status:'pending',amount_msat:21000}:
      {asset:'HBAR',rail:'hedera',id_source:'HEDERA_TRANSACTION_ID',network:'testnet',source_payment_id:'0.0.123@1.000000001',direction:'outgoing',sdk_status:'SUCCESS',status:'settled',amount_tinybar:123};
    const sync=new TransactionSync(store,owner,[{id:'test-history',async read(){return{items:[{localId:asset,report}],next:null};}}],adapter,randomUUID,guard,()=>time);
    return{asset,sync,adapter};});return selected;}
  const app=hookFixture('app/transaction-sync.tsx',()=>({
    'expo-router':{useLocalSearchParams:()=>params,useRouter:()=>({push(){}})},'@react-navigation/native':{useIsFocused:()=>focus},
    'react-native':{AppState:{currentState:'active',addEventListener:(_,fn)=>{background=fn;return{remove(){}};}}},
    '../hooks/useWalletAuth':{useWalletAuth:()=>({sparkWallet:wallet,hederaPublicKey:publicKey,hederaAccount})},
    '../hooks/useOpagoAccount':{useOpagoAccount:()=>({runtime})},
    '../lib/opago/tx-runtime-native':{nativeTransactionSynchronizers:(_a,_b,_c,_d,guard)=>factory(guard)},
    '../lib/opago/tx-demo-native':{createLocalTransactionDemo:factory},
    '../lib/opago/tx-sync':{syncUserError,SyncError},'../lib/i18n':{t:s=>s},
    '../components/opago/opago-ui':{Action:'action',Copy:'copy',Card:'card',OpagoPage:'page'},
  }),exports=>exports.default());
  app.render();await app.settle();t.after(()=>app.unmount());
  return{app,get items(){return selected;},advance:ms=>time+=ms,focus:v=>focus=v,background:s=>background(s),get factoryCalls(){return factoryCalls;},click:async label=>{
    const button=action(app.render(),label);assert.ok(button,label);assert.equal(button.props.disabled,false,label);button.props.onPress();return app.settle();
  }};
}
test('F5 full local UI flow separates queued, received and independently evidenced reports; lost responses recover without sending payments',async t=>{
  const f=await fixture(t);let tree=f.app.render();assert.equal(tree.props.testOnly,true);assert.match(content(tree),/never sends a payment again/);
  await f.click('Prepare activity reports');tree=f.app.render();assert.match(content(tree),/Waiting to send\s*:\s*1/);
  await f.click('Simulate a lost response');await f.click('Retry report delivery');assert.equal(f.items[0].adapter.writes.length,1);assert.equal((await f.items[0].sync.snapshot()).acknowledged,0);
  await f.click('Renew synthetic session and allow proposed HBAR tests');f.advance(10000);await f.click('Retry report delivery');f.advance(10000);await f.click('Retry report delivery');
  tree=f.app.render();assert.match(content(tree),/Reports received\s*:\s*1/);assert.equal((await f.items[0].sync.snapshot()).verified,0);assert.equal((await f.items[1].sync.snapshot()).verified,0);
  await f.click('Simulate independent evidence');f.advance(6000);await f.click('Check report evidence');assert.equal((await f.items[0].sync.snapshot()).verified,1);assert.equal((await f.items[1].sync.snapshot()).verified,1);
  await f.click('Prepare activity reports');await f.click('Retry report delivery');assert.equal(f.items[0].adapter.writes.length,1);assert.equal(f.items[1].adapter.writes.length,1);
});
test('F5 UI session expiry preserves queued reports and offers explicit recovery with no inferred ownership',async t=>{
  const f=await fixture(t);await f.click('Prepare activity reports');await f.click('Simulate session expiry');const tree=await f.click('Retry report delivery');
  assert.match(tree.props.error,/Sign in and prove wallet ownership again/);assert.equal(f.items.every(item=>item.adapter.writes.length===0),true);
  await f.click('Renew synthetic session and allow proposed HBAR tests');await f.click('Retry report delivery');assert.equal(f.items.every(item=>item.adapter.writes.length===1),true);
});
test('F5 UI has no test controls in production even with a crafted test parameter, and local wallet use has no account dependency',async t=>{
  const f=await fixture(t,{dev:false,params:{test:'1'},connected:false});const tree=f.app.render();assert.equal(tree.props.testOnly,false);assert.equal(f.factoryCalls,0);
  assert.equal(action(tree,'Open local synchronization test adapter'),undefined);assert.equal(action(tree,'Renew synthetic session and allow proposed HBAR tests'),undefined);
  assert.match(content(tree),/local wallet works without an OPAGO account/);
});
test('F5 UI leaving focus/background revokes pending work and removes old account report status',async t=>{
  const f=await fixture(t);const old=f.items[0].sync;await f.click('Prepare activity reports');f.background('background');await f.app.settle();
  assert.equal(action(f.app.render(),'Retry report delivery'),undefined);await assert.rejects(old.flush(),e=>e.code==='sync_owner_changed');
  f.background('active');await f.app.settle();assert.equal((await f.items[0].sync.snapshot()).queued,1);
  f.focus(false);f.app.render();await f.app.settle();assert.equal(action(f.app.render(),'Prepare activity reports'),undefined);
});
