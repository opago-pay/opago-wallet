'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const existingModules = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { F4ContractTestBackend } = require('../lib/opago/pos-test-adapter.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { PosLinking } = require('../lib/opago/pos-link.ts');
for (const name of Object.keys(require.cache)) if (name.endsWith('.ts') && !existingModules.has(name)) delete require.cache[name];
const translate = (key, values={}) => key.replace(/\{([^}]+)\}/g,(_,name)=>String(values[name]));
function nodes(tree) { if(Array.isArray(tree))return tree.flatMap(nodes);return !tree||typeof tree!=='object'?[]:[tree,...nodes(tree.props?.children)]; }
function text(tree) { return Array.isArray(tree)?tree.map(text).join(' '):tree&&typeof tree==='object'?text(tree.props?.children):typeof tree==='string'?tree:''; }
const action=(tree,label)=>nodes(tree).find(n=>n.type==='action'&&n.props.label===label);
async function fixture(t, params={test:'1'}, dev=true) {
  const store=new MemoryPrivateStore();const backend=new F4ContractTestBackend(store,randomUUID,'regtest');const account=backend.createAccount();
  await account.load();await account.signIn();await account.proveOwnership();await account.bind();await backend.setKya('approved');await account.refresh();await account.address('set','alice-test');
  const pos=new PosLinking(account,backend);await pos.load();let pending=Promise.resolve();let focused=true;let background;const navigation=[];
  const runtime={account,pos,testOnly:params.test==='1',startTestPos:()=>backend.operatorStart(),confirmTestOperator:id=>backend.operatorConfirm(id)};
  const oldDev=global.__DEV__;global.__DEV__=dev;t.after(()=>{global.__DEV__=oldDev;});
  const app=hookFixture('app/pos-link.tsx',()=>({
    'expo-router':{useLocalSearchParams:()=>params,useRouter:()=>({push:value=>navigation.push(value)})},
    '@react-navigation/native':{useIsFocused:()=>focused},
    'react-native':{AppState:{currentState:'active',addEventListener:(_,fn)=>{background=fn;return{remove(){}};}}},
    '../hooks/useOpagoAccount':{useOpagoAccount:()=>({runtime,busy:false,error:'',run:fn=>{pending=account.exclusive(fn).catch(()=>{});return pending;}})},
    '../components/opago/opago-ui':{Action:'action',Card:'card',Copy:'copy',OpagoPage:'page',TextInput:'input',ui:{input:{}}},
    '../components/send/payment-scanner':{PaymentScanner:'scanner'},'../lib/payment-scan':{paymentScanInbox:{take:()=>null}},
    '../components/opago/update-account-app':{UpdateAccountApp:'update'},'../lib/theme-styles':{themeColor:()=> '#fff'},'../lib/i18n':{t:translate},
  }),exports=>exports.default());t.after(app.unmount);
  return {...app,backend,account,pos,navigation,runtime,afterAction:async()=>{await pending;return app.render();},background:value=>background(value),focus:value=>{focused=value;}};
}
test('F4 UI displays authoritative merchant/POS/receiver, explicit approval and separate operator wait',async t=>{
  const app=await fixture(t);let tree=app.render();assert.match(text(tree),/No real device, backend or funds/);
  action(tree,'Test: operator starts linking').props.onPress();tree=await app.afterAction();
  assert.match(text(tree),/Local test merchant/);assert.match(text(tree),/pos-abcdefghij/);assert.match(text(tree),/alice-test@opago.com/);
  assert.match(text(tree),/no POS management rights/);assert.equal(app.backend.bindingWrites,0);
  assert.equal(action(tree,'Approve this POS recipient wallet').props.disabled,false);
  action(tree,'Approve this POS recipient wallet').props.onPress();tree=await app.afterAction();
  assert.match(text(tree),/Waiting for the operator’s separate confirmation/);assert.doesNotMatch(text(tree),/Both sides confirmed/);
  assert.equal(action(tree,'Approve this POS recipient wallet'),undefined);
  action(tree,'Test: operator confirms separately').props.onPress();tree=await app.afterAction();assert.match(text(tree),/Both sides confirmed/);
  action(tree,'Load current POS links').props.onPress();tree=await app.afterAction();assert.match(text(tree),/active/);
  assert.match(text(tree),/Wallet-side unlinking is not defined/);assert.equal(action(tree,'Unlink POS'),undefined);
});
test('F4 UI refusal sends no proof, and pending result can be recovered without a new approval',async t=>{
  const app=await fixture(t);let tree=app.render();action(tree,'Test: operator starts linking').props.onPress();tree=await app.afterAction();
  action(tree,'Decline on this device').props.onPress();tree=await app.afterAction();assert.match(text(tree),/Declined on this device/);assert.equal(app.backend.bindingWrites,0);
  action(tree,'Test: operator starts linking').props.onPress();tree=await app.afterAction();app.backend.loseNextBindingResponse=true;
  action(tree,'Approve this POS recipient wallet').props.onPress();tree=await app.afterAction();
  assert.ok(action(tree,'Recover linking response'));assert.equal(action(tree,'Approve this POS recipient wallet'),undefined);
  action(tree,'Recover linking response').props.onPress();tree=await app.afterAction();assert.match(text(tree),/Waiting for the operator/);assert.equal(app.backend.bindingWrites,1);
});
test('F4 UI scanner reads only linking codes and asks for review without signing',async t=>{
  const app=await fixture(t);let tree=app.render();action(tree,'Scan operator linking QR').props.onPress();tree=app.render();
  const scanner=nodes(tree).find(n=>n.type==='scanner');assert.equal(scanner.props.title,'Link a POS');
  assert.throws(()=>scanner.props.onOtherCode('https://127.0.0.1/admin'));const qr=await app.backend.operatorStart();
  assert.equal(scanner.props.onOtherCode(qr),true);tree=await app.afterAction();assert.equal(app.pos.phase,'review');assert.equal(app.backend.bindingWrites,0);
  assert.ok(action(tree,'Decline on this device'));
});
test('F4 UI invalidates cached completed status on background, disables consent outside focus',async t=>{
  const app=await fixture(t);let tree=app.render();action(tree,'Test: operator starts linking').props.onPress();tree=await app.afterAction();
  app.focus(false);tree=app.render();assert.equal(action(tree,'Approve this POS recipient wallet').props.disabled,true);
  app.focus(true);await app.pos.refresh();await app.pos.approve();await app.backend.operatorConfirm(app.pos.current.review.intent.binding_intent_id);await app.pos.refresh();
  tree=app.render();assert.match(text(tree),/Both sides confirmed/);app.background('background');tree=app.render();assert.doesNotMatch(text(tree),/Both sides confirmed/);
  assert.match(text(tree),/Saved request/);
});
test('F4 UI unavailable integration is explicit; production has no test mode controls',async t=>{
  const app=await fixture(t,{},false);app.runtime.startTestPos=undefined;app.runtime.confirmTestOperator=undefined;app.pos.source=undefined;
  const tree=app.render();assert.match(text(tree),/awaits the agreed QR format/);assert.equal(action(tree,'Start local POS test mode'),undefined);
  assert.equal(action(tree,'Test: operator starts linking'),undefined);assert.equal(action(tree,'Approve this POS recipient wallet'),undefined);
  assert.equal(action(tree,'Scan operator linking QR'),undefined);
});
