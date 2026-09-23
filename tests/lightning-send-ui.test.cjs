'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hookFixture } = require('./react-hooks-fixture.cjs');
require('./register-typescript.cjs');
class PendingError extends Error {}
class FeeError extends Error {}
function fixture(options = {}) {
  const calls = [];
  const params = { focused: true, scanResultKey: 'scan-1', ...options };
  const auth = { walletReady: true, sparkWallet: options.wallet || null,
    hederaAccount: { accountId: '0.0.456', balanceTinybars: 1000000000n } };
  let localInput;let scanCounter=0;
  const app = hookFixture('app/(tabs)/send.tsx', hooks => ({
    'react-native': { Alert: { alert: () => calls.push('alert') }, AppState: { addEventListener: () => ({ remove() {} }) }, BackHandler: { addEventListener: () => ({ remove() {} }) } },
    '@/hooks/useScannerTabBar': { useScannerTabBar() {} },
    '@/lib/i18n': { t: key => key }, '@/hooks/useLanguage': { useLanguage() {} },
    'expo-router': { useRouter: () => ({}), useLocalSearchParams: () => params,
      useFocusEffect: fn => hooks.useEffect(() => params.focused ? fn() : undefined, [fn, params.focused]) },
    'expo-linking': { addEventListener: () => ({ remove() {} }) },
    '@/hooks/useWalletAuth': { useWalletAuth: () => auth },
    '@/hooks/useExchangeRates': { useExchangeRates: () => ({ btcToEur: 50000 }) },
    '@/hooks/useWalletBalances': { useWalletBalances: () => ({ balances: {}, balanceStates: { spark: {}, hedera: {} } }) },
    '@/hooks/useBitcoinOperations': { useBitcoinOperations: () => ({ operations: [], refresh() {} }) },
    '@/lib/payment-scan': { paymentScanInbox: {
      save: value => { localInput = value; return `local-scan-${++scanCounter}`; },
      take: () => { calls.push('scan'); return localInput || 'synthetic-invoice'; },
    } },
    '@/lib/payment-input': require('../lib/payment-input.ts'),
    '@/lib/hedera/checkout': { parseHederaCheckoutRequest: () => null },
    '@/lib/hedera/payments': {
      parseHederaPaymentRequest: value => ({ accountId: value, amountTinybars: null }),
      parseHederaTransferTinybars: value => BigInt(Number(value) * 100000000),
      assertHederaPaymentBalance: () => calls.push('hbar-balance'), formatTinybars: value => String(Number(value) / 100000000),
    },
    '@/lib/bitcoin/destination': { parseBitcoinDestination: () => null },
    '@/lib/ocp-safe': { resolveOcpUrl: async () => null },
    '@/lib/lightning-destination': { resolveLightningDestination: async (input,amount) => { calls.push('resolve'); return options.resolve ? options.resolve(input,amount) : { kind: 'invoice', invoice: 'synthetic-invoice', amountSats: 20 }; } },
    '@/lib/payments': { prepareSparkPayment: async () => { calls.push('prepare'); return options.prepare ? options.prepare() : { invoice: {}, amountSats: 20, maxFeeSats: 2 }; },
      authorizeAndPayPreparedSparkPayment:async(_wallet,_payment,authorize,_lifecycle,assertCurrent)=>{
        assertCurrent(); const assertAuthorized=await authorize(); assertCurrent(); assertAuthorized();
        calls.push('submit');return options.submit ? options.submit() : {amountSats:20,reference:'synthetic-proof'};
      },
      LightningPaymentPendingError:PendingError,LightningFeeChangedError:FeeError },
    '@/lib/payment-authorization':{authorizePayment:async()=>{calls.push('authorize');return options.authorize ? options.authorize() : ()=>{};}},
    '@/lib/send-timing':{beginSendTiming:()=>()=>{}},
    '@/lib/wallet-session':{walletSession:{
      capture:()=>()=>{if(options.locked)throw Error('Wallet locked');},
      captureRuntime:()=>()=>{if(options.locked)throw Error('Wallet locked');},
    }},
    '@/lib/payment-errors':{friendlyPaymentMessage:()=> 'Payment unavailable'},
    '@/lib/optional-haptics':{notifyPaymentHaptics:async()=>{}},'expo-haptics':{NotificationFeedbackType:{Success:'success',Error:'error'}},
    '@/lib/lightning/reconcile-native': { reconcileLightningPayments: async () => [] },
    '@/lib/lightning/payment-journal-native': { lightningPaymentJournal: { list: async () => [] } },
    '@/components/send/payment-form': { PaymentForm: 'form' },
    '@/components/send/payment-scanner': { PaymentScanner: 'scanner' },
    '@/components/send/hedera-payment-views': { HederaReviewView: 'hbar-review' },
    '@/components/send/lightning-payment-views': { LightningReviewView: 'review', LightningSuccessView: 'success' },
    '@/components/bitcoin/payment-progress':{BitcoinPaymentProgress:'progress'},
    '@/components/bitcoin/payment-ui':{BitcoinReviewLoading:'review-loading'},
  }), exports => exports.default());
  return { ...app, params, auth, calls };
}
test('a scan made before Spark is ready survives initialization and prepares exactly once', async t => {
  const app = fixture(); t.after(app.unmount);
  app.render(); assert.equal((await app.settle()).type, 'review-loading');
  assert.deepEqual(app.calls, ['scan']);
  app.auth.sparkWallet = {}; assert.equal((await app.settle()).type, 'review');
  assert.deepEqual(app.calls, ['scan', 'resolve', 'prepare']);
  await app.settle(); assert.deepEqual(app.calls, ['scan', 'resolve', 'prepare']);
});
test('a preparation completing after leaving Send cannot restore an obsolete payment review', async t => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const app = fixture({ wallet: {}, prepare: () => pending }); t.after(app.unmount);
  app.render(); await app.settle(); app.params.focused = false; app.render();
  resolve({ invoice: {}, amountSats: 20, maxFeeSats: 2 });
  assert.equal((await app.settle()).type, 'scanner');
  app.params.focused = true; assert.equal((await app.settle()).type, 'scanner');
  assert.equal(app.calls.includes('alert'), false);
});

