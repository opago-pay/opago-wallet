'use strict';
// Real production Wallet transport/intake. Only native socket interface is adapted to this test CA.
const fs=require('node:fs');const path=require('node:path');const https=require('node:https');const Module=require('node:module');
const {randomUUID,randomBytes}=require('node:crypto');const test=require('node:test');const assert=require('node:assert/strict');
const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const ca=fs.readFileSync(fixture.ca);const origin=new URL(fixture.audience);
const agent=new https.Agent({ca,keepAlive:false,lookup(host,options,done){assert.equal(host,origin.hostname);done(null,options.all?[{address:'127.0.0.1',family:4}]:'127.0.0.1',options.all?undefined:4);}});
let fault='',lostPath='';const wire=[];
function http(url,options={}){const target=new URL(url);assert.ok(target.origin===fixture.audience||target.origin===fixture.internal);
  return new Promise((resolve,reject)=>{const req=https.request(target,{method:options.method||'GET',headers:options.headers,ca,agent:target.origin===fixture.audience?agent:undefined,timeout:options.timeoutMs||10000},response=>{
    const parts=[];let size=0;response.on('data',b=>{size+=b.length;if(size>(options.maxBytes||100000))response.destroy(new Error('bounded response'));else parts.push(b);});response.on('error',reject);
    response.on('end',()=>resolve({status:response.statusCode,body:Buffer.concat(parts).toString('utf8'),contentType:response.headers['content-type']||'',cacheControl:response.headers['cache-control']||'',retryAfter:response.headers['retry-after']||''}));
  });req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('bounded timeout')));if(options.body)req.write(options.body);req.end();});}
const native={verifyRs256:async()=>false,cancel:async()=>{},async request(options){
  const binary=options.bodyEncoding==='base64';let body=binary?Buffer.from(options.body,'base64'):options.body;
  if(binary){assert.ok(body.length>28);assert.equal(options.headers['content-type'],'application/octet-stream');assert.ok(options.timeoutMs<=120000);if(fault==='tamper'){body=Buffer.from(body);body[14]^=1;}}
  const encrypted=options.headers['x-opago-envelope']?JSON.parse(Buffer.from(options.headers['x-opago-envelope'],'base64url')):JSON.parse(options.body||'{}');
  wire.push({method:options.method,path:new URL(options.url).pathname,key:options.headers['idempotency-key'],nonce:encrypted.nonce,enc:encrypted.enc,binary});
  const result=await http(options.url,{...options,body});if(options.url.includes(lostPath)&&lostPath){lostPath='';throw new Error('synthetic lost response');}return result;
}};
const original=Module._load;
Module._load=function(id,parent,isMain){if(id==='react-native')return{Platform:{OS:'android'}};
  if(id==='expo-modules-core')return{requireOptionalNativeModule:()=>native};
  if(id==='./config'&&parent?.filename===path.join(__dirname,'../lib/strict-http-transport.ts'))return{appConfig:{allowInsecureHttp:false}};
  return original.call(this,id,parent,isMain);};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{product:'ReactNative'}});
require('../tests/register-typescript.cjs');
const {NativeHkaTransport}=require('../lib/opago/hka.ts');const {nativeHkaHttp}=require('../lib/opago/hka-http-native.ts');const {OpagoApi}=require('../lib/opago/api.ts');
const {OpagoAccount}=require('../lib/opago/account.ts');const {MemoryPrivateStore}=require('../lib/opago/store.ts');const {IdentityIntake}=require('../lib/opago/identity.ts');const {photoHash}=require('../lib/opago/identity-media.ts');
const images=require('../tests/fixtures/p3-photo.json');const bytes=new Uint8Array(Buffer.from(images.normalized_jpeg,'base64'));
const fields={given_name:'Synthetic',family_name:'Example',date_of_birth:'1990-01-02',document_number:'TEST123',document_expiry:'2030-12-31',nationality:'DEU',contact_email:'synthetic@example.test',document_type:'passport'};
const store=new MemoryPrivateStore();const transport=new NativeHkaTransport({...fixture,platform:'android',build:10},nativeHkaHttp,store,n=>new Uint8Array(randomBytes(n)));
const api=new OpagoApi(transport);let now=Date.now();
const account=new OpagoAccount(api,store,{publicKey:'02'+'55'.repeat(32),network:'regtest',sign:async()=>{throw new Error('No signatures/payments in HTTP test');}},
  {mode:'oidc',login:async()=>{throw new Error('No real OIDC');},refresh:async()=>{throw new Error('No real OIDC');},logout:async()=>{}},randomUUID,()=>now);
