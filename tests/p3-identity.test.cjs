'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const {randomUUID}=require('node:crypto');
const previous=new Set(Object.keys(require.cache)); require('./register-typescript.cjs');
const {IdentityIntake,validateIdentity,emptyIdentity}=require('../lib/opago/identity.ts');
const {IdentityContractTestBackend}=require('../lib/opago/identity-test-adapter.ts');
const {MemoryPrivateStore}=require('../lib/opago/store.ts');
const {inspectPhoto,stripJpegMetadata,inspectHeic}=require('../lib/opago/identity-media.ts');
for(const n of Object.keys(require.cache))if(n.endsWith('.ts')&&!previous.has(n))delete require.cache[n];
const fixture=require('./fixtures/p3-photo.json'); const bytes=k=>new Uint8Array(Buffer.from(fixture[k],'base64'));
const fields=()=>({given_name:'Synthetic',family_name:'Example',date_of_birth:'1990-01-02',document_number:'TEST123',document_expiry:'2030-12-31',nationality:'DEU',contact_email:'synthetic@example.test',document_type:'passport'});
const photo=side=>({side,bytes:bytes('normalized_jpeg'),uri:'file:///private-test/photo.jpg'});
async function setup(){let time=Date.UTC(2026,9,7);const store=new MemoryPrivateStore();const backend=new IdentityContractTestBackend(store,randomUUID,'regtest',()=>time);
  const account=backend.createAccount();await account.load();await account.proveOwnership();const model=new IdentityIntake(account);await model.load();await model.edit(fields());
  return{backend,account,model,store,advance:n=>time+=n};}