test('Send starts with the scanner; returning from amount entry and tab changes discard preparation', async t => {
  const app = fixture({ scanResultKey: undefined, wallet: {} }); t.after(app.unmount);
  let tree = await app.settle(); assert.equal(tree.type, 'scanner'); assert.deepEqual(app.calls, []);
  tree.props.onDetected('0.0.123'); tree = await app.settle(); assert.equal(tree.type, 'form');
  tree.props.onScan(); tree = await app.settle(); assert.equal(tree.type, 'scanner');
  tree.props.onDetected('0.0.123'); await app.settle(); app.params.focused = false; app.render();
  app.params.focused = true; assert.equal((await app.settle()).type, 'scanner');
});

test('inline scanner and clipboard intake prepare one Lightning review, never submit', async t => {
  const app = fixture({ scanResultKey: undefined, wallet: {} }); t.after(app.unmount);
  const scanner = await app.settle(); scanner.props.onDetected('synthetic-invoice');
  assert.equal((await app.settle()).type, 'review');
  assert.deepEqual(app.calls, ['scan', 'resolve', 'prepare']);
  await app.settle(); assert.deepEqual(app.calls, ['scan', 'resolve', 'prepare']);
});

test('amountless Lightning scan opens amount entry; one Continue prepares review without sending', async t => {
  const app = fixture({scanResultKey:undefined,wallet:{},resolve:async (_,amount)=> amount
    ? {kind:'invoice',invoice:'synthetic-invoice',amountSats:amount}
    : {kind:'amount-required',limits:{minSats:1,maxSats:100000,recipient:'wallet.example'}}});
  t.after(app.unmount);let tree=await app.settle();assert.equal(tree.type,'scanner');
  tree.props.onDetected('recipient@wallet.example');tree=await app.settle();
  assert.equal(tree.type,'form');assert.equal(tree.props.amountRequirement.recipient,'wallet.example');
  assert.equal(app.calls.includes('prepare'),false);
  tree.props.onAmountChange('20');tree=app.render();tree.props.onReview();tree=await app.settle();
  assert.equal(tree.type,'review');assert.equal(app.calls.filter(call=>call==='prepare').length,1);
  assert.equal(typeof tree.props.onConfirm,'function');
});

