'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {hookFixture}=require('./react-hooks-fixture.cjs');
require('./register-typescript.cjs');
const {mnemonicToSeedSync}=require('bip39');
const {HDKey}=require('@scure/bip32');
const {p2wpkh,Transaction,OutScript}=require('@scure/btc-signer');
const {Address}=require('@scure/btc-signer/payment');
const {NETWORK,TEST_NETWORK}=require('@scure/btc-signer/utils');
const {deriveOnchainAccount}=require('../lib/onchain/keys.ts');
const policy=require('../lib/onchain/policy.ts');
const {prepareRefundTransaction,verifyRefundTransaction}=require('../lib/onchain/refund.ts');
const phrase='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const scope='bitcoin_onchain:regtest:'+'a'.repeat(64);
const txid='b'.repeat(64);
function operation(id='one'){
 const quote={version:1,scope,network:'regtest',address:'bcrt1-test',amountSats:1000,feeSats:200,totalSats:1200,
 feeRate:2,expiresAt:Date.now()+120000,psbt:'test-psbt',txid,vout:0,inputs:[txid+':1']};
 return {version:1,id,scope,network:'regtest',kind:'to_lightning',state:'prepared',quote,address:quote.address,
 amountSats:1000,feeSats:200,txid,vout:0,rawTransaction:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
 sparkScope:'REGTEST:identity',sparkOperationId:'deposit:test',transferStage:'waiting_onchain'};
}
function journalFixture(){
 const native=new DatabaseSync(':memory:');
 const access={
  async execAsync(sql){native.exec(sql);},
  async getFirstAsync(sql,...args){return native.prepare(sql).get(...args)??null;},
  async getAllAsync(sql,...args){return native.prepare(sql).all(...args);},
  async runAsync(sql,...args){return native.prepare(sql).run(...args);},
  async withExclusiveTransactionAsync(fn){native.exec('BEGIN IMMEDIATE');try{await fn(access);native.exec('COMMIT');}catch(cause){native.exec('ROLLBACK');throw cause;}},
 };
 const fixture=hookFixture('lib/onchain/journal-native.ts',()=>({'expo-sqlite':{openDatabaseAsync:async()=>access},'./policy':policy}),exports=>exports);
 return {...fixture.render(),close:()=>native.close()};
}
test('BIP84 recovery preserves the existing seed and matches the published first receiving address',()=>{
 const seed=mnemonicToSeedSync(phrase);const before=Buffer.from(seed);
 const account=deriveOnchainAccount(seed,'mainnet');
 const xpub=account.external.match(/\](xpub[^/]+)/)[1];
 const publicKey=HDKey.fromExtendedKey(xpub).derive('m/0/0').publicKey;
 assert.equal(p2wpkh(publicKey,NETWORK).address,'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
 assert.deepEqual(seed,before);assert.ok(!/xprv/.test(account.external+account.internal));
 assert.notEqual(account.external,account.internal);
 assert.deepEqual(deriveOnchainAccount(seed,'mainnet'),account);
 seed.fill(0);
});
test('test networks use test extended keys and separate persistent wallet identities',()=>{
 const seed=mnemonicToSeedSync(phrase);
 const regtest=deriveOnchainAccount(seed,'regtest');const testnet=deriveOnchainAccount(seed,'testnet');
 assert.match(regtest.external,/tpub/);assert.match(regtest.signingExternal,/tprv/);
 assert.notEqual(regtest.scope,testnet.scope);assert.notEqual(regtest.scope,deriveOnchainAccount(seed,'mainnet').scope);
 assert.equal(policy.transferNetworkMatches('testnet','REGTEST'),false);
 assert.equal(policy.transferNetworkMatches('regtest','REGTEST'),true);
 seed.fill(0);
});
test('quotes reject amount, identity, expiry and duplicate-input changes',()=>{
 const quote=operation().quote;
 policy.assertQuote(quote,scope,'regtest');
 for(const patch of [{totalSats:1201},{amountSats:0},{feeSats:.5},{scope:scope+'x'},{network:'mainnet'},{expiresAt:Date.now()-1},{inputs:[txid+':1',txid+':1']}]){
  assert.throws(()=>policy.assertQuote({...quote,...patch},scope,'regtest'));
 }
 assert.throws(()=>policy.sats(2100000000000001n));
 assert.throws(()=>policy.sats(-1));
});
test('confirmed signed inputs stay reserved through a reorg; only unsubmitted cancellation releases them',()=>{
 assert.deepEqual([...policy.reservedInputs([{...operation(),state:'confirmed'}])],[txid+':1']);
 assert.equal(policy.reservedInputs([{...operation(),state:'aborted'}]).size,0);
});
test('SQLite reservation conflicts roll back the second payment atomically',async()=>{
 const fixture=journalFixture();const store=fixture.onchainJournal();
 await store.reserve(operation());
 await assert.rejects(store.reserve(operation('two')),/UNIQUE/);
 assert.equal((await store.list(scope)).length,1);
 await store.update(scope,'one',{state:'aborted'});
 await store.reserve(operation('two'));
 assert.equal((await store.list(scope)).length,2);fixture.close();
});
test('signed transactions cannot be replaced or canceled and are recoverable from another journal handle',async()=>{
 const fixture=journalFixture();const store=fixture.onchainJournal();
 await store.reserve(operation());await store.update(scope,'one',{state:'broadcast_pending',rawTransaction:'010203'});
 await assert.rejects(store.update(scope,'one',{rawTransaction:'040506'}),/cannot be changed/);
 await assert.rejects(store.update(scope,'one',{state:'aborted'}),/cannot be changed/);
 assert.equal((await fixture.onchainJournal().list(scope))[0].rawTransaction,'010203');fixture.close();
});
test('claim and refund compete for one atomic transition',async()=>{
 const fixture=journalFixture();const store=fixture.onchainJournal();
 await store.reserve(operation());await store.update(scope,'one',{transferStage:'claim_required'});
 const results=await Promise.allSettled([
  store.update(scope,'one',{transferStage:'claim_checking'},{transferStage:'claim_required'}),
  store.update(scope,'one',{transferStage:'refund_checking'},{transferStage:'claim_required'}),
 ]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal((await store.list(scope))[0].transferStage,'claim_checking');fixture.close();
});
test('wallet wipe revokes queued and retained journal handles',async()=>{
 const fixture=journalFixture();const previous=fixture.onchainJournal();
 await previous.reserve(operation());await fixture.clearOnchainJournal();
 await assert.rejects(previous.reserve(operation('late')),/Wallet changed/);
 assert.deepEqual(await fixture.onchainJournal().list(scope),[]);fixture.close();
});
test('refund transaction binds exact outpoint, own address and approved fee before signing',()=>{
 const network={...TEST_NETWORK,bech32:'bcrt'};
 const key=HDKey.fromMasterSeed(mnemonicToSeedSync(phrase)).derive("m/84'/1'/0'/0/0");
 const address=p2wpkh(key.publicKey,network).address;
 const plan=prepareRefundTransaction(txid,2,address,100000,388,'REGTEST');
 const transaction=new Transaction({version:3});
 transaction.addInput({txid,index:2,witnessScript:new Uint8Array()});
 transaction.addOutput({script:OutScript.encode(Address(network).decode(address)),amount:99612n});
 transaction.updateInput(0,{finalScriptWitness:[new Uint8Array(64).fill(1)]});
 assert.equal(verifyRefundTransaction(transaction.hex,plan,'REGTEST'),plan.txid);
 assert.throws(()=>verifyRefundTransaction(transaction.hex,{...plan,amountSats:99611},'REGTEST'));
 assert.throws(()=>prepareRefundTransaction(txid,2,address,500,194,'REGTEST'),/too small/);
 key.wipePrivateData();
});

const {OnchainAccountSync,onchainEvents}=require('../lib/onchain/account-sync.ts');
const {MemoryPrivateStore}=require('../lib/opago/store.ts');
const {mergeOnchainHistory}=require('../lib/onchain/history.ts');
const {createBitcoinStore}=require('../lib/bitcoin/store.ts');
const owner={scope,subject:'test-subject',installationId:'test-installation',generation:0};
function tx(){return {txid,receivedSats:500,sentSats:2000,feeSats:200,confirmed:false,observedAt:1700000000000,outputs:[]};}
const event=()=>onchainEvents('regtest',[tx()],[])[0];
function receipt(o,e,id){return {subject:o.subject,scope:o.scope,eventKey:e.eventKey,idempotencyKey:id,receiptId:'receipt:'+id};}
test('account outbox persists before dispatch and reuses an idempotency key after a lost acknowledgement',async()=>{
 const store=new MemoryPrivateStore();const sent=[];let lost=true,count=0;
 const port={contract:'opago-onchain-v1',report:async(o,e,id)=>{sent.push(id);if(lost){lost=false;throw new Error('lost response');}return receipt(o,e,id);}};
 const sync=new OnchainAccountSync(store,owner,port,()=>String(++count),()=>{});
 await sync.collect([event(),event()]);assert.equal((await sync.status()).queued,1);
 await assert.rejects(sync.flush(),/lost response/);
 const restarted=new OnchainAccountSync(store,owner,port,()=>String(++count),()=>{});
 await restarted.flush();assert.deepEqual(sent,['1','1']);assert.equal((await restarted.status()).queued,0);
 assert.equal((await restarted.status()).acknowledged,1);
});
test('missing backend never acknowledges and cross-owner receipts cannot drain the onchain outbox',async()=>{
 const store=new MemoryPrivateStore();let id=0;
 const pending=new OnchainAccountSync(store,owner,null,()=>String(++id),()=>{});await pending.collect([event()]);
 await assert.rejects(pending.flush(),/backend_pending/);assert.equal((await pending.status()).acknowledged,0);
 const bad=new OnchainAccountSync(store,owner,{contract:'opago-onchain-v1',report:async(o,e,key)=>({...receipt(o,e,key),subject:'other'})},()=>String(++id),()=>{});
 await assert.rejects(bad.flush(),/invalid_receipt/);assert.equal((await pending.status()).queued,1);
 const other=new OnchainAccountSync(store,{...owner,generation:1},null,()=>String(++id),()=>{});
 assert.equal((await other.status()).queued,0);
 await assert.rejects(pending.collect([{...event(),network:'mainnet'}]),/owner_changed/);
});
test('a lock during a server response leaves a durable report for reconciliation',async()=>{
 let locked=false;const store=new MemoryPrivateStore();
 const sync=new OnchainAccountSync(store,owner,{contract:'opago-onchain-v1',report:async(o,e,id)=>{locked=true;return receipt(o,e,id);}},()=> 'one',()=>{if(locked)throw new Error('locked');});
 await sync.collect([event()]);await assert.rejects(sync.flush(),/locked/);
 const restart=new OnchainAccountSync(store,owner,null,()=> 'two',()=>{});assert.equal((await restart.status()).queued,1);
});
test('onchain history and reports collapse only exact internal references and keep external payments',()=>{
 const move={...operation(),state:'confirmed',transferStage:'completed',sparkTransferId:'transfer1'};
 const unrelated={...tx(),txid:'c'.repeat(64)};
 const events=onchainEvents('regtest',[tx(),unrelated],[move]);assert.equal(events.length,2);
 assert.equal(events[0].kind,'internal_transfer');assert.equal(events[1].amountSats,'1300');
 const rows=mergeOnchainHistory([{key:move.sparkOperationId,txId:txid},{key:'spark:transfer1',txId:'spark:transfer1'}],[tx(),unrelated],[move],'en');
 assert.equal(rows.length,2);assert.equal(rows.find(row=>row.internalTransfer).onchainOperationId,move.id);
 assert.equal(rows.find(row=>row.key==='own-tx:'+unrelated.txid).amountValue,1300);
});
test('reverse transfer reports preserve network and service fees separately from the actual total fee',()=>{
 const move={...operation(),kind:'from_lightning',withdrawalQuote:{networkFeeSats:100,serviceFeeSats:100},actualFeeSats:190};
 const report=onchainEvents('regtest',[],[move])[0];
 assert.equal(report.networkFeeSats,'100');assert.equal(report.serviceFeeSats,'100');assert.equal(report.totalFeeSats,'190');
});
function refundFixture(){
 const journal=journalFixture();const store=journal.onchainJournal();const memory=new Map();
 const legacy=createBitcoinStore({getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v),removeItem:async k=>memory.delete(k)});
 const calls=[];let loseBroadcast=false;
 const fake=hookFixture('lib/onchain/refund-native.ts',()=>({
  './journal-native':{onchainJournal:()=>store},'../bitcoin/store-native':{bitcoinStore:legacy},
  '../bitcoin/onchain':{bitcoinScope:async()=> 'REGTEST:identity'},'../config':{appConfig:{sparkNetwork:'REGTEST'}},
  './policy':policy,'./refund':{prepareRefundTransaction,verifyRefundTransaction:raw=>{assert.equal(raw,'saved-raw');}},
  './provider':{onchainRequest:async(path,init)=>{calls.push(['broadcast',init.body]);if(loseBroadcast)throw new Error('lost response');return plan.txid;}},
 }),e=>e).render();
 const key=HDKey.fromMasterSeed(mnemonicToSeedSync(phrase)).derive("m/84'/1'/0'/0/0");
 const address=p2wpkh(key.publicKey,{...TEST_NETWORK,bech32:'bcrt'}).address;key.wipePrivateData();
 const plan=prepareRefundTransaction(txid,0,address,1000,194,'REGTEST');
 const spark={refundStaticDeposit:async()=>{calls.push(['sign']);return 'saved-raw';}};
 const wallet={scope,network:'regtest',ownsAddress:value=>value===address};
 const move={...operation(),transferStage:'claim_required'};
 return {journal,store,legacy,fake,calls,plan,spark,wallet,move,setLost:v=>{loseBroadcast=v;},async setup(){
  await store.reserve(move);await legacy.begin({id:move.sparkOperationId,scope:move.sparkScope,network:'REGTEST',kind:'deposit',address:move.address,txid,vout:0,state:'action_required',amountSats:0,feeSats:null,createdAt:move.createdAt},()=>{});
 }};
}
test('legacy claim winning between refund journal and provider lock blocks signing on every resume',async()=>{
 const f=refundFixture();await f.setup();
 await f.legacy.update(f.move.sparkScope,f.move.sparkOperationId,row=>({...row,state:'checking'}),()=>{});
 await assert.rejects(f.fake.submitMoveRefund(f.wallet,f.spark,f.move,f.plan,()=>{}),/already being processed/);
 await assert.rejects(f.fake.submitMoveRefund(f.wallet,f.spark,f.move,f.plan,()=>{}),/already being processed/);
 assert.equal(f.calls.length,0);f.journal.close();
});
test('lost refund broadcast acknowledgement reuses signed bytes and preserves exclusive deposit ownership',async()=>{
 const f=refundFixture();await f.setup();f.setLost(true);
 await assert.rejects(f.fake.submitMoveRefund(f.wallet,f.spark,f.move,f.plan,()=>{}),/lost response/);
 assert.equal((await f.legacy.list(f.move.sparkScope))[0].refundIntent.operationId,f.move.id);
 f.setLost(false);await f.fake.submitMoveRefund(f.wallet,f.spark,f.move,f.plan,()=>{});
 assert.deepEqual(f.calls,[['sign'],['broadcast','saved-raw'],['broadcast','saved-raw']]);f.journal.close();
});
test('mainnet is unavailable until all required release evidence exists',()=>{
 const {assertOnchainRelease}=require('../lib/onchain/release.ts');assert.throws(()=>assertOnchainRelease('mainnet'),/not available/);assertOnchainRelease('regtest');
});

