'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {randomUUID,randomBytes}=require('node:crypto');const {ed25519}=require('@noble/curves/ed25519');
const previous=new Set(Object.keys(require.cache));require('./register-typescript.cjs');
const {V3WalletOwnership}=require('../lib/opago/tx-ownership.ts');const {F3ContractTestBackend}=require('../lib/opago/test-adapter.ts');
const {MemoryPrivateStore}=require('../lib/opago/store.ts');const {SyncError}=require('../lib/opago/tx-sync.ts');const {jcs}=require('../lib/opago/encoding.ts');
for(const n of Object.keys(require.cache))if(n.endsWith('.ts')&&!previous.has(n))delete require.cache[n];
const timestamp=n=>new Date(n).toISOString().replace('.000Z','Z');
async function fixture(){
  const store=new MemoryPrivateStore();const f3=new F3ContractTestBackend(store,randomUUID,'regtest');const account=f3.createAccount();await account.load();await account.signIn();
  let now=Date.UTC(2026,9,6);account.now=()=>now;
  const privateKey=randomBytes(32),publicKey=Buffer.from(ed25519.getPublicKey(privateKey)).toString('hex');
  const owner={localWalletId:'local-f3',source:'hedera',sourceWalletId:'0.0.123',network:'testnet',subject:account.state.credential.subject,installationId:account.installationId,generation:0};
  const wallet={wallet_id:randomUUID(),wallet_source:'hedera',source_wallet_id:owner.sourceWalletId,network:'testnet',custody_type:'unknown',status:'active',ownership_epoch:1,label:null,purpose:null,bound_at:timestamp(now),deleted_at:null};
  const state={challenges:new Map(),commits:new Map(),calls:[],signed:0,consented:0,loseBind:false,rotated:false,offline:false};
  const error=(code,status,retryable=false)=>({status,authenticated:true,retryAfterSeconds:retryable?5:undefined,body:{error:{code,message:'Synthetic local failure',retryable,details:{}},request_id:randomUUID()}});
  const transport={mode:'contract-test',async request(r){
    state.calls.push(r);assert.equal(r.contract,'tx-foundation-v3');assert.equal(r.auth,'account');assert.equal(r.bearer,account.state.credential.accessToken);
    if(state.offline)return error('upstream_unavailable',503,true);
    const prior=state.commits.get(r.idempotencyKey);if(prior){assert.equal(prior.path,r.path);assert.equal(prior.digest,jcs(r.body));return prior.result;}
    let body;let status=200;
    if(r.path==='/api/v3/wallets/challenges'){
      const purpose=r.body.purpose;const id=randomUUID();const expires_at=timestamp(now+10000);
      body={challenge_id:id,purpose,expires_at,message:['opago-tx-foundation-v3','purpose:'+purpose,'tenant:synthetic-tenant','subject:'+owner.subject,'wallet_source:hedera','source_wallet_id:'+owner.sourceWalletId,'network:'+owner.network,'installation_id:'+(purpose==='session'?owner.installationId:'-'),'challenge_id:'+id,'nonce:'+randomBytes(32).toString('hex'),'expires_at:'+expires_at].join('\n')};
      if(purpose==='bind'){assert.equal(r.body.public_key,publicKey);assert.equal(r.body.account_id,owner.sourceWalletId);assert.equal(r.body.network,owner.network);}
      state.challenges.set(id,body);status=201;
    }else if(r.method==='GET'){body=wallet;
    }else{
      const challenge=state.challenges.get(r.body.challenge_id);
      if(!challenge||Date.parse(challenge.expires_at)<=now||!ed25519.verify(Buffer.from(r.body.signature,'hex'),Buffer.from(challenge.message),Buffer.from(publicKey,'hex')))return error('challenge_invalid',400);
      if(state.rotated)return error('rail_not_enabled',422); // local stand-in for the missing decided consensus-key policy
      if(r.path==='/api/v3/wallets'){assert.equal(challenge.purpose,'bind');body=wallet;status=201;
      }else{assert.equal(r.path,'/api/v3/wallets/'+wallet.wallet_id+'/sessions');assert.equal(challenge.purpose,'session');body={wallet_id:wallet.wallet_id,installation_id:owner.installationId,access_token:'synthetic-v3-wallet-session-token',expires_at:timestamp(now+30000)};status=201;}
      state.challenges.delete(challenge.challenge_id);
    }
    const result={status,authenticated:true,body};if(r.idempotencyKey)state.commits.set(r.idempotencyKey,{path:r.path,digest:jcs(r.body),result});
    if(state.loseBind&&r.path==='/api/v3/wallets'){state.loseBind=false;throw new SyncError('sync_network',true);}return result;
  }};
  const ports={resolution:'synthetic-only-ed25519-key-policy',tenant:'synthetic-tenant',publicKey,assertCurrent(){},async consent(){state.consented++;return()=>{};},async sign(bytes){state.signed++;return Buffer.from(ed25519.sign(bytes,privateKey)).toString('hex');}};
  return{account,store,owner,wallet,state,ports,transport,client:new V3WalletOwnership(account,owner,transport,ports),advance:ms=>now+=ms};
}
test('F5 v3 Hedera binding and session use exact action proofs and contracted routes behind an explicit policy gate',async()=>{
  const f=await fixture();const bound=await f.client.bind();assert.equal(bound.wallet_id,f.wallet.wallet_id);assert.equal(bound.custody_type,'unknown');
  const auth=await f.client.proveSession(bound.wallet_id);assert.equal(auth.sourceWalletId,'0.0.123');assert.equal(auth.network,'testnet');assert.equal(auth.installationId,f.account.installationId);
  assert.equal(f.state.signed,2);assert.equal(f.state.consented,2);await f.client.authorization(bound.wallet_id);assert.equal(f.state.signed,2);
  await f.client.bind();assert.equal(f.state.signed,2);assert.ok(f.state.calls.every(r=>!r.path.includes('/payments/')));
  assert.equal((await f.store.read('no-such-outbox')),null);f.advance(31000);await assert.rejects(f.client.authorization(bound.wallet_id),e=>e.code==='sync_session_expired');
  await f.client.proveSession(bound.wallet_id);assert.equal(f.state.signed,3);
});
test('F5 lost bind result after challenge expiry recovers its durable commit without a second signature',async()=>{
  const f=await fixture();f.state.loseBind=true;await assert.rejects(f.client.bind(),e=>e.code==='sync_network');f.advance(11000);
  const restored=new V3WalletOwnership(f.account,f.owner,f.transport,f.ports);await restored.bind();assert.equal(f.state.signed,1);
  const commits=f.state.calls.filter(r=>r.path==='/api/v3/wallets');assert.equal(commits[0].idempotencyKey,commits[1].idempotencyKey);assert.deepEqual(commits[0].body,commits[1].body);
});
test('F5 wrong wallet/account/network, rotated key, unknown proof policy and ownership epoch changes cannot issue usable authorization',async()=>{
  const f=await fixture();await assert.rejects(new V3WalletOwnership(f.account,f.owner,f.transport,{...f.ports,resolution:''}).bind(),e=>e.code==='sync_backend_pending');assert.equal(f.state.signed,0);
  await f.client.bind();f.state.rotated=true;await assert.rejects(f.client.proveSession(f.wallet.wallet_id),e=>e.code==='rail_not_enabled');
  f.state.rotated=false;await f.client.proveSession(f.wallet.wallet_id);f.wallet.ownership_epoch=2;await assert.rejects(f.client.authorization(f.wallet.wallet_id),e=>e.code==='sync_session_expired');
  f.wallet.network='mainnet';await assert.rejects(f.client.authorization(f.wallet.wallet_id),e=>e.code==='sync_owner_changed');f.wallet.network='testnet';
  f.account.state.syncGeneration=1;await assert.rejects(f.client.authorization(f.wallet.wallet_id),e=>e.code==='sync_owner_changed');
});
test('F5 a failed remote logout suspends reporting durably; refresh/restart cannot silently resume the account lifecycle',async()=>{
  const f=await fixture();await f.client.bind();await f.client.proveSession(f.wallet.wallet_id);
  f.account.login.logout=async()=>{throw Error('offline logout');};await assert.rejects(f.account.signOut());
  assert.equal(f.account.state.syncPaused,true);assert.equal(f.account.state.syncGeneration,1);
  await assert.rejects(f.client.authorization(f.wallet.wallet_id),e=>e.code==='sync_owner_changed');
  const next=new V3WalletOwnership(f.account,{...f.owner,generation:1},f.transport,f.ports);
  await assert.rejects(next.bind(),e=>e.code==='sync_owner_changed');
  await f.account.signIn();assert.equal(f.account.state.syncPaused,undefined);assert.equal(f.account.state.syncGeneration,1);
  assert.equal((await f.account.store.read(f.account.operationKey('unused'))),null);
});
test('F5 internal fresh account authentication during a lost deletion response cannot clear synchronization suspension',async()=>{
  const f=await fixture();f.account.state.credential.authTime=0;
  f.account.login.login=async()=>({...f.account.state.credential,authTime:f.account.now(),expiresAt:f.account.now()+60000});
  const call=f.account.api.call.bind(f.account.api);f.account.api.call=async r=>{if(r.method==='DELETE')throw Error('lost deletion response');return call(r);};
  await assert.rejects(f.account.deleteAccount());assert.equal(f.account.state.syncPaused,true);assert.equal(f.account.state.syncGeneration,1);
  await assert.rejects(new V3WalletOwnership(f.account,{...f.owner,generation:1},f.transport,f.ports).bind(),e=>e.code==='sync_owner_changed');
});