test('fixed-amount scans show review loading immediately and never amount entry while resolving fees',async t=>{
 for(const inline of [true,false]){
  let resolveRequest,resolveFee;
  const request=new Promise(resolve=>{resolveRequest=resolve;});const fee=new Promise(resolve=>{resolveFee=resolve;});
  const app=fixture({scanResultKey:inline?undefined:'scan-1',wallet:{},resolve:()=>request,prepare:()=>fee});t.after(app.unmount);
  if(inline)(await app.settle()).props.onDetected('fixed-invoice');
  assert.equal(app.render().type,'review-loading');assert.equal((await app.settle()).type,'review-loading');
  resolveRequest({kind:'invoice',invoice:'fixed-invoice',amountSats:20});let tree=await app.settle();
  assert.equal(tree.type,'review-loading');assert.equal(tree.props.amountSats,20);assert.equal(app.calls.includes('submit'),false);
  resolveFee({invoice:{},amountSats:20,maxFeeSats:2});tree=await app.settle();assert.equal(tree.type,'review');assert.equal(tree.props.payment.amountSats,20);
 }
});

test('amount entry appears only after the destination confirms an amount is missing',async t=>{
 let resolveRequest;const request=new Promise(resolve=>{resolveRequest=resolve;});
 const app=fixture({scanResultKey:undefined,wallet:{},resolve:()=>request});t.after(app.unmount);
 (await app.settle()).props.onDetected('recipient@wallet.example');assert.equal(app.render().type,'review-loading');
 resolveRequest({kind:'amount-required',limits:{minSats:1,maxSats:100000}});const tree=await app.settle();
 assert.equal(tree.type,'form');assert.equal(tree.props.amountRequirement.minSats,1);assert.equal(app.calls.includes('prepare'),false);
});

test('cancelled fee lookups cannot overwrite or unblock a newer scan preparation',async t=>{
 let firstDone,secondDone,index=0;const first=new Promise(resolve=>{firstDone=resolve;});const second=new Promise(resolve=>{secondDone=resolve;});
 const app=fixture({scanResultKey:undefined,wallet:{},prepare:()=>++index===1?first:second,
  resolve:async input=>({kind:'invoice',invoice:input,amountSats:input==='first'?20:30})});t.after(app.unmount);
 (await app.settle()).props.onDetected('first');let tree=await app.settle();assert.equal(tree.type,'review-loading');
 tree.props.onCancel();tree=await app.settle();assert.equal(tree.type,'scanner');tree.props.onDetected('second');
 tree=await app.settle();assert.equal(tree.type,'review-loading');assert.equal(index,2);
 firstDone({invoice:{},amountSats:20,maxFeeSats:2});tree=await app.settle();assert.equal(tree.type,'review-loading');assert.equal(tree.props.amountSats,30);
 secondDone({invoice:{},amountSats:30,maxFeeSats:2});tree=await app.settle();assert.equal(tree.type,'review');assert.equal(tree.props.payment.amountSats,30);
});

test('cancelling Lightning review discards the request and returns to scanner',async t=>{
 const app=fixture({wallet:{}});t.after(app.unmount);let tree=await app.settle();assert.equal(tree.type,'review');
 tree.props.onCancel();tree=await app.settle();assert.equal(tree.type,'scanner');
 assert.equal(app.calls.filter(call=>call==='prepare').length,1);
});

