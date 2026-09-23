'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hookFixture } = require('./react-hooks-fixture.cjs');
function fixture(options = {}) {
  const calls = [];
  let locked = false;
  const app = hookFixture('app/(tabs)/send.tsx', hooks => ({
    'react-native': { Alert: { alert: () => calls.push('alert') }, AppState: { addEventListener: () => ({remove(){}}) }, BackHandler: { addEventListener: () => ({remove(){}}) } },
    '@/hooks/useScannerTabBar': { useScannerTabBar() {} },
    '@/lib/i18n': { t: key => key }, '@/hooks/useLanguage': { useLanguage() {} },
    'expo-router': { useRouter: () => ({}), useLocalSearchParams: () => ({ scanResultKey: 'synthetic-scan' }), useFocusEffect: fn => hooks.useEffect(fn, [fn]) },
    'expo-linking': { addEventListener: () => ({remove(){}}) },
    '@/hooks/useWalletAuth': { useWalletAuth: () => ({ walletReady: true, sparkWallet: {} }) },
    '@/hooks/useExchangeRates': { useExchangeRates: () => ({ btcToEur: 50000, updatedAt: Date.now() }) },
    '@/hooks/useWalletBalances': { useWalletBalances: () => ({ balances: {}, balanceStates: { spark: {}, hedera: {} } }) },
    '@/hooks/useBitcoinOperations': { useBitcoinOperations: () => ({ operations: [], refresh() {} }) },
    '@/lib/payment-scan': { paymentScanInbox: { take: () => 'synthetic-address' } },
    '@/lib/payment-input': { inferPaymentSourceFromRequest: () => 'spark', parsePaymentAmount: value => Number(value || 0) },
    '@/lib/bitcoin/destination': { parseBitcoinDestination: () => ({ asset: 'bitcoin', route: 'onchain', address: 'synthetic-address', amountSats: null }) },
    '@/lib/config': { appConfig: { sparkNetwork: 'REGTEST' } },
    '@/lib/bitcoin/onchain': { bitcoinScope: async () => 'synthetic-scope', prepareBitcoinWithdrawal: async (_,__,address,amount,authorize) => {
      authorize(); calls.push(['quote',address,amount]); return { address,amountSats:amount,feeSats:100 };
    }, submitBitcoinWithdrawal:async (_,__,payment,authorize)=>{authorize();calls.push('submit');return options.submit ? options.submit(payment) : {id:'synthetic',amountSats:payment.amountSats,state:'broadcast'};} },
    '@/lib/bitcoin/store-native': { bitcoinStore: { list: async () => [] } },
    '@/lib/payment-authorization': { authorizePayment: async () => { calls.push('authenticate'); return () => { if(locked) throw Error('locked'); }; } },
    '@/lib/lightning/reconcile-native': { reconcileLightningPayments: async () => [] },
    '@/lib/lightning/payment-journal-native': { lightningPaymentJournal: { list: async () => [] } },
    '@/lib/payment-errors': { friendlyPaymentMessage: () => 'Payment unavailable' },
    '@/lib/optional-haptics': { notifyPaymentHaptics: async () => {} }, 'expo-haptics': { NotificationFeedbackType: {Error:'error'} },
    '@/components/send/payment-form': { PaymentForm: 'form' },
    '@/components/bitcoin/payment-ui': { BitcoinReview: 'review', BitcoinReviewLoading:'review-loading' },
    '@/components/bitcoin/payment-progress':{BitcoinPaymentProgress:'progress'},
    '@/components/bitcoin/transfer-result':{BitcoinTransferResult:'onchain-result'},
  }), exports => exports.default());
  return { ...app, calls, lock() { locked=true; } };
}
test('onchain scan and input edits never quote/sign; explicit preparation authenticates the exact amount', async t => {
  const app=fixture();t.after(app.unmount);
  let tree=await app.settle(); assert.equal(tree.type,'form'); assert.deepEqual(app.calls,[]);
  tree.props.onAmountChange('1000');tree=app.render(); assert.deepEqual(app.calls,[]);
  await tree.props.onReview();tree=await app.settle();
  assert.equal(tree.type,'review');assert.deepEqual(app.calls,['authenticate',['quote','synthetic-address',1000]]);
});

test('onchain send shows progress, submits once, then preserves unconfirmed network status',async t=>{
 let finish;const sent=new Promise(resolve=>{finish=resolve;});
 const app=fixture({submit:()=>sent});t.after(app.unmount);
 let tree=await app.settle();tree.props.onAmountChange('1000');tree=app.render();await tree.props.onReview();
 tree=await app.settle();tree.props.onConfirm();tree.props.onConfirm();tree=await app.settle();
 assert.equal(tree.type,'progress');assert.equal(tree.props.phase,'sending');assert.equal(app.calls.filter(c=>c==='submit').length,1);
 finish({id:'synthetic',amountSats:1000,state:'broadcast'});tree=await app.settle();
 assert.equal(tree.type,'onchain-result');assert.equal(tree.props.operation.state,'broadcast');
});
test('a locked onchain preparation never reaches the signing SDK adapter', async t => {
  const app=fixture();t.after(app.unmount);let tree=await app.settle();
  tree.props.onAmountChange('1000');tree=app.render();app.lock();await tree.props.onReview();
  assert.equal((await app.settle()).type,'form');assert.deepEqual(app.calls,['authenticate','alert']);
});
test('wallet removal drains prior history writes and rejects stale writes waiting on initialization', async () => {
  let opened;const pending=new Promise(resolve=>{opened=resolve});const writes=[];
  const database={execAsync:async sql=>{if(sql==='DELETE FROM transactions')writes.push('wipe')},getAllAsync:async()=>[],runAsync:async()=>writes.push('insert')};
  const fixture=hookFixture('lib/database.ts',()=>({'expo-sqlite':{openDatabaseAsync:()=>pending}}),exports=>exports);
  const db=fixture.render();const stale=db.addTransaction('incoming',20,'SAT');const clear=db.wipeTransactions();opened(database);
  await Promise.all([stale,clear]);assert.deepEqual(writes,['wipe']);await db.addTransaction('incoming',30,'SAT');assert.deepEqual(writes,['wipe','insert']);
});
