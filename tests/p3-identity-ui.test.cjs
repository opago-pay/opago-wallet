'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {hookFixture}=require('./react-hooks-fixture.cjs');
const previous=new Set(Object.keys(require.cache));require('./register-typescript.cjs');
const identity=require('../lib/opago/identity.ts');const {IdentityContractTestBackend}=require('../lib/opago/identity-test-adapter.ts');const {MemoryPrivateStore}=require('../lib/opago/store.ts');const {WalletSession}=require('../lib/wallet-session.ts');
for(const n of Object.keys(require.cache))if(n.endsWith('.ts')&&!previous.has(n))delete require.cache[n];
const fixtureImage=require('./fixtures/p3-photo.json');const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const content=t=>Array.isArray(t)?t.map(content).join(' '):t&&typeof t==='object'?content(t.props?.children):typeof t==='string'||typeof t==='number'?String(t):'';
async function setup(t,{dev=true}={}){const old=global.__DEV__;global.__DEV__=dev;t.after(()=>global.__DEV__=old);
  let now=Date.UTC(2026,9,7),background,focus=true,canceled=false,denied=false,picks=0,cleaned=0,pickerWait;
  const walletSession=new WalletSession(()=>now);walletSession.unlock();const backend=new IdentityContractTestBackend(new MemoryPrivateStore(),randomUUID,'regtest',()=>now);const account=backend.createAccount();await account.load();await account.proveOwnership();
  const runtime={account,perform:fn=>account.exclusive(fn),setTestIdentity:s=>backend.setIdentityStatus(s),loseTestIdentityResponse:()=>backend.loseNext=true};
  const app=hookFixture('components/opago/legacy-identity-screen.tsx',()=>({'expo-router':{useLocalSearchParams:()=>({test:'1'})},'@react-navigation/native':{useIsFocused:()=>focus},
    buffer:require('buffer'),'../../tests/fixtures/p3-photo.json':fixtureImage,
    'react-native':{AppState:{currentState:'active',addEventListener:(_,fn)=>{background=fn;return{remove(){}};}},Image:'image',View:'view',KeyboardAvoidingView:'keyboard',Platform:{OS:'android'}},
    'expo-screen-capture':{usePreventScreenCapture(){}},'../../hooks/useOpagoAccount':{useOpagoAccount:()=>({runtime})},'../../lib/opago/identity':identity,
    '../../lib/opago/identity-media-native':{cleanupIdentityPhotos:async()=>cleaned++,removeIdentityPhoto:async p=>{p.bytes.fill(0);cleaned++;},selectIdentityPhoto:async(_source,side,guard)=>{picks++;guard();if(pickerWait)await pickerWait;guard();if(denied)throw new Error('identity_camera_denied');return canceled?null:{side,bytes:new Uint8Array(Buffer.from(fixtureImage.normalized_jpeg,'base64')),uri:'file:///synthetic/photo.jpg'};}},
    '../../lib/wallet-session':{walletSession},'../../lib/opago/api':require('../lib/opago/api.ts'),'../../lib/theme-styles':{themeColor:()=> '#fff'},'../../lib/i18n':{t:(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>v?.[k]??k)},
    './opago-ui':{Action:'action',Copy:'copy',Card:'card',OpagoPage:'page',TextInput:'input',ui:{input:{}}},
  }),m=>m.default());app.render();await app.settle();t.after(()=>app.unmount());
  const action=label=>nodes(app.render()).find(n=>n.type==='action'&&n.props.label===label);
  const click=async label=>{const n=action(label);assert.ok(n,label);assert.equal(!!n.props.disabled,false,label);n.props.onPress();return app.settle();};
  const fill=async()=>{const values=['Synthetic','Example','1990-01-02','TEST123','2030-12-31','DEU','synthetic@example.test'];const inputs=nodes(app.render()).filter(n=>n.type==='input');assert.equal(inputs.length,7);inputs.forEach((n,i)=>n.props.onChangeText(values[i]));await app.settle();};
  return{app,backend,account,walletSession,action,click,fill,advance:n=>now+=n,background:s=>{background(s);walletSession.handleAppState(s);},deferPick:()=>{let release;pickerWait=new Promise(r=>release=r);return()=>{release();pickerWait=undefined;};},focus:v=>focus=v,cancel:v=>canceled=v,deny:v=>denied=v,get cleaned(){return cleaned;},get picks(){return picks;}};
}
test('P3 complete UI flow validates, reviews every field/image, requires readability and explicit submission, then shows authoritative statuses',async t=>{
  const f=await setup(t);await f.click('Review identity submission');assert.match(content(f.app.render()),/Check this required field/);assert.equal(f.backend.effects.length,0);
  await f.fill();await f.click('Take document photo');await f.click('Review identity submission');assert.equal(f.action('Confirm and submit identity data').props.disabled,true);assert.equal(f.backend.effects.length,0);
  await f.click('I checked that the document is readable');await f.click('Confirm and submit identity data');assert.equal(f.backend.photo.status,'submitted');assert.equal(f.backend.effects.length,3);assert.ok(f.cleaned>=2);
  await f.click('Simulate identity approved');assert.match(content(f.app.render()),/not a fully verified identity/);assert.match(content(f.app.render()),/Active photo comparison revision/);
  await f.account.signIn();f.app.render();await f.app.settle();await f.click('Start a new identity revision');assert.equal(f.backend.photo.revision,2);assert.equal(f.backend.photo.active_approval_revision,1);
});
test('P3 UI camera permission errors, cancel, remove and retake do not submit or retain obsolete images',async t=>{
  const f=await setup(t);f.deny(true);await f.click('Take document photo');assert.match(nodes(f.app.render()).find(n=>n.type==='page').props.error,/Camera access was denied/);f.deny(false);f.cancel(true);await f.click('Choose document image');assert.equal(f.action('Remove selected image'),undefined);
  f.cancel(false);await f.click('Choose document image');await f.click('Remove selected image');assert.equal(f.action('Remove selected image'),undefined);await f.click('Take document photo');assert.equal(f.picks,4);assert.equal(f.backend.effects.length,0);
});
test('P3 UI lost response reports unknown and recovery checks the existing submission before further explicit review',async t=>{
  const f=await setup(t);await f.fill();await f.click('Choose document image');await f.click('Review identity submission');await f.click('I checked that the document is readable');await f.click('Simulate lost identity response');await f.click('Confirm and submit identity data');
  assert.match(content(f.app.render()),/result is unknown/);assert.equal(f.backend.effects.length,1);f.advance(2000);await f.click('Recover identity operation');assert.equal(f.backend.effects.length,1);
  await f.click('Confirm and submit identity data');assert.equal(f.backend.photo.status,'submitted');assert.equal(f.backend.effects.length,3);
});
test('P3 UI background/lock removes sensitive details and previews, and production cannot use synthetic status controls',async t=>{
  const f=await setup(t,{dev:false});assert.equal(f.action('Simulate lost identity response'),undefined);await f.fill();await f.click('Choose document image');f.background('background');await f.app.settle();
  assert.equal(nodes(f.app.render()).some(n=>n.type==='input'||n.type==='image'),false);assert.equal(f.backend.effects.length,0);assert.ok(f.cleaned>=2);
});
test('P3 system picker background hides data, restores only the same unlocked owner and rejects account changes',async t=>{
  const f=await setup(t);await f.fill();const release=f.deferPick();await f.click('Choose document image');f.background('background');await f.app.settle();
  assert.equal(nodes(f.app.render()).some(n=>n.type==='input'||n.type==='image'),false);f.background('active');await f.app.settle();release();await f.app.settle();
  assert.ok(f.action('Remove selected image'));assert.equal(nodes(f.app.render()).find(n=>n.type==='input').props.value,'Synthetic');assert.equal(f.backend.effects.length,0);
  const later=f.deferPick();await f.click('Choose document image');f.account.state.syncGeneration++;f.app.render();later();await f.app.settle();
  assert.equal(f.action('Remove selected image'),undefined);assert.equal(f.backend.effects.length,0);
});
test('P3 a double confirmation click sends exactly one reviewed submission',async t=>{
  const f=await setup(t);await f.click('Use synthetic identity fields');await f.click('Use synthetic document images');await f.click('Review identity submission');await f.click('I checked that the document is readable');
  const button=f.action('Confirm and submit identity data');button.props.onPress();button.props.onPress();await f.app.settle();assert.equal(f.backend.effects.length,3);assert.equal(f.backend.photo.status,'submitted');
});