test('Send immediately shows progress, waits for authorization and proof, and ignores double taps',async t=>{
 let authorize,complete;
 const approval=new Promise(resolve=>{authorize=resolve;});const payment=new Promise(resolve=>{complete=resolve;});
 const app=fixture({wallet:{},authorize:()=>approval,submit:()=>payment});t.after(app.unmount);
 const review=await app.settle();review.props.onConfirm();review.props.onConfirm();
 let tree=app.render();assert.equal(tree.type,'progress');assert.equal(tree.props.phase,'authorizing');
 assert.equal(app.calls.filter(c=>c==='authorize').length,1);assert.equal(app.calls.includes('submit'),false);
 review.props.onCancel();assert.equal(app.render().type,'progress');
 authorize(()=>{});tree=await app.settle();assert.equal(tree.type,'progress');assert.equal(tree.props.phase,'sending');assert.equal(tree.props.amountSats,20);
 assert.equal(app.calls.filter(c=>c==='submit').length,1);
 complete({amountSats:20,reference:'synthetic-proof'});tree=await app.settle();assert.equal(tree.type,'success');assert.equal(tree.props.reference,'synthetic-proof');
});

test('cancelled device authorization returns to review and never submits or shows success',async t=>{
 const app=fixture({wallet:{},authorize:async()=>{throw Error('cancelled');}});t.after(app.unmount);
 const review=await app.settle();review.props.onConfirm();const tree=await app.settle();
 assert.equal(tree.type,'review');assert.equal(tree.props.loading,false);assert.equal(app.calls.includes('submit'),false);assert.equal(app.calls.includes('alert'),true);
});

test('a locked wallet cannot start parallel send preparation or the PIN prompt',async t=>{
 const app=fixture({wallet:{},locked:true});t.after(app.unmount);
 (await app.settle()).props.onConfirm();const tree=await app.settle();
 assert.equal(tree.type,'review');assert.equal(app.calls.includes('authorize'),false);assert.equal(app.calls.includes('submit'),false);
});

test('unresolved or failed submission stops progress without claiming success',async t=>{
 for(const error of [new PendingError('unknown'),new Error('failed'),new FeeError('fee changed')]){
  const app=fixture({wallet:{},submit:async()=>{throw error;}});t.after(app.unmount);
  (await app.settle()).props.onConfirm();const tree=await app.settle();
  assert.notEqual(tree.type,'success');assert.notEqual(tree.type,'progress');assert.equal(tree.props.loading,false);
  assert.equal(app.calls.filter(c=>c==='submit').length,1);assert.equal(app.calls.includes('alert'),true);
 }
});

test('a payment completing after leaving Send cannot restore an obsolete result screen',async t=>{
 let complete;const payment=new Promise(resolve=>{complete=resolve;});
 const app=fixture({wallet:{},submit:()=>payment});t.after(app.unmount);
 (await app.settle()).props.onConfirm();assert.equal((await app.settle()).type,'progress');
 app.params.focused=false;app.render();complete({amountSats:20,reference:'synthetic-proof'});
 await app.settle();app.params.focused=true;assert.equal((await app.settle()).type,'scanner');
});

test('a manually entered HBAR address selects HBAR, asks for an amount, then opens its review', async t => {
  const app = fixture({ scanResultKey: undefined, wallet: {} }); t.after(app.unmount);
  app.params.manualEntryKey = 'manual'; let tree = await app.settle();
  tree.props.onDestinationChange('0.0.123'); tree = app.render();
  await tree.props.onReview(); tree = await app.settle();
  assert.equal(tree.type, 'form'); assert.equal(tree.props.source, 'hedera'); assert.deepEqual(app.calls, []);
  tree.props.onAmountChange('2'); tree = app.render(); await tree.props.onReview();
  tree = await app.settle(); assert.equal(tree.type, 'hbar-review');
  assert.equal(tree.props.payment.amountTinybars, 200000000n);
  assert.deepEqual(app.calls, ['hbar-balance']);
});

test('detecting a different asset never reuses an amount from the previous payment unit', async t => {
  const app = fixture({ scanResultKey: undefined, wallet: {} }); t.after(app.unmount);
  app.params.manualEntryKey = 'manual'; let tree = await app.settle();
  tree.props.onAmountChange('50'); tree.props.onCurrencyChange('EUR'); tree = app.render();
  tree.props.onDestinationChange('0.0.123'); tree = app.render(); await tree.props.onReview();
  tree = await app.settle(); assert.equal(tree.type, 'form'); assert.equal(tree.props.source, 'hedera');
  assert.equal(tree.props.amountInput, ''); assert.deepEqual(app.calls, []);
});