test('P3 actual Wallet/public API HTTP integration',async t=>{
  await account.load();const walletId=randomUUID();const time=delta=>new Date(Date.now()+delta).toISOString().replace(/\.\d{3}Z$/,'Z');
  account.state.session={kind:'session',wallet_id:walletId,scope:'onboarding',access_token:'synthetic-wallet-valid',access_expires_at:time(600000),refresh_token:'synthetic-refresh',refresh_expires_at:time(3600000)};
  account.state.wallet={wallet_id:walletId,wallet_pubkey:account.identity.publicKey,network:'regtest',custodial:false,status:'unbound',party_id:null,address:null,photo_match:null};
  let model=new IdentityIntake(account);await model.load();await model.edit(fields);
  await t.test('encrypted create with lost response: durable key, real GET reconciliation and no duplicate submission',async()=>{
    lostPath='/api/v2/onboarding/kyc';await assert.rejects(model.submit([{bytes,side:'front',uri:'file:///synthetic/image'}]));assert.ok(model.pending);now+=2000;
    model=new IdentityIntake(account);await model.load();assert.equal(model.pending,undefined);assert.equal(model.snapshot.status,'draft');
    assert.equal(wire.filter(r=>r.method==='POST'&&r.path==='/api/v2/onboarding/kyc').length,1);
  });
  await t.test('real binary exporter upload/descriptor/query/response binding and lost upload recovery',async()=>{
    lostPath='/documents';await assert.rejects(model.submit([{bytes,side:'front',uri:'file:///synthetic/image'}]));now+=2000;assert.ok(model.pending);
    await model.recover();assert.equal(model.pending,undefined);assert.equal(model.snapshot.documents[0].original_sha256,photoHash(bytes));
    assert.equal(wire.filter(r=>r.binary).length,1);
  });
  await t.test('explicit submit produces 202/submitted, receipt is not comparison approval',async()=>{
    await model.submit([]);assert.equal(model.snapshot.status,'submitted');assert.equal(model.snapshot.active_approval_revision,null);
    await model.refresh();assert.equal(model.snapshot.processing_status,'queued');
  });
  const setStatus=status=>http(fixture.internal+'/_test/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
  await t.test('account-authorized revision correction retains active approval across a failed new comparison',async()=>{
    await setStatus('approved');await model.refresh();assert.equal(model.snapshot.active_approval_revision,1);
    account.state.credential={subject:'synthetic-account',accessToken:'synthetic-account-valid',authTime:now,expiresAt:now+600000};model=new IdentityIntake(account);await model.load();
    await model.newRevision();await model.edit({...fields,given_name:'Corrected synthetic'});await model.submit([]);await setStatus('correction_requested');await model.refresh();
    assert.equal(model.snapshot.revision,2);assert.equal(model.snapshot.active_approval_revision,1);
  });
  await t.test('tampered binary body cannot write; unchanged logical retry uses fresh HPKE nonce/context',async()=>{
    await model.newRevision();const s=model.snapshot;const descriptor={submission_id:s.submission_id,revision:s.revision,side:'front',content_type:'image/jpeg',plaintext_length:bytes.length,original_sha256:photoHash(bytes),expected_edit_version:s.edit_version};
    const request={method:'POST',path:'/api/v2/onboarding/kyc/'+s.submission_id+'/documents?side=front&revision='+s.revision,body:descriptor,photo:bytes,auth:'wallet',bearer:'synthetic-wallet-valid',idempotencyKey:randomUUID()};
    fault='tamper';await assert.rejects(api.call(request));fault='';await api.call(request);await api.call(request);
    const attempts=wire.filter(r=>r.binary&&r.path.endsWith(s.submission_id+'/documents')).slice(-2);assert.equal(attempts[0].key,attempts[1].key);assert.notEqual(attempts[0].nonce,attempts[1].nonce);assert.notEqual(attempts[0].enc,attempts[1].enc);
  });
  await t.test('private-state persistence omits image bytes/paths; logs contain only case names and result counts',async()=>{
    for(const value of store.values.values()){assert.equal(value.includes(images.normalized_jpeg),false);assert.equal(value.includes('file:///'),false);}
    assert.equal(wire.some(r=>r.path.includes('/payments/')),false);
  });
});
