'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const existingModules = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { TransactionSync, SyncError, syncKey } = require('../lib/opago/tx-sync.ts');
const { TransactionContractTestAdapter } = require('../lib/opago/tx-test-adapter.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { assertTxContract, checkReceipt } = require('../lib/opago/tx-contract.ts');
const { HkaTransactionPort } = require('../lib/opago/tx-api.ts');
const { signV3Challenge } = require('../lib/opago/tx-proof.ts');
const sources = require('../lib/opago/tx-sources.ts');
for (const name of Object.keys(require.cache)) if (name.endsWith('.ts') && !existingModules.has(name)) delete require.cache[name];
const code = c => e => e.code === c || e.message === c;
const owner = { localWalletId: 'local-key', source:'spark', sourceWalletId:'02'+'55'.repeat(32), network:'regtest', subject:'user-a', installationId:randomUUID(), generation:0 };
const btc = (id='transfer-a', status='pending', amount=123000) => ({ localId:id, report:{asset:'BTC',rail:'spark',id_source:'SPARK_TRANSFER_ID',source_payment_id:id,direction:'incoming',sdk_status:status,status,amount_msat:amount} });
function fixture(items=[btc()], extra={}) {
  const store = extra.store || new MemoryPrivateStore(); let time = Date.UTC(2026,9,6); let current=true;
  const selected = extra.owner || owner;
  const backend = new TransactionContractTestAdapter(store,selected,randomUUID,()=>time);
  const streams = extra.sources || [{id:'spark-history',async read(){return{items,next:null};}}];
  const sync = new TransactionSync(store,selected,streams,backend,randomUUID,()=>{if(!current)throw new SyncError('sync_owner_changed');},()=>time);
  return {store,backend,sync,selected,streams,advance:ms=>time+=ms,stop:()=>{current=false;},reopen:()=>new TransactionSync(store,selected,streams,backend,randomUUID,()=>{},()=>time)};
}
test('F5 validates every upstream v3 report, receipt, challenge and session vector',()=>{
  const vectors=require('../docs/transaction-sync/tx-foundation-v3/test-vectors/schema-vectors.json').vectors;
  for(const group of vectors.filter(g=>['WalletPaymentReport','WalletPaymentReceipt','WalletChallenge','WalletSession','CreateWalletChallenge','BindWallet','CreateWalletSession'].includes(g.definition))) {
    for(const v of group.valid) assert.doesNotThrow(()=>assertTxContract(group.definition,v.value),group.definition+': '+v.case);
    for(const v of group.invalid) assert.throws(()=>assertTxContract(group.definition,v.value),undefined,group.definition+': '+v.case);
  }
});
test('F5 atomically enqueues a page with its checkpoint; overlap and repeat processing are idempotent',async()=>{
  const f=fixture([], {sources:[{id:'spark-history',async read(cursor){return cursor===null?{items:[btc(),btc()],next:'next'}:{items:[btc(),btc('b')],next:null};}}]});
  await f.sync.collect(1);let s=await f.sync.snapshot();assert.equal(s.queued,1);assert.equal(s.sources['spark-history'].cursor,'next');
  await f.reopen().collect(1);s=await f.sync.snapshot();assert.equal(s.queued,2);assert.equal(s.sources['spark-history'].cycles,1);
  await f.sync.collect(5);assert.equal((await f.sync.snapshot()).queued,2);
  await f.sync.flush();s=await f.sync.snapshot();assert.equal(s.queued,0);assert.equal(s.acknowledged,2);assert.equal(s.verified,0);assert.equal(s.unresolved,2);
  await f.sync.collect();await f.sync.flush();assert.equal(f.backend.writes.length,2);
});
test('F5 source progress does not advance when the durable page commit fails',async()=>{
  const f=fixture();const write=f.store.write.bind(f.store);let fail=true;
  f.store.write=async(k,v)=>{if(fail&&k===syncKey(owner)){fail=false;throw Error('disk');}return write(k,v);};
  await assert.rejects(f.sync.collect());assert.equal((await f.sync.snapshot()).queued,0);assert.deepEqual((await f.sync.snapshot()).sources,{});
  await f.reopen().collect();assert.equal((await f.sync.snapshot()).queued,1);
});
test('F5 lost response and process restart replay the same durable key/body and obtain the first receipt',async()=>{
  const f=fixture([btc('a','settled')]);await f.sync.collect();f.backend.loseNextResponse=true;
  await assert.rejects(f.sync.flush(),code('sync_network'));const doc=await f.store.read(syncKey(owner));const key=doc.entries[0].id;
  assert.equal(f.backend.writes.length,1);f.advance(3000);await f.reopen().flush();
  assert.equal(f.backend.writes.length,1);const recovered=await f.store.read(syncKey(owner));assert.equal(recovered.receipts[0].eventId,key);
  assert.equal((await f.sync.snapshot()).provisional,1);assert.equal((await f.sync.snapshot()).verified,0);
});
test('F5 crash before transmission persists attempt/key; crash after ack is safe on restart',async()=>{
  const f=fixture();await f.sync.collect();const key=(await f.store.read(syncKey(owner))).entries[0].id;
  const report=f.backend.report.bind(f.backend);f.backend.report=async()=>{throw Error('process stopped');};
  await assert.rejects(f.sync.flush());assert.equal(f.backend.writes.length,0);f.backend.report=report;f.advance(10000);
  await f.reopen().flush();assert.equal(f.backend.writes[0].key,key);await f.reopen().flush();assert.equal(f.backend.writes.length,1);
});
test('F5 transient outage obeys Retry-After, bounds a run, preserves stable keys and allows independent streams',async()=>{
  const f=fixture([btc(),btc('b')],{sources:[{id:'offline',async read(){throw Error('offline');}},{id:'journal',async read(){return{items:[btc(),btc('b')],next:null};}}]});
  await assert.rejects(f.sync.collect());assert.equal((await f.sync.snapshot()).queued,2);
  f.backend.rejectNext=new SyncError('upstream_unavailable',true,60);await assert.rejects(f.sync.flush(),code('upstream_unavailable'));
  await f.sync.flush();assert.equal(f.backend.writes.length,1); // other independent entry can progress; blocked entry retains its delay
  f.advance(59000);await f.sync.flush();assert.equal(f.backend.writes.length,1);f.advance(1000);await f.sync.flush();assert.equal(f.backend.writes.length,2);
});
test('F5 concurrent instances share a per-owner queue and cannot overwrite checkpoints or duplicate reports',async()=>{
  const f=fixture();const other=f.reopen();await Promise.all([f.sync.collect(),other.collect()]);
  await Promise.all([f.sync.flush(),other.flush()]);assert.equal(f.backend.writes.length,1);assert.equal((await other.snapshot()).acknowledged,1);
});
test('F5 source fairness persists across small batches; malformed cursors do not skip data',async()=>{
  const calls=[];const f=fixture([],{sources:['one','two','three'].map(id=>({id,async read(){calls.push(id);return{items:[btc(id)],next:null};}}))});
  await f.sync.collect(1);await f.reopen().collect(1);await f.reopen().collect(1);assert.deepEqual(calls,['one','two','three']);
  const bad=fixture([],{sources:[{id:'bad',async read(c){return{items:[btc()],next:c===null?'a':'a'};}}]});
  await bad.sync.collect(1);await assert.rejects(bad.sync.collect(1),code('sync_invalid_contract'));assert.equal((await bad.sync.snapshot()).sources.bad.cursor,'a');
});
test('F5 schema-invalid, cross-wallet, wrong-network and secret-bearing events never enqueue or advance',async()=>{
  for(const patch of [{preimage:'aa'.repeat(32)},{amount_msat:1.5},{amount_msat:Number.MAX_SAFE_INTEGER+1},{access_token:'secret'},{asset:'HBAR'}]){
    const value=btc();Object.assign(value.report,patch);const f=fixture([value]);await assert.rejects(f.sync.collect());assert.equal((await f.sync.snapshot()).queued,0);
  }
  const o={...owner,source:'hedera',sourceWalletId:'0.0.1',network:'mainnet'};
  const value={localId:'h',report:{asset:'HBAR',rail:'hedera',id_source:'HEDERA_TRANSACTION_ID',network:'testnet',source_payment_id:'0.0.1@1.000000001',direction:'outgoing',sdk_status:'SUCCESS',status:'settled',amount_tinybar:1}};
  const f=fixture([value],{owner:o});await assert.rejects(f.sync.collect(),code('sync_owner_changed'));
});
test('F5 owner change during source read cannot resurrect an outbox after wipe',async()=>{
  let release;const f=fixture([],{sources:[{id:'slow',read:()=>new Promise(resolve=>release=resolve)}]});const work=f.sync.collect();
  await new Promise(resolve=>setImmediate(resolve));f.stop();await f.store.remove(syncKey(owner));release({items:[btc()],next:null});
  await assert.rejects(work,code('sync_owner_changed'));assert.equal(await f.store.read(syncKey(owner)),null);
});
test('F5 logout/account/wallet/restore/install generations isolate queues; changing backend epoch cannot replay old reports',async()=>{
  const f=fixture();await f.sync.collect();
  for(const patch of [{subject:'other'},{localWalletId:'restored-key'},{generation:1},{installationId:randomUUID()},{network:'mainnet'}]){
    const other=fixture([],{store:f.store,owner:{...owner,...patch}});assert.equal((await other.sync.snapshot()).queued,0);
  }
  await f.sync.flush();const a=f.backend.authorize.bind(f.backend);f.backend.authorize=async o=>({...await a(o),ownershipEpoch:2});
  await assert.rejects(f.sync.flush(),code('sync_owner_changed'));
});
test('F5 session expiry suspends delivery without changing event keys; account authorization is rechecked',async()=>{
  const f=fixture();await f.sync.collect();const key=(await f.store.read(syncKey(owner))).entries[0].id;
  f.backend.expired=true;await assert.rejects(f.sync.flush(),code('sync_session_expired'));assert.equal(f.backend.writes.length,0);
  f.backend.expired=false;await f.sync.flush();assert.equal(f.backend.writes[0].key,key);
  const wrong=fixture();await wrong.sync.collect();const auth=wrong.backend.authorize.bind(wrong.backend);wrong.backend.authorize=async o=>({...await auth(o),subject:'wrong'});
  await assert.rejects(wrong.sync.flush(),code('sync_owner_changed'));assert.equal(wrong.backend.writes.length,0);
});
test('F5 no-write HBAR rejection remains blocked; only explicit retry under proposed local support uses a new key',async()=>{
  const o={...owner,source:'hedera',sourceWalletId:'0.0.1',network:'testnet'};
  const f=fixture([{localId:'h',report:{asset:'HBAR',rail:'hedera',id_source:'HEDERA_TRANSACTION_ID',network:'testnet',source_payment_id:'0.0.1@1.000000001',direction:'outgoing',sdk_status:'SUCCESS',status:'settled',amount_tinybar:1}}],{owner:o});
  await f.sync.collect();const key=(await f.store.read(syncKey(o))).entries[0].id;
  await assert.rejects(f.sync.flush(),code('asset_not_enabled'));f.backend.enabledHbar=true;f.advance(10000);await f.sync.flush();assert.equal(f.backend.writes.length,0);
  await f.sync.retryDisabledReports();await f.sync.flush();assert.notEqual(f.backend.writes[0].key,key);assert.equal((await f.sync.snapshot()).verified,0);
});
test('F5 reports receipt acknowledgement independently from verification and polls the contracted receipt read',async()=>{
  const f=fixture([btc('a','settled'),btc('b')]);await f.sync.collect();await f.sync.flush();
  assert.equal((await f.sync.snapshot()).acknowledged,2);assert.equal((await f.sync.snapshot()).verified,0);
  await f.backend.verifyTestEvidence();f.advance(6000);await f.sync.refreshReceipts();assert.equal((await f.sync.snapshot()).verified,2);
  const auth=await f.backend.authorize(owner);const receipt=await f.backend.receipt(auth,(await f.store.read(syncKey(owner))).receipts[0].receipt.receipt_id);
  for(const patch of [{wallet_id:randomUUID()},{source_payment_id:'wrong'},{external_id:'spark-transfer:wrong'}]) assert.throws(()=>checkReceipt({...receipt,...patch},auth.walletId,btc('a','settled').report));
});
test('F5 incomplete/zero amounts and null source IDs remain observations; terminal updates get distinct stable keys',async()=>{
  const f=fixture([btc('a','pending',null)]);await f.sync.collect();await f.sync.flush();
  f.streams[0].read=async()=>({items:[btc('a','settled'),btc('a','pending',null),btc('a','failed')],next:null});await f.sync.collect();await f.sync.flush();
  assert.equal(f.backend.writes.length,3);assert.equal(new Set(f.backend.writes.map(w=>w.key)).size,3);
  const unknown=btc();unknown.report.source_payment_id=null;const g=fixture([unknown]);await g.sync.collect();await g.sync.flush();assert.equal((await g.sync.snapshot()).unresolved,1);
});
test('F5 migration is idempotent and never treats legacy v2 progress as a v3 acknowledgement',async()=>{
  const f=fixture([]);await f.store.write('old-v2.cursor',{acknowledged:true,cursor:100});
  await f.sync.migrate('local-journals-v1-v2',[btc()]);await f.reopen().migrate('local-journals-v1-v2',[btc()]);
  assert.equal((await f.sync.snapshot()).queued,1);assert.equal((await f.sync.snapshot()).acknowledged,0);
  assert.deepEqual(await f.store.read('old-v2.cursor'),{acknowledged:true,cursor:100});
  await f.sync.flush();await f.reopen().migrate('local-journals-v1-v2',[btc()]);assert.equal(f.backend.writes.length,1);
});
test('F5 exact amounts use integer units, preserve precision and refuse a settled amount outside the public range',()=>{
  assert.equal(sources.exactAmount('9007199254740991'),Number.MAX_SAFE_INTEGER);
  assert.equal(sources.exactAmount('9007199254740992'),null);assert.throws(()=>sources.exactAmount(9007199254740992));
  assert.equal(sources.exactAmount('123',1000n),123000);assert.equal(sources.exactAmount('0'),null);assert.equal(sources.exactAmount('1.2'),null);
  const c=sources.sparkRequestCandidate({id:'request',typename:'LightningReceiveRequest',status:'FUTURE',transfer:{totalAmount:{originalUnit:'MILLISATOSHI',originalValue:123}}});
  assert.equal(c.report.amount_msat,123);assert.equal(c.report.status,null);assert.equal(c.report.direction,'incoming');
  assert.equal(sources.sparkRequestCandidate({typename:'BuyRequest'}),null);
});
test('F5 synthetic canonical identity does not regress on late pending evidence and quarantines terminal conflicts until independent evidence',async()=>{
  const f=fixture([btc('a','settled')]);await f.sync.collect();await f.sync.flush();const auth=await f.backend.authorize(owner);
  const first=await f.backend.report(auth,btc('a','pending').report,randomUUID());assert.equal(first.resolution,'linked');
  const conflict=await f.backend.report(auth,btc('a','failed').report,randomUUID());assert.equal(conflict.resolution,'unresolved');assert.equal(conflict.transaction_id,null);
  const replay=await f.backend.report(auth,btc('a','failed').report,randomUUID());assert.equal(replay.resolution,'unresolved');
  await f.backend.verifyTestEvidence();const read=await f.backend.receipt(auth,conflict.receipt_id);assert.equal(read.verification_status,'verified');
  const firstRead=await f.backend.receipt(auth,first.receipt_id);assert.equal(firstRead.transaction_id,read.transaction_id);
});
test('F5 Lightning preimages cannot enter the durable outbox even though optional transient wire proofs exist',async()=>{
  const row={localId:'x',report:{asset:'BTC',rail:'lightning',id_source:'SPARK_LIGHTNING_REQUEST_ID',source_payment_id:'request',direction:'outgoing',sdk_status:'pending',status:'pending',amount_msat:1000,payment_hash:'aa'.repeat(32),preimage:'bb'.repeat(32)}};
  const f=fixture([row]);await assert.rejects(f.sync.collect(),code('sync_invalid_contract'));assert.equal((await f.sync.snapshot()).queued,0);
});
test('F5 HBAR source references canonicalize SDK/mirror IDs; fee and staking rewards are excluded exactly',()=>{
  assert.equal(sources.hederaTransactionId('00.00.001-0002-1'),'0.0.1@2.000000001');
  const raw={transaction_id:'0.0.1-2-1',name:'CRYPTOTRANSFER',nonce:0,scheduled:false,result:'SUCCESS',charged_tx_fee:'12',consensus_timestamp:'3.000000001',
    transfers:[{account:'0.0.1',amount:'-100'},{account:'0.0.2',amount:'90'},{account:'0.0.98',amount:'12'}],staking_reward_transfers:[{account:'0.0.1',amount:'2'}]};
  const a=sources.hederaMirrorCandidate(raw,'testnet','0.0.1');assert.equal(a.report.amount_tinybar,90);assert.equal(a.report.counterparty_account_id,'0.0.2');assert.equal(a.report.direction,'outgoing');
  assert.equal(sources.hederaMirrorCandidate({...raw,nonce:1},'testnet','0.0.1'),null);
  assert.equal(sources.hederaMirrorCandidate({...raw,scheduled:true},'testnet','0.0.1'),null);
  assert.equal(sources.hederaMirrorCandidate({...raw,token_transfers:[{}]},'testnet','0.0.1'),null);
  assert.equal(sources.hederaMirrorCandidate({...raw,result:'DUPLICATE_TRANSACTION'},'testnet','0.0.1'),null);
  assert.equal(sources.hederaMirrorCandidate(raw,'testnet','0.0.98'),null);
  const zero=sources.hederaMirrorCandidate({...raw,transfers:[{account:'0.0.1',amount:'-12'}],staking_reward_transfers:[]},'testnet','0.0.1');assert.equal(zero.report.amount_tinybar,null);assert.equal(zero.report.status,null);
});
test('F5 journal conversion preserves unknown outcomes and identity/hash aliases without secrets',()=>{
  const c=sources.lightningJournalCandidate({paymentHash:'aa'.repeat(32),requestId:null,amountSats:7,state:'pending',result:null});
  assert.equal(c.report.source_payment_id,null);assert.equal(c.report.payment_hash,'aa'.repeat(32));assert.equal(c.report.status,'pending');
  const q=sources.sparkRequestCandidate({id:'request',typename:'LightningSendRequest',status:'PENDING',paymentPreimage:'secret',encodedInvoice:'secret-invoice',invoice:{paymentHash:'aa'.repeat(32)}});
  assert.equal(JSON.stringify(q).includes('secret'),false);assert.equal(q.report.status,null);
  assert.equal(sources.hederaJournalCandidate({mode:'checkout'},'testnet','0.0.1'),null);
});
test('F5 live API uses only normative report/receipt routes, WalletBearer, current contract and durable idempotency',async()=>{
  const f=fixture();const auth=await f.backend.authorize(owner);const receipt=await f.backend.report(auth,btc().report,randomUUID());const calls=[];
  const port=new HkaTransactionPort({mode:'hka',async request(r){calls.push(r);return{status:r.method==='POST'?201:200,authenticated:true,body:receipt,requestId:randomUUID()};}},o=>f.backend.authorize(o));
  await port.report(auth,btc().report,'77777777-7777-4777-8777-777777777777');await port.receipt(auth,receipt.receipt_id);
  assert.equal(calls[0].path,`/api/v3/wallets/${auth.walletId}/payments/reports`);assert.equal(calls[0].contract,'tx-foundation-v3');assert.equal(calls[0].auth,'wallet');
  assert.equal(calls[0].idempotencyKey,'77777777-7777-4777-8777-777777777777');assert.equal(calls[1].method,'GET');assert.deepEqual(calls[1].body,{});
  assert.throws(()=>new HkaTransactionPort(f.backend,()=>{}));
});
test('F5 action-bound proof validates exact account/source/network/install/challenge before consent or signing',async()=>{
  const context={purpose:'bind',tenant:'tenant',subject:'subject',source:'hedera',sourceWalletId:'0.0.123',network:'testnet',installationId:'-'};
  const challenge={challenge_id:randomUUID(),purpose:'bind',expires_at:'2099-01-01T00:00:00Z'};
  challenge.message=['opago-tx-foundation-v3','purpose:bind','tenant:tenant','subject:subject','wallet_source:hedera','source_wallet_id:0.0.123','network:testnet','installation_id:-','challenge_id:'+challenge.challenge_id,'nonce:'+'55'.repeat(32),'expires_at:'+challenge.expires_at].join('\n');
  let signed=0,consented=0;const ports={resolution:'local-test-only-ed25519',assertCurrent(){},async consent(){consented++;return()=>{};},async sign(bytes){signed++;assert.equal(Buffer.from(bytes).toString(),challenge.message);return 'synthetic-signature';}};
  await assert.rejects(signV3Challenge(challenge,context,{...ports,resolution:''}),code('sync_backend_pending'));
  for(const patch of [{subject:'other'},{sourceWalletId:'0.0.999'},{network:'mainnet'},{installationId:randomUUID()},{purpose:'session'}]) await assert.rejects(signV3Challenge(challenge,{...context,...patch},ports),code('challenge_invalid'));
  assert.equal(signed,0);assert.equal(consented,0);const proof=await signV3Challenge(challenge,context,ports);assert.equal(proof.challenge_id,challenge.challenge_id);assert.equal(signed,1);
});
