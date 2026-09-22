'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const { recognizePayment } = require('../lib/payment-recognition.ts');
const { bitcoinNetwork } = require('../lib/bitcoin/destination.ts');
const { p2wpkh } = require('@scure/btc-signer/payment');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { invoice } = require('./lightning-invoice-fixture.cjs');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const address = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(17)), bitcoinNetwork('REGTEST')).address;

test('recognition validates an invoice signature, amount, expiry and network without SDK preparation', async () => {
  const raw = invoice(20);
  assert.deepEqual(await recognizePayment(raw), { input: raw, kind: 'lightning', recipient: '07'.repeat(32), amount: '20', unit: 'SAT' });
  for (const invalid of [raw.slice(0,-1)+'x', invoice(20, 1), invoice(20, undefined, {network:'bc'}), 'https://example.com', 'hello']) {
    await assert.rejects(recognizePayment(invalid));
  }
});
test('onchain recognition preserves exact request amount and ignores unverified merchant labels', async () => {
  const plain = await recognizePayment(address); assert.equal(plain.amount,null); assert.equal(plain.recipient,address);
  const bip = await recognizePayment('bitcoin:'+address+'?amount=0.00002001&label=NotVerified');
  assert.equal(bip.amount,'2001'); assert.equal(bip.kind,'onchain'); assert.equal(bip.recipient,address);
  await assert.rejects(recognizePayment(address.slice(0,-1)+'x'));
});
test('LNURL address recognition checks metadata and limits but never asks its callback for an invoice', async () => {
  const previous = global.fetch; const requests=[];
  global.fetch = async url => { requests.push(String(url)); return new Response(JSON.stringify({ tag:'payRequest',minSendable:20000,maxSendable:20000,
    callback:'https://callback.example/pay',metadata:'[["text/plain","Unverified merchant"]]' }),{headers:{'content-type':'application/json'}}); };
  try {
    const result=await recognizePayment('recipient@wallet.example');
    assert.equal(result.amount,'20'); assert.equal(result.recipient,'recipient@wallet.example');
    assert.deepEqual(requests,['https://wallet.example/.well-known/lnurlp/recipient']);
  } finally { global.fetch=previous; }
});
test('HBAR recognition uses the existing account, amount and network validators', async () => {
  assert.deepEqual(await recognizePayment('0.0.123'), { input:'0.0.123',kind:'hedera',recipient:'0.0.123',amount:null,unit:'HBAR' });
  const request=await recognizePayment('hedera:0.0.123?amount=0.21');
  assert.equal(request.amount,'0.21');
  await assert.rejects(recognizePayment('hedera:0.0.123?network=not-a-network'));
  await assert.rejects(recognizePayment('hedera:0.0.123?amount=-1'));
});
test('scanner tab style is restored for review, blur and unmount', () => {
  const calls=[]; const state={hidden:true,focused:true};const navigation={setOptions: value=>calls.push(value.tabBarStyle)};
  const normal=require('../components/navigation/wallet-tab-style.ts').walletTabBarStyle(12,1.5);
  const app=hookFixture('hooks/useScannerTabBar.ts',()=>({'@react-navigation/native':{useIsFocused:()=>state.focused,useNavigation:()=>navigation},'react-native':{useWindowDimensions:()=>({fontScale:1.5})},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:12})},'@/components/navigation/wallet-tab-style':require('../components/navigation/wallet-tab-style.ts')}),exports=>exports.useScannerTabBar(state.hidden));
  app.render();assert.deepEqual(calls.at(-1),{display:'none'});
  state.hidden=false;app.render();assert.deepEqual(calls.at(-1),normal);
  state.hidden=true;app.render();state.focused=false;app.render();assert.deepEqual(calls.at(-1),normal);
  state.focused=true;app.render();app.unmount();assert.deepEqual(calls.at(-1),normal);
});
