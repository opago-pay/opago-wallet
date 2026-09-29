'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { hookFixture } = require('./react-hooks-fixture.cjs');
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)]; }
function button(tree, label) { return nodes(tree).find(n => n.type === 'button' && (n.props.accessibilityLabel === label || nodes(n).some(c => c.type === 'text' && c.props.children === label))); }
function fixture(options = {}) {
  const calls = []; const state = { focused: true, locked: false, granted: true, torch: true, ...options };
  let appState; let back;
  const app = hookFixture('components/send/payment-scanner.tsx', () => ({
    'react-native': { View: 'view', Text: 'text', ScrollView: 'scroll', ActivityIndicator: 'spinner', StyleSheet: { create: v => v },
      Platform: { OS: 'android' }, useWindowDimensions: () => ({ width: 360, height: 720, fontScale: 1 }),
      Keyboard: { dismiss() {} }, AccessibilityInfo: { announceForAccessibility: v => calls.push(['announce',v]) },
      BackHandler: { addEventListener: (_,fn) => { back=fn; return {remove(){}}; } },
      AppState: { currentState: 'active', addEventListener: (_,fn) => {appState=fn;return {remove(){}};} }, Linking: { openSettings: async()=>{} } },
    '@react-navigation/native': { useIsFocused: () => state.focused },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top:24,bottom:0 }) },
    '@/components/ui/wallet-interaction': { TouchableOpacity:'button',TextInput:'input' },
    '@expo/vector-icons': { Ionicons:'icon' },
    '@/hooks/useLanguage': { useLanguage(){} }, '@/lib/i18n': { t:key=>key },
    'expo-camera': { Camera:{},CameraView:'camera' },
    'react-native-svg': { __esModule:true, default:'svg',Defs:'defs',LinearGradient:'gradient',Rect:'rect',Stop:'stop' },
    './scanner-styles': options.scannerStyles || { scannerStyles:{}, scannerDarkStyles:{} }, './scanner-sheet': { ScannerSheet:'sheet' },
    './scanner-success-background': { ScannerShade:'shade', ScannerSuccessBackground:'scan-background' },
    '@/lib/camera-capabilities': { hasBackCameraTorch:async()=>state.torch },
    '@/lib/scanner-permission': { scannerPermission:async(_,request)=>{calls.push(request?'permission-request':'permission-read');return {granted:state.granted,canAskAgain:true};} },
    'expo-clipboard': { getStringAsync:async()=>{calls.push('clipboard');return state.clipboard?state.clipboard():'';} },
    'expo-haptics': { ImpactFeedbackStyle:{Light:'light'},impactAsync:async()=>{calls.push('haptic');if(state.hapticFails)throw Error('haptics');} },
    '@/lib/payment-recognition': { recognizePayment:async value=>{ calls.push(['validate',value]);return state.validate?state.validate(value):{input:value,kind:'lightning',recipient:'synthetic-hash',amount:'20',unit:'SAT'};} },
    '@/lib/payment-errors': { friendlyPaymentMessage:e=>e.message },
    '@/lib/wallet-session': { walletSession:{capture:()=>{const check=()=>{if(state.locked)throw Error('locked');};check();return check;}} },
  }), exports=>exports.PaymentScanner({onDetected:value=>{if(state.handoffFails)throw Error('handoff unavailable');calls.push(['detected',value]);},onCancel:()=>calls.push('cancel')}));
  return {...app,calls,state,background:value=>appState(value),back:()=>back()};
}
const detected = app=>app.calls.filter(c=>Array.isArray(c)&&c[0]==='detected');
const validations = app=>app.calls.filter(c=>Array.isArray(c)&&c[0]==='validate');

