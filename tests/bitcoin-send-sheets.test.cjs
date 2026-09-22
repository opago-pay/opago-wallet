'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
require('./register-typescript.cjs');
const { modalKeyboardInset } = require('../lib/keyboard-inset.ts');
const { editPaymentAmount, parsePaymentAmount } = require('../lib/payment-input.ts');
const { hookFixture } = require('./react-hooks-fixture.cjs');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes), ...nodes(tree.props?.footer)];
// Render local pure amount/cost/button components so the assertions cover what users see.
function expand(tree) {
 if (!tree || typeof tree !== 'object') return tree;
 if (typeof tree.type === 'function') return expand(tree.type(tree.props));
 return React.cloneElement(tree, tree.props?.footer ? {footer:expand(tree.props.footer)} : {}, ...React.Children.toArray(tree.props?.children).map(expand));
}
const text = tree => nodes(tree).filter(n=>n.type==='text').map(n=>React.Children.toArray(n.props.children).filter(c=>typeof c==='string'||typeof c==='number').join('')).join(' ');
const base = {
 'react-native': { View:'view',Text:'text',StyleSheet:{create:v=>v},ActivityIndicator:'spinner',useWindowDimensions:()=>({width:360,fontScale:1}),Keyboard:{dismiss(){},metrics:()=>undefined,addListener:()=>({remove(){}})} },
 '@/components/ui/wallet-interaction': {TextInput:'input',TouchableOpacity:'button'},
 '@/hooks/useLanguage': {useLanguage(){}}, '@/hooks/useExchangeRates': {useExchangeRates:()=>({btcToEur:75000,updatedAt:Date.now()})},
 '@/lib/i18n': {t:key=>key,appLocale:()=> 'en'}, '@/lib/config':{appConfig:{isMainnet:true}},
 '@/components/ui/asset-icon':{AssetIcon:'asset'}, '@expo/vector-icons':{Ionicons:'icon'},
 './send-sheet': {BitcoinSendScreen:'screen'},
 '@/lib/payment-input': {editPaymentAmount},
};
test('review sheet shows exact SAT costs, hides raw requests and only sends on explicit confirmation',async t=>{
 const calls=[];const props={amountSats:10,feeSats:2,route:'lightning',recipient:'synthetic-long-invoice',label:'wallet.example\nUnverified description',loading:false,onConfirm:()=>calls.push('send'),onCancel:()=>calls.push('back')};
 const app=hookFixture('components/bitcoin/payment-ui.tsx',()=>base,e=>e.BitcoinReview(props));t.after(app.unmount);
 let tree=expand(await app.settle());assert.equal(tree.type,'screen');
 assert.match(text(tree),/10 SAT/);assert.match(text(tree),/Fee, at most 2 SAT/);assert.match(text(tree),/Maximum total 12 SAT/);
 assert.doesNotMatch(text(tree),/synthetic-long-invoice|Unverified description|provide a Lightning/);assert.deepEqual(calls,[]);
 nodes(tree).find(n=>n.props.accessibilityLabel==='Payment details').props.onPress();tree=expand(app.render());
 assert.match(text(tree),/synthetic-long-invoice/);assert.match(text(tree),/Identity not verified/);
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Send').props.onPress();assert.deepEqual(calls,['send']);
 props.loading=true;tree=expand(app.render());assert.equal(tree.props.loading,true);
 assert.equal(nodes(tree).find(n=>n.type==='button'&&n.props.accessibilityState?.busy).props.disabled,true);
});