test('P3 validates the eight contracted fields, real dates, formats and bounded data',()=>{
  assert.deepEqual(validateIdentity(fields()),[]);assert.equal(validateIdentity(emptyIdentity()).length,7);
  for(const [field,value]of Object.entries({given_name:' ',family_name:'\u0000',date_of_birth:'2026-02-31',document_number:'a'.repeat(65),document_expiry:'yesterday',nationality:'de',contact_email:'not-an-email',document_type:'selfie'}))assert.ok(validateIdentity({...fields(),[field]:value}).includes(field));
  assert.deepEqual(validateIdentity({...fields(),given_name:'Érika 李',family_name:'مُصطفى'}),[]);
});
test('P3 checks actual image headers and resource bounds and removes EXIF/GPS metadata without changing JPEG image data',()=>{
  assert.deepEqual(inspectPhoto(bytes('png')),{contentType:'image/png',width:600,height:800});
  assert.equal(inspectPhoto(bytes('source_jpeg')).contentType,'image/jpeg');const clean=stripJpegMetadata(bytes('source_jpeg'));
  assert.equal(Buffer.from(clean).includes(Buffer.from('Exif')),false);assert.equal(Buffer.from(clean).includes(Buffer.from('synthetic-GPS')),false);
  assert.deepEqual(inspectPhoto(clean),inspectPhoto(bytes('source_jpeg')));
  assert.throws(()=>inspectPhoto(new Uint8Array(10485761)),/identity_image_size/);assert.throws(()=>inspectPhoto(new Uint8Array([1,2,3])),/identity_image_format/);
  const png=bytes('png');new DataView(png.buffer).setUint32(16,10001);assert.throws(()=>inspectPhoto(png),/identity_image_invalid/);
  const small=bytes('png');new DataView(small.buffer).setUint32(20,479);assert.throws(()=>inspectPhoto(small));
  const box=(kind,data)=>{const b=Buffer.alloc(8+data.length);b.writeUInt32BE(b.length);b.write(kind,4);data.copy(b,8);return b;};
  const size=Buffer.alloc(12);size.writeUInt32BE(600,4);size.writeUInt32BE(800,8);
  const heic=Buffer.concat([box('ftyp',Buffer.from('heic\0\0\0\0heic')),box('meta',Buffer.concat([Buffer.alloc(4),box('iprp',box('ipco',box('ispe',size)))]))]);
  assert.deepEqual(inspectHeic(heic),{width:600,height:800});assert.throws(()=>inspectPhoto(heic));
  size.writeUInt32BE(10001,4);assert.throws(()=>inspectHeic(Buffer.concat([box('ftyp',Buffer.from('heic\0\0\0\0heic')),box('ispe',size)])));
});
test('P3 full draft/photo/submit/status flow and immutable correction revision preserves active approval',async()=>{
  const f=await setup();await f.model.submit([photo('front')]);assert.equal(f.model.snapshot.status,'submitted');assert.equal(f.model.snapshot.active_approval_revision,null);
  assert.equal(f.backend.effects.length,3);await f.backend.setIdentityStatus('approved');await f.model.refresh();assert.equal(f.model.snapshot.active_approval_revision,1);
  await f.account.signIn();const m=new IdentityIntake(f.account);await m.load();await m.newRevision();assert.equal(m.snapshot.revision,2);assert.equal(m.snapshot.active_approval_revision,1);
  await m.edit({...m.fields,document_number:'TEST456'});await m.submit([]);await f.backend.setIdentityStatus('correction_requested');await m.refresh();assert.equal(m.snapshot.active_approval_revision,1);
  await m.newRevision();await m.edit({...m.fields,family_name:'Forbidden change'});await assert.rejects(m.submit([photo('front')]),e=>e.code==='revision_conflict');
  await m.edit({...m.snapshot.fields,given_name:'Corrected synthetic'});await m.submit([photo('front')]);assert.equal(m.snapshot.revision,3);assert.equal(m.snapshot.active_approval_revision,1);
  await f.backend.setIdentityStatus('rejected');await m.refresh();assert.equal(m.snapshot.active_approval_revision,1);await assert.rejects(m.newRevision(),e=>e.code==='kyc_state_invalid');
});
test('P3 identity card requires both sides and does not submit incomplete documents',async()=>{
  const f=await setup();await f.model.edit({...fields(),document_type:'identity_card'});await assert.rejects(f.model.submit([photo('front')]),e=>e.code==='identity_photo_required');
  assert.equal(f.backend.effects.some(p=>p.endsWith('/submit')),false);await f.model.submit([photo('back')]);assert.equal(f.model.snapshot.documents.length,2);
});
test('P3 lost create response survives restart and recovers by GET without a second create',async()=>{
  const f=await setup();f.backend.loseNext=true;await assert.rejects(f.model.submit([photo('front')]));assert.ok(f.model.pending);assert.equal(f.model.snapshot,null);
  await assert.rejects(f.model.edit({...fields(),given_name:'Another'}),e=>e.code==='identity_outcome_unknown');f.advance(2000);
  const resumed=new IdentityIntake(f.account);await resumed.load();assert.equal(resumed.pending,undefined);assert.equal(resumed.snapshot.status,'draft');
  await resumed.submit([photo('front')]);assert.equal(f.backend.effects.filter(p=>p==='/api/v2/onboarding/kyc'||p==='POST/api/v2/onboarding/kyc').length,1);
});
test('P3 lost upload and submit responses use stored hashes/status before any replay',async()=>{
  const f=await setup();const original=f.backend.request.bind(f.backend);let target='documents';f.backend.request=async req=>{if(req.path.includes(target)&&req.method==='POST'){f.backend.loseNext=true;target='never';}return original(req);};
  await assert.rejects(f.model.submit([photo('front')]));assert.ok(f.model.pending);f.advance(2000);await f.model.recover([]);assert.equal(f.model.pending,undefined);
  target='/submit';await assert.rejects(f.model.submit([]));f.advance(2000);await f.model.recover([]);assert.equal(f.model.snapshot.status,'submitted');assert.equal(f.backend.effects.length,3);
});
test('P3 unknown upload without a retained image stays honest and cannot silently create another operation',async()=>{
  const f=await setup();await assert.rejects(f.model.submit([]),e=>e.code==='identity_photo_required');const original=f.backend.request.bind(f.backend);
  f.backend.request=async req=>{if(req.path.includes('/documents?'))throw new Error('synthetic network outage');return original(req);};
  await assert.rejects(f.model.submit([photo('front')]));const key=f.model.pending.key;f.advance(2000);
  await assert.rejects(f.model.recover([]),e=>e.code==='identity_photo_recovery');assert.equal(f.model.pending.key,key);await assert.rejects(f.model.discard(),e=>e.code==='identity_outcome_unknown');
  f.backend.request=original;await f.model.recover([photo('front')]);assert.equal(f.model.pending,undefined);assert.equal(f.backend.effects.filter(p=>p.endsWith('/documents')).length,1);
});
test('P3 Retry-After/session expiry preserve one pending operation and no automatic writes occur on load',async()=>{
  const f=await setup();const original=f.backend.request.bind(f.backend);let denied=true;
  f.backend.request=async req=>denied&&req.method==='POST'?{status:429,authenticated:true,retryAfterSeconds:60,body:{error:{code:'rate_limited',message:'synthetic',retryable:true,details:{}},request_id:randomUUID()}}:original(req);
  await assert.rejects(f.model.submit([photo('front')]));const key=f.model.pending.key;await assert.rejects(f.model.recover(),e=>e.code==='retry_later');assert.equal(f.backend.effects.length,0);
  f.advance(61000);denied=false;await f.model.recover();assert.equal(f.backend.effects.length,1);assert.equal(f.model.pending,undefined);
  f.backend.request=async req=>req.method==='POST'?{status:401,authenticated:true,body:{error:{code:'session_expired',message:'synthetic',retryable:false,details:{}},request_id:randomUUID()}}:original(req);
  await assert.rejects(f.model.submit([photo('front')]));assert.ok(f.model.pending.key!==key);assert.equal(f.backend.effects.length,1);
});
test('P3 delayed results are fenced by account/wallet/lifecycle changes, and draft removal uses the existing DELETE',async()=>{
  const f=await setup();await assert.rejects(f.model.submit([]));const snapshot=structuredClone(f.model.snapshot);let release;
  const original=f.backend.request.bind(f.backend);f.backend.request=async req=>req.method==='GET'?new Promise(r=>release=()=>r({status:200,authenticated:true,body:snapshot})):original(req);
  const reading=f.model.refresh();await new Promise(r=>setImmediate(r));f.account.state.syncGeneration=1;release();await assert.rejects(reading,e=>e.code==='identity_owner_changed');
  f.backend.request=original;f.account.state.syncGeneration=0;await f.model.discard();assert.equal(f.model.snapshot,null);assert.equal(f.backend.effects.at(-1).startsWith('DELETE'),true);
  f.account.state.credential={subject:'other'};await assert.rejects(f.model.load(),e=>e.code==='identity_owner_changed');
});
test('P3 older responses cannot replace a newer revision and serialized protected state contains no image bytes',async()=>{
  const f=await setup();await f.model.submit([photo('front')]);const older=structuredClone(f.model.snapshot);await f.backend.setIdentityStatus('approved');await f.model.refresh();
  const original=f.backend.request.bind(f.backend);f.backend.request=async req=>req.method==='GET'?{status:200,authenticated:true,body:{...older,edit_version:1,updated_at:'2020-01-01T00:00:00Z'}}:original(req);
  await f.model.refresh();assert.equal(f.model.snapshot.status,'approved');for(const value of f.store.values.values()) {assert.equal(value.includes(fixture.normalized_jpeg),false);assert.equal(value.includes('file:///'),false);}
  assert.equal(f.backend.calls.some(r=>r.path.includes('/onboarding/kyc')),false);
});
test('P3 discard reconciles the authoritative wallet, permits a new initial draft and preserves a restored approval',async()=>{
  const f=await setup();await assert.rejects(f.model.submit([]));await f.model.discard();assert.equal(f.account.state.wallet.photo_match,null);
  await f.model.edit(fields());await f.model.submit([photo('front')]);await f.backend.setIdentityStatus('approved');await f.model.refresh();
  const approved=structuredClone(f.backend.photo);await f.account.signIn();const m=new IdentityIntake(f.account);await m.load();await m.newRevision();
  const original=f.backend.request.bind(f.backend);
  f.backend.request=async req=>{const result=await original(req);if(req.method==='DELETE'){f.backend.photo=approved;await f.backend.setIdentityStatus('approved');}return result;};
  await m.discard();assert.equal(m.snapshot.status,'approved');assert.equal(m.snapshot.revision,1);assert.equal(f.account.state.wallet.photo_match.active_approval_revision,1);
});
test('P3 lost discard and failed post-discard reads remain recoverable without repeating a confirmed DELETE',async()=>{
  const f=await setup();await assert.rejects(f.model.submit([]));f.backend.loseNext=true;await assert.rejects(f.model.discard());f.advance(2000);
  await f.model.recover();assert.equal(f.model.needsRecovery,false);assert.equal(f.account.state.wallet.photo_match,null);
  await f.model.edit(fields());await assert.rejects(f.model.submit([]));const original=f.backend.request.bind(f.backend);let offline=true;
  f.backend.request=async req=>offline&&req.path==='/api/v2/wallet/me'?Promise.reject(new Error('synthetic network outage')):original(req);
  await assert.rejects(f.model.discard());assert.equal(f.model.needsRecovery,true);await assert.rejects(f.model.edit(fields()));
  const deletes=f.backend.effects.filter(p=>p.startsWith('DELETE')).length;offline=false;const m=new IdentityIntake(f.account);await m.load();
  assert.equal(m.needsRecovery,false);assert.equal(f.backend.effects.filter(p=>p.startsWith('DELETE')).length,deletes);
});
test('P3 shared account queue prevents concurrent screens from duplicating submissions',async()=>{
  const f=await setup();const other=new IdentityIntake(f.account);
  const results=await Promise.allSettled([f.account.exclusive(()=>f.model.submit([photo('front')])),f.account.exclusive(async()=>{await other.load();await other.submit([photo('front')]);})]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(f.backend.effects.length,3);
  const fresh=await setup();await assert.rejects(fresh.model.submit([photo('back')]),e=>e.code==='invalid_request');assert.equal(fresh.backend.effects.length,0);
});