test('valid QR codes with or without an amount advance once without an intermediate button', async t=>{
 for(const amount of [null,'20']) {
 const app=fixture({validate:async input=>({input,kind:'lightning',recipient:'synthetic',amount,unit:'SAT'})});t.after(app.unmount);let tree=await app.settle();const camera=nodes(tree).find(n=>n.type==='camera');
 assert.deepEqual(app.calls,['permission-read']);camera.props.onBarcodeScanned({data:'invoice'});camera.props.onBarcodeScanned({data:'duplicate'});
 tree=await app.settle();assert.equal(validations(app).length,1);assert.equal(detected(app).length,1);assert.equal(app.calls.filter(c=>c==='haptic').length,1);
 assert.equal(nodes(tree).some(n=>n.type==='camera'),false);
 assert.equal(nodes(tree).some(n=>n.type==='scan-background'),true);
 assert.equal(button(tree,'Review payment'),undefined);
 camera.props.onBarcodeScanned({data:'late-duplicate'});await app.settle();assert.deepEqual(detected(app),[['detected','invoice']]);
 }
});
test('permission denial retains manual entry and paste without prompting again',async t=>{
 const app=fixture({granted:false});t.after(app.unmount);let tree=await app.settle();assert.equal(nodes(tree).some(n=>n.type==='camera'),false);
 button(tree,'Paste from clipboard').props.onPress();tree=await app.settle();assert.ok(nodes(tree).some(n=>n.props.children==='Your clipboard is empty.'));
 assert.equal(app.calls.includes('permission-request'),false);button(tree,'Enter address').props.onPress();tree=app.render();
 assert.ok(nodes(tree).find(n=>n.type==='sheet'&&n.props.title==='Enter address').props.visible);
});
test('invalid QR never shows recognized state or haptics and can be scanned again',async t=>{
 const app=fixture({validate:async()=>{throw Error('invalid-code');}});t.after(app.unmount);let tree=await app.settle();
 nodes(tree).find(n=>n.type==='camera').props.onBarcodeScanned({data:'bad'});tree=await app.settle();
 assert.equal(app.calls.includes('haptic'),false);assert.equal(detected(app).length,0);assert.ok(button(tree,'Scan again'));
 button(tree,'Scan again').props.onPress();tree=app.render();assert.equal(typeof nodes(tree).find(n=>n.type==='camera').props.onBarcodeScanned,'function');
});
test('blur, background, lock, unmount and manual entry reject late clipboard and validation results',async()=>{
 for(const phase of ['clipboard','validation'])for(const action of ['blur','background','lock','unmount','manual']){
  let resolve;const pending=new Promise(done=>{resolve=done;});
  const app=fixture(phase==='clipboard'?{clipboard:()=>pending}:{validate:()=>pending});let tree=await app.settle();
  if(phase==='clipboard')button(tree,'Paste from clipboard').props.onPress();else nodes(tree).find(n=>n.type==='camera').props.onBarcodeScanned({data:'late'});
  if(action==='blur'){app.state.focused=false;app.render();}if(action==='background'){app.background('background');app.render();}
  if(action==='lock')app.state.locked=true;if(action==='unmount')app.unmount();if(action==='manual')button(tree,'Enter address').props.onPress();
  resolve(phase==='clipboard'?'late':{input:'late',kind:'lightning',recipient:'hash',amount:'20',unit:'SAT'});tree=await app.settle();
  assert.equal(detected(app).length,0,phase+action);assert.equal(app.calls.includes('haptic'),false,phase+action);app.unmount();
 }
});
test('manual sheet validates input and advances directly into the payment flow',async t=>{
 const app=fixture();t.after(app.unmount);let tree=await app.settle();button(tree,'Enter address').props.onPress();tree=app.render();
 assert.equal(nodes(tree).some(n=>n.type==='camera'),false);nodes(tree).find(n=>n.type==='input').props.onChangeText('0.0.123');tree=app.render();
 button(tree,'Continue').props.onPress();tree=await app.settle();assert.equal(button(tree,'Review payment'),undefined);
 assert.deepEqual(detected(app),[['detected','0.0.123']]);
});