test('review preparation shows no editable amount or invented fees and keeps Send disabled',async t=>{
 const calls=[];const props={onCancel:()=>calls.push('cancel')};
 const app=hookFixture('components/bitcoin/payment-ui.tsx',()=>base,e=>e.BitcoinReviewLoading(props));t.after(app.unmount);
 let tree=expand(await app.settle());assert.equal(tree.props.title,'Check this payment');
 assert.doesNotMatch(text(tree),/0 SAT|Fee, at most|Maximum total/);assert.equal(nodes(tree).some(n=>n.type==='input'),false);
 assert.equal(nodes(tree).find(n=>n.type==='button'&&text(n)==='Send').props.disabled,true);
 props.amountSats=20;tree=expand(app.render());assert.match(text(tree),/20 SAT/);
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Cancel').props.onPress();assert.deepEqual(calls,['cancel']);
});
test('amount sheet clears input on unit changes and fixed invoices have no editable amount',async t=>{
 const calls=[];const props={amount:'20',currency:'SAT',recipient:'wallet.example',loading:false,disabled:false,onchain:false,onAmount:value=>calls.push(['amount',value]),onCurrency:value=>calls.push(['currency',value]),onBack(){},onContinue:()=>calls.push('continue')};
 const app=hookFixture('components/bitcoin/amount-sheet.tsx',()=>({...base,'./payment-ui':{BitcoinPaymentActions:'actions',bitcoinStyles:{}}}),e=>e.BitcoinAmountSheet(props));t.after(app.unmount);
 let tree=await app.settle();assert.equal(tree.type,'screen');assert.equal(nodes(tree).some(n=>n.type==='input'),false);
 assert.equal(nodes(tree).filter(n=>/^[0-9]$/.test(n.props.accessibilityLabel)).length,10);
 assert.equal(nodes(tree).some(n=>n.props.accessibilityLabel==='Decimal separator'),false);
 nodes(tree).find(n=>n.props.accessibilityLabel==='EUR').props.onPress();assert.deepEqual(calls,[['amount',''],['currency','EUR']]);
 props.fixedAmount=50;tree=app.render();assert.equal(nodes(tree).some(n=>n.type==='input'),false);assert.match(text(tree),/50 SAT/);
 assert.equal(nodes(tree).some(n=>n.props.accessibilityLabel==='Delete last digit'),false);
 props.onchain=true;tree=app.render();assert.match(text(tree),/confirm sending afterwards/);
 assert.equal(tree.props.footer.props.label,'Prepare fee offer');assert.equal(tree.props.footer.props.onCancel,props.onBack);assert.equal(calls.includes('continue'),false);
});
test('custom keypad supports localized fractions and deletion without rounding or decimal SAT',()=>{
 for(const separator of ['.',',']){
  let amount='';for(const key of [separator,'0','1'])amount=editPaymentAmount(amount,key,'EUR',separator);
  assert.equal(amount,`0${separator}01`);assert.equal(parsePaymentAmount(amount,'EUR',75000),13);
  assert.equal(editPaymentAmount(amount,separator,'EUR',separator),amount);
  assert.equal(editPaymentAmount(amount,'delete','EUR',separator),`0${separator}0`);
 }
 assert.equal(editPaymentAmount('20',',','SAT',','),'20');
 assert.equal(editPaymentAmount('0','2','SAT',','),'2');
 assert.equal(editPaymentAmount('','delete','SAT',','),'');
 assert.equal(editPaymentAmount('2','-','SAT',','),'2');
 assert.equal(editPaymentAmount('0.12345678','9','EUR','.'),'0.12345678');
});
test('keypad updates the visible amount, uses locale decimal and blocks edits during preparation',async t=>{
 const props={amount:'',currency:'EUR',recipient:'wallet.example',loading:false,disabled:false,onchain:false,
  onAmount(value){props.amount=value;},onCurrency(){},onBack(){},onContinue(){}};
 const app=hookFixture('components/bitcoin/amount-sheet.tsx',()=>({...base,
  '@/lib/i18n':{t:key=>key,appLocale:()=> 'de-DE'},'./payment-ui':{BitcoinPaymentActions:'actions',bitcoinStyles:{}}}),e=>e.BitcoinAmountSheet(props));t.after(app.unmount);
 let tree=await app.settle();
 for(const label of ['Decimal separator','0','1']){nodes(tree).find(n=>n.props.accessibilityLabel===label).props.onPress();tree=app.render();}
 assert.match(text(tree),/0,01/);assert.equal(props.amount,'0,01');
 props.loading=true;tree=app.render();const digit=nodes(tree).find(n=>n.props.accessibilityLabel==='2');
 assert.equal(digit.props.disabled,true);digit.props.onPress();assert.equal(props.amount,'0,01');
});
test('full-screen payment hides private content on background/blur and guards Android back during submission',async t=>{
 let listener,back;let focused=true;const calls=[];
 const props={title:'Review',loading:true,onBack:()=>calls.push('back'),children:React.createElement('private-amount'),footer:React.createElement('actions')};
 const app=hookFixture('components/bitcoin/send-sheet.tsx',()=>({...base,
  'react-native':{...base['react-native'],ScrollView:'scroll',findNodeHandle:()=>null,
   BackHandler:{addEventListener:(_,fn)=>{back=fn;return{remove(){}};}},
   AppState:{currentState:'active',addEventListener:(_,fn)=>{listener=fn;return {remove(){}};}}},
  '@react-navigation/native':{useIsFocused:()=>focused},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:16})},
  '@/components/ui/wallet-interaction':{WalletActivityBoundary:'activity'},
 }),e=>e.BitcoinSendScreen(props));t.after(app.unmount);
 let tree=await app.settle();assert.equal(tree.type,'activity');back();assert.deepEqual(calls,[]);
 assert.equal(nodes(tree).some(n=>n.type==='modal'||n.type==='scan-background'),false);
 assert.equal(nodes(nodes(tree).find(n=>n.type==='scroll')).some(n=>n.type==='actions'),false);
 listener('background');tree=app.render();assert.equal(nodes(tree).some(n=>n.type==='private-amount'),false);
 listener('active');tree=app.render();assert.equal(nodes(tree).some(n=>n.type==='private-amount'),true);
 props.loading=false;app.render();back();assert.deepEqual(calls,['back']);
 focused=false;tree=app.render();assert.equal(nodes(tree).some(n=>n.type==='private-amount'),false);
});