test('native messages cannot expose descriptor/key material in the UI',()=>{
 const {onchainErrorMessage}=require('../lib/onchain/errors.ts');
 const value=onchainErrorMessage(new Error('Invalid descriptor wpkh([fingerprint]xprv-private-test-material)'));
 assert.doesNotMatch(value,/xprv|fingerprint|private-test/);
});
test('cancelled prepared transfers report a terminal update instead of leaving account activity pending',()=>{
 assert.equal(onchainEvents('regtest',[],[{...operation(),state:'aborted'}])[0].status,'canceled');
});
test('a legacy deposit report is never labeled as a transfer funded by the onchain wallet',()=>{
 const event=onchainEvents('regtest',[],[{...operation(),kind:'refund',quote:null,feeSats:null}])[0];
 assert.equal(event.kind,'legacy_deposit');assert.equal(event.direction,'incoming');
});
function nativeFixture(options={}){
 const calls=[];const descriptors=[];let current=true,failPersist=false,releaseScan=null;
 const amount=n=>({toSat:()=>BigInt(n)});
 class Descriptor{constructor(value){this.value=value;descriptors.push(this);}uniffiDestroy(){this.destroyed=true;}}
 class Wallet{
  constructor(a,b){assert.doesNotMatch(a.value+b.value,/tprv|xprv/);calls.push('public wallet');}
  persist(){if(failPersist)throw new Error('disk full');calls.push('persist');}
  balance(){return {confirmed:amount(1000),total:amount(1000),trustedPending:amount(0),untrustedPending:amount(0)};}
  listUnspent(){return [];}
  nextUnusedAddress(){calls.push('address');return {address:{toString:()=> 'synthetic-address'}};}
  startFullScan(){return {build:()=>({})};}startSyncWithRevealedSpks(){return {build:()=>({})};}
  applyUpdate(){calls.push('apply update');}uniffiDestroy(){calls.push('dispose wallet');}
 }
 class EsploraClient{async fullScan(){calls.push('scan');if(releaseScan)await new Promise(resolve=>{releaseScan.resolve=resolve;});return {};}sync(){return this.fullScan();}uniffiDestroy(){}}
 const bdk={Descriptor,Wallet,EsploraClient,Network:{Regtest:'regtest'},NetworkKind:{Test:'test'},KeychainKind:{External:'external'},ChainPosition_Tags:{Confirmed:'confirmed'},Persister:{newSqlite:()=>({uniffiDestroy(){calls.push('dispose storage');}})}};
 const {initializeOnchainWallet}=hookFixture('lib/onchain/wallet-native.ts',()=>({
  'bdk-rn':bdk,'expo-file-system/legacy':{documentDirectory:'file:///test/',makeDirectoryAsync:options.mkdir|| (async()=>{}),getInfoAsync:async()=>({exists:false}),deleteAsync:async()=>{}},
  './provider':{onchainProvider:()=>({network:'regtest',esploraUrl:'http://test'})},'./keys':{deriveOnchainAccount},'./policy':policy,
  './journal-native':{onchainJournal:()=>({list:async()=>[]})},
 }),exports=>exports).render();
 return {calls,descriptors,lock(){current=false;},fail(){failPersist=true;},pause(){releaseScan={};return ()=>releaseScan.resolve();},start:signal=>initializeOnchainWallet(mnemonicToSeedSync(phrase),()=>{if(!current||signal?.aborted)throw new Error('locked');},signal)};
}
test('native wallet persists public descriptors and returns a receive address without network access',async()=>{
 const f=nativeFixture();const wallet=await f.start();const address=await wallet.receiveAddress();
 assert.equal(address,'synthetic-address');assert.equal(f.calls.includes('scan'),false);
 assert.equal(f.calls.at(-1),'persist');await wallet.cleanupConnections();
 assert.ok(f.descriptors.filter(d=>/tprv/.test(d.value)).every(d=>d.destroyed));
});
test('a failed native persistence never returns an unrecorded receive address',async()=>{
 const f=nativeFixture();const wallet=await f.start();await wallet.sync();f.fail();
 await assert.rejects(wallet.receiveAddress(),/disk full/);await wallet.cleanupConnections();
});
test('native cleanup erases signers immediately and a late scan cannot persist after lock',async()=>{
 const f=nativeFixture();const wallet=await f.start();const resume=f.pause();const scan=wallet.sync();
 await new Promise(resolve=>setImmediate(resolve));f.lock();const cleanup=wallet.cleanupConnections();
 assert.ok(f.descriptors.filter(d=>/tprv/.test(d.value)).every(d=>d.destroyed));
 resume();await assert.rejects(scan,/locked/);await cleanup;
 assert.equal(f.calls.includes('apply update'),false);assert.equal(f.calls.filter(c=>c==='dispose wallet').length,1);
 await wallet.cleanupConnections();assert.equal(f.calls.filter(c=>c==='dispose wallet').length,1);
});

test('cancelling a still-starting wallet immediately destroys key-bearing descriptors before storage returns',async()=>{
 let release;const disk=new Promise(resolve=>{release=resolve;});const f=nativeFixture({mkdir:()=>disk});
 const controller=new AbortController();const starting=f.start(controller.signal);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.descriptors.filter(d=>/tprv/.test(d.value)).length,2);
 controller.abort();assert.ok(f.descriptors.filter(d=>/tprv/.test(d.value)).every(d=>d.destroyed));
 release();await assert.rejects(starting,/locked/);assert.equal(f.calls.includes('public wallet'),false);
});

test('concurrent refund resumes sign once and can only repeat the same saved broadcast',async()=>{
 const f=refundFixture();await f.setup();
 await Promise.all([f.fake.submitMoveRefund(f.wallet,f.spark,f.move,f.plan,()=>{}),f.fake.submitMoveRefund(f.wallet,f.spark,f.move,f.plan,()=>{})]);
 assert.equal(f.calls.filter(call=>call[0]==='sign').length,1);
 assert.ok(f.calls.filter(call=>call[0]==='broadcast').every(call=>call[1]==='saved-raw'));f.journal.close();
});