test('manual entry uses theme-aware fields while the camera overlay stays dark', async t => {
 require('./register-typescript.cjs');
 const theme = require('../lib/theme-styles.ts');
 const { colorModePreference } = require('../lib/color-mode.ts');
 await colorModePreference.initialize({ getItem: async () => 'dark', setItem: async () => {} });
 t.after(() => colorModePreference.setMode('dark'));
 const styleModule = hookFixture('components/send/scanner-styles.ts', () => ({
  'react-native': { StyleSheet: { create: value => value } }, '@/lib/theme-styles': theme,
 }), exports => exports);
 const scannerStyles = styleModule.render();
 for (const mode of ['light', 'dark']) {
  await colorModePreference.setMode(mode);
  const app = fixture({ scannerStyles }); t.after(app.unmount);
  let tree = await app.settle();
  const cameraTitle = nodes(tree).find(node => node.type === 'text' && node.props.children === 'Paste');
  assert.ok(cameraTitle.props.style.some(style => style?.color === '#f7f7f7'));
  button(tree, 'Enter address').props.onPress(); tree = app.render();
  const input = nodes(tree).find(node => node.type === 'input');
  assert.equal(input.props.style.backgroundColor, mode === 'light' ? theme.themePalette.light.raised : '#202023');
  assert.equal(input.props.style.color, mode === 'light' ? theme.themePalette.light.text : '#f8f8fa');
  assert.equal(nodes(tree).find(node => node.props.nativeID === 'scannerRecipientLabel').props.style.color,
   mode === 'light' ? theme.themePalette.light.secondary : '#c3c3ca');
 }
});
test('camera runs continuously until capture and restarts after cancelled validation or manual entry',async t=>{
 let finish;const app=fixture({validate:()=>new Promise(resolve=>{finish=resolve;})});t.after(app.unmount);
 let tree=await app.settle();const camera=nodes(tree).find(n=>n.type==='camera');
 assert.deepEqual(camera.props.barcodeScannerSettings,{barcodeTypes:['qr']});
 assert.equal(camera.props.onCameraReady,undefined);
 button(tree,'Turn light on').props.onPress();tree=app.render();
 assert.equal(typeof nodes(tree).find(n=>n.type==='camera').props.onBarcodeScanned,'function');
 camera.props.onBarcodeScanned({data:'xyz_user@walletofsatoshi.com'});tree=app.render();
 assert.equal(nodes(tree).some(n=>n.type==='camera'),false,'release camera while resolving address');
 camera.props.onBarcodeScanned({data:'duplicate'});assert.equal(validations(app).length,1);
 app.back();tree=app.render();assert.equal(typeof nodes(tree).find(n=>n.type==='camera').props.onBarcodeScanned,'function');
 finish({input:'old',kind:'lightning',recipient:'old',amount:null,unit:'SAT'});tree=await app.settle();
 assert.equal(app.calls.includes('haptic'),false,'cancelled recognition must not replace resumed scanner');
 button(tree,'Enter address').props.onPress();tree=app.render();assert.equal(nodes(tree).some(n=>n.type==='camera'),false);
 app.back();tree=app.render();assert.equal(typeof nodes(tree).find(n=>n.type==='camera').props.onBarcodeScanned,'function');
 assert.equal(detected(app).length,0);
});
test('Android back returns from manual input to scanning before closing',async t=>{
 const app=fixture();t.after(app.unmount);let tree=await app.settle();
 button(tree,'Enter address').props.onPress();app.render();app.back();tree=app.render();assert.equal(nodes(tree).find(n=>n.type==='sheet'&&n.props.title==='Enter address').props.visible,false);
 app.back();assert.equal(app.calls.includes('cancel'),true);assert.equal(detected(app).length,0);
});
test('torch is capability-gated, stops on background and does not resume automatically',async t=>{
 const app=fixture();t.after(app.unmount);let tree=await app.settle();button(tree,'Turn light on').props.onPress();tree=app.render();assert.equal(nodes(tree).find(n=>n.type==='camera').props.enableTorch,true);
 app.background('background');tree=app.render();assert.equal(nodes(tree).some(n=>n.type==='camera'),false);
 app.background('active');tree=await app.settle();assert.equal(nodes(tree).find(n=>n.type==='camera').props.enableTorch,false);
 const unsupported=fixture({torch:false});t.after(unsupported.unmount);assert.equal(button(await unsupported.settle(),'Turn light on'),undefined);
});
test('optional haptic failure does not prevent automatic handoff',async t=>{
 const app=fixture({hapticFails:true});t.after(app.unmount);let tree=await app.settle();nodes(tree).find(n=>n.type==='camera').props.onBarcodeScanned({data:'one'});
 tree=await app.settle();assert.equal(button(tree,'Review payment'),undefined);assert.deepEqual(detected(app),[['detected','one']]);
});
test('failed automatic handoff shows an error and allows scanning again',async t=>{
 const app=fixture({handoffFails:true});t.after(app.unmount);let tree=await app.settle();
 nodes(tree).find(n=>n.type==='camera').props.onBarcodeScanned({data:'one'});tree=await app.settle();
 assert.equal(nodes(tree).some(n=>n.type==='scan-background'),false);assert.equal(detected(app).length,0);
 button(tree,'Scan again').props.onPress();app.state.handoffFails=false;tree=app.render();
 nodes(tree).find(n=>n.type==='camera').props.onBarcodeScanned({data:'two'});await app.settle();assert.deepEqual(detected(app),[['detected','two']]);
});
test('camera failure keeps entry choices reachable',async t=>{
 const app=fixture();t.after(app.unmount);let tree=await app.settle();nodes(tree).find(n=>n.type==='camera').props.onMountError();tree=app.render();
 assert.ok(button(tree,'Enter address'));assert.ok(button(tree,'Paste from clipboard'));assert.ok(button(tree,'Try again'));
});