test('payment animation follows real phases, stops on success and respects reduced motion',async t=>{
 const calls=[];let motion;const props={phase:'authorizing',amountSats:20};
 const app=hookFixture('components/bitcoin/payment-progress.tsx',()=>({...base,
  'react-native':{...base['react-native'],Easing:{linear:'linear'},
   Animated:{View:'animated',Value:class{setValue(){}interpolate(){return'rotation';}},timing:()=>({}),loop:()=>({start:()=>calls.push('start'),stop:()=>calls.push('stop')})},
   AccessibilityInfo:{isReduceMotionEnabled:async()=>false,addEventListener:(_,fn)=>{motion=fn;return{remove(){}};}}},
 }),e=>e.BitcoinPaymentProgress(props));t.after(app.unmount);
 let tree=await app.settle();assert.match(text(tree),/Confirm on your device/);assert.deepEqual(calls,['start']);
 props.phase='sending';tree=app.render();assert.match(text(tree),/Sending Bitcoin/);assert.doesNotMatch(text(tree),/Payment confirmed/);
 motion(true);app.render();assert.deepEqual(calls,['start','stop']);
 motion(false);app.render();props.phase='success';tree=app.render();assert.equal(tree.props.loading,false);assert.match(text(tree),/Payment confirmed/);
 assert.deepEqual(calls,['start','stop','start','stop']);
});
test('native sheet has no header action and cannot dismiss an in-flight payment',async t=>{
 const calls=[];const props={visible:true,title:'Review',hideClose:true,dismissDisabled:true,onClose:()=>calls.push('cancel'),children:null};
 const app=hookFixture('components/send/scanner-sheet.tsx',()=>({...base,
  'react-native':{...base['react-native'],Modal:'modal',ScrollView:'scroll',KeyboardAvoidingView:'keyboard',Platform:{OS:'android'},
   useWindowDimensions:()=>({height:740}),AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})},findNodeHandle:()=>null},
  '@/lib/keyboard-inset':{modalKeyboardInset},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:16})},
  '@/components/ui/wallet-interaction':{...base['@/components/ui/wallet-interaction'],WalletActivityBoundary:'activity'},
  './scanner-styles':{scannerStyles:{}},
 }),e=>e.ScannerSheet(props));t.after(app.unmount);
 let tree=await app.settle();tree.props.onRequestClose();assert.deepEqual(calls,[]);
 assert.equal(nodes(tree).some(n=>n.type==='button'),false);
 props.dismissDisabled=false;tree=app.render();tree.props.onRequestClose();assert.deepEqual(calls,['cancel']);
});
test('footer exposes Cancel beside confirmation and blocks both during payment',async t=>{
 const calls=[];const props={label:'Continue',onConfirm:()=>calls.push('confirm'),onCancel:()=>calls.push('cancel'),loading:false};
 const app=hookFixture('components/bitcoin/payment-ui.tsx',()=>base,e=>e.BitcoinPaymentActions(props));t.after(app.unmount);
 let tree=expand(await app.settle());let buttons=nodes(tree).filter(n=>n.type==='button');
 assert.equal(text(buttons[0]),'Cancel');assert.equal(text(buttons[1]),'Continue');buttons[0].props.onPress();assert.deepEqual(calls,['cancel']);
 props.loading=true;tree=expand(app.render());buttons=nodes(tree).filter(n=>n.type==='button');assert.ok(buttons.every(b=>b.props.disabled));
});
test('modal keyboard layout handles overlay, native resize and hide without double lifting',async t=>{
 const listeners={};const props={visible:true,title:'Amount',hideClose:true,onClose(){},children:React.createElement('input'),footer:React.createElement('actions-footer')};
 const app=hookFixture('components/send/scanner-sheet.tsx',()=>({...base,
  'react-native':{...base['react-native'],Modal:'modal',ScrollView:'scroll',Platform:{OS:'android'},
   Keyboard:{metrics:()=>undefined,addListener:(name,fn)=>{listeners[name]=fn;return{remove(){}};}},
   useWindowDimensions:()=>({height:740}),AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})},findNodeHandle:()=>null},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:16})},
  '@/components/ui/wallet-interaction':{...base['@/components/ui/wallet-interaction'],WalletActivityBoundary:'activity'},
  './scanner-styles':{scannerStyles:{}},'@/lib/keyboard-inset':{modalKeyboardInset},
 }),e=>e.ScannerSheet(props));t.after(app.unmount);
 let tree=await app.settle();listeners.keyboardDidShow({duration:0,endCoordinates:{screenY:420,height:320}});tree=app.render();
 let root=nodes(tree).find(n=>n.type==='activity');assert.equal(root.props.style[1].paddingBottom,320);
 assert.equal(nodes(tree).find(n=>n.props.accessibilityViewIsModal).props.style[1].maxHeight,384);
 assert.equal(nodes(nodes(tree).find(n=>n.type==='scroll')).some(n=>n.type==='actions-footer'),false,'footer stays outside scrolling body');
 root.props.onLayout({nativeEvent:{layout:{height:420}}});tree=app.render();root=nodes(tree).find(n=>n.type==='activity');
 assert.equal(root.props.style[1].paddingBottom,0,'native resize already removed keyboard area');
 assert.equal(nodes(tree).find(n=>n.props.accessibilityViewIsModal).props.style[1].maxHeight,384);
 listeners.keyboardDidHide({duration:0});root.props.onLayout({nativeEvent:{layout:{height:740}}});tree=app.render();
 assert.equal(nodes(tree).find(n=>n.type==='activity').props.style[1].paddingBottom,0);
 assert.equal(nodes(tree).find(n=>n.props.accessibilityViewIsModal).props.style[1].maxHeight,704);
});
