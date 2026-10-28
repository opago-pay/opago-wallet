import { onchainErrorMessage } from '@/lib/onchain/errors';
import { useEffect,useRef,useState } from 'react';
import { Text,View } from 'react-native';
import { useLocalSearchParams,useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useOnchainBalance } from '@/hooks/useOnchainBalance';
import { useLanguage } from '@/hooks/useLanguage';
import { BitcoinSendScreen } from '@/components/bitcoin/send-sheet';
import { BitcoinButton,BitcoinMoney,bitcoinStyles as styles } from '@/components/bitcoin/payment-ui';
import { TextInput } from '@/components/ui/wallet-interaction';
import { appLocale,t } from '@/lib/i18n';
import { walletSession } from '@/lib/wallet-session';
import { authorizePayment } from '@/lib/payment-authorization';
import { sats } from '@/lib/onchain/policy';
import { onchainJournal } from '@/lib/onchain/journal-native';
import { importLegacyDeposit,prepareMove,submitMove,reconcileMoves,prepareMoveClaim,submitMoveClaim,type MoveQuote } from '@/lib/onchain/transfers';
import { prepareMoveRefund,submitMoveRefund } from '@/lib/onchain/refund-native';
import type { RefundPlan } from '@/lib/onchain/refund';
import type { BitcoinDepositQuote } from '@/lib/bitcoin/deposits';
import type { OnchainOperation } from '@/lib/onchain/types';

export default function ExchangeFlow(){
  useLanguage();const router=useRouter();
  const {account,id,deposit}=useLocalSearchParams<{account?:string;id?:string;deposit?:string}>();
  const {onchainWallet:wallet,sparkWallet:spark,onchainError,sparkError}=useWalletAuth();
  const balance=useOnchainBalance();
  const [direction,setDirection]=useState<MoveQuote['direction']>(account==='bitcoin_spark'?'from_lightning':'to_lightning');
  const [amount,setAmount]=useState('');
  const [quote,setQuote]=useState<MoveQuote|null>(null);
  const [operation,setOperation]=useState<OnchainOperation|null>(null);
  const [claim,setClaim]=useState<BitcoinDepositQuote|null>(null);
  const [refund,setRefund]=useState<RefundPlan|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  const active=useRef(true);const running=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[wallet,spark]);
  const current=()=>{if(!active.current)throw new Error('Transfer screen closed.');};
  const close=()=>router.canGoBack()?router.back():router.replace('/(tabs)');
  const run=async(work:()=>Promise<void>)=>{
    if(running.current)return;running.current=true;setBusy(true);setError(null);
    try{await work();}catch(cause){if(active.current)setError(onchainErrorMessage(cause));}
    finally{running.current=false;if(active.current)setBusy(false);}
  };
  useEffect(()=>{
    if(!wallet||!id&&!deposit||deposit&&!spark)return;let cancelled=false;
    const guard=walletSession.captureRuntime();
    const load=deposit?importLegacyDeposit(wallet,spark!,deposit,()=>{guard();if(cancelled)throw new Error('Screen closed.');}).then(row=>[row]):onchainJournal().list(wallet.scope);
    void load.then(rows=>{
      if(!cancelled){const row=rows.find(item=>deposit?item.sparkOperationId===deposit:item.id===id);if(row){setOperation(row);setDirection(row.kind==='from_lightning'?'from_lightning':'to_lightning');}else setError('Transfer could not be loaded.');}
    }).catch(()=>{if(!cancelled)setError('Transfer could not be loaded.');});
    return()=>{cancelled=true;};
  },[wallet,spark,id,deposit]);
  const operationId=operation?.id;
  useEffect(()=>{
    if(!wallet||!spark||!operationId)return;
    let cancelled=false;
    const refresh=async()=>{
      try{
        const guard=walletSession.captureRuntime();
        const rows=await reconcileMoves(wallet,spark,()=>{guard();if(cancelled)throw new Error('Screen closed.');});
        const row=rows.find(item=>item.id===operationId);
        if(row&&!cancelled)setOperation(row);
      }catch{/* Keep the durable operation visible while its providers are offline. */}
    };
    void refresh();const timer=setInterval(()=>void refresh(),15_000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[wallet,spark,operationId]);
  const prepare=()=>run(async()=>{
    if(!wallet||!spark)throw new Error(onchainError||sparkError||'Both Bitcoin balances must be available.');
    if(!/^\d+$/.test(amount)||!sats(Number(amount)))throw new Error('Enter a positive amount.');
    // Spark's withdrawal quote can sign a leaf swap. Authorize only after this explicit action.
    const guard=direction==='from_lightning'?await authorizePayment():walletSession.capture();
    const prepared=await prepareMove(wallet,spark,direction,Number(amount),()=>{guard();current();});current();setQuote(prepared);
  });
  const confirm=()=>run(async()=>{
    if(!wallet||!spark||!quote)return;
    const auth=await authorizePayment();const guard=()=>{auth();current();};guard();
    try{const saved=await submitMove(wallet,spark,quote,guard);current();setOperation(saved);setQuote(null);}
    catch(cause){
      const rows=await onchainJournal().list(wallet.scope);current();
      const saved=rows.find(row=>quote.direction==='to_lightning'?row.txid===quote.onchain.txid:row.sparkOperationId==='withdraw:'+quote.spark.quoteId);
      if(saved){setOperation(saved);setQuote(null);}throw cause;
    }
  });
  const stage=operation?.transferStage;
  const status=operation?.state==='aborted'?'Canceled':operation?.state==='prepared'?'Payment not sent':stage==='completed'?'Completed':stage==='refunded'?'Returned to on-chain':stage==='claim_required'?'Lightning fee approval required':
    stage==='claim_checking'?'Checking Lightning credit':stage==='refund_checking'?'Checking refund':'Bitcoin confirmation pending';
  const amounts=quote?(quote.direction==='to_lightning'?quote.onchain:quote.spark):null;
  return <BitcoinSendScreen title={t('Move Bitcoin')} loading={busy} onBack={close} footer={<>
    {!operation&&<BitcoinButton label={t(quote?'Confirm transfer':'Check amount and fees')} loading={busy} disabled={!wallet||!spark||!!(id||deposit)&&!operation} onPress={()=>void(quote?confirm():prepare())}/>}
    <BitcoinButton label={t(quote?'Back':'Close')} secondary disabled={busy} onPress={()=>quote?setQuote(null):close()}/>
  </>}>
    <Text style={[styles.value,{marginBottom:16}]}>{operation?.kind==='refund'?t('Previous Lightning deposits'):direction==='to_lightning'?'Bitcoin → Lightning':'Lightning → Bitcoin'}</Text>
    {!operation&&!quote&&!id&&!deposit&&<>
      <Text style={styles.note}>{t('Move Bitcoin between your balances. Fees apply.')}</Text>
      <BitcoinButton label={t('Change direction')} secondary disabled={busy} onPress={()=>{setDirection(direction==='to_lightning'?'from_lightning':'to_lightning');setAmount('');setQuote(null);setClaim(null);setRefund(null);setError(null);}}/>
      <Text style={styles.value}>{t(direction==='to_lightning'?'Deposit for Lightning':'Receive on-chain')} · SAT</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="number-pad" editable={!busy} accessibilityLabel={t('Amount')+' SAT'}/>
      {direction==='to_lightning'&&<Text style={styles.note}>{t('Available: {amount} SAT',{amount:balance.state.value?.availableSats.toLocaleString(appLocale())??'—'})}</Text>}
      {direction==='to_lightning'&&balance.state.value?.availableSats===0&&<BitcoinButton label={t('Receive Bitcoin')} secondary onPress={()=>router.push({pathname:'/receive-flow',params:{account:'bitcoin_onchain'}})}/>}
    </>}
    {amounts&&<View style={[styles.box,{gap:14}]}>
      <BitcoinMoney amount={amounts.amountSats} hero/>
      <Text style={styles.value}>{t('Network fee')}: {quote?.direction==='from_lightning'?quote.spark.networkFeeSats:amounts.feeSats} SAT</Text>
      {quote?.direction==='from_lightning'&&<Text style={styles.value}>{t('Service fee')}: {quote.spark.serviceFeeSats} SAT</Text>}
      <Text style={styles.value}>{t(quote?.direction==='from_lightning'?'Maximum total':'Total deducted')}: {amounts.totalSats.toLocaleString(appLocale())} SAT</Text>
      {quote?.direction==='to_lightning'&&<Text style={styles.warning}>{t('After Bitcoin confirmation, you review the fee for your Lightning balance. The final Lightning credit is not yet known.')}</Text>}
      <Text style={styles.note}>{t('Your receiving address')}</Text><Text selectable style={styles.address}>{amounts.address}</Text>
    </View>}
    {operation&&<>
      <Text style={styles.value} accessibilityLiveRegion="polite">{t(status)}</Text>
      <BitcoinMoney amount={operation.amountSats}/>
      <Text style={styles.note}>{t('Your transaction is saved. Closing this screen does not cancel it.')}</Text>
      {!!operation.txid&&<Text selectable style={styles.address}>{operation.txid}</Text>}
      {operation.feeSats!==null&&<Text style={styles.note}>{t(operation.kind==='from_lightning'&&operation.actualFeeSats===undefined?'Fee, at most':'Network and service fees')}: {operation.actualFeeSats??operation.feeSats} SAT</Text>}
      {operation.claimFeeSats!==undefined&&operation.claimFeeSats!==null&&<Text style={styles.note}>{t('Lightning claim fee')}: {operation.claimFeeSats} SAT</Text>}
      {operation.rawTransaction&&operation.state==='broadcast_pending'&&<BitcoinButton label={t('Check and resend saved transaction')} loading={busy} onPress={()=>void run(async()=>{
        if(!wallet)return;await wallet.sync();current();const guard=walletSession.capture();
        setOperation(await wallet.rebroadcast(operation,()=>{guard();current();}));
      })}/>}
      {operation.kind!=='refund'&&operation.state==='prepared'&&!operation.rawTransaction&&<BitcoinButton label={t('Cancel preparation')} secondary disabled={busy} onPress={()=>void run(async()=>{
        walletSession.capture()();const saved=await onchainJournal().update(operation.scope,operation.id,{state:'aborted'});current();setOperation(saved);
      })}/>}
      {stage==='claim_required'&&!claim&&!refund&&<>
        <BitcoinButton label={t('Review Lightning fee')} loading={busy} onPress={()=>void run(async()=>{
          if(!wallet||!spark)return;const guard=walletSession.capture();setClaim(await prepareMoveClaim(wallet,spark,operation,()=>{guard();current();}));
        })}/>
        <BitcoinButton label={t('Return to on-chain')} secondary disabled={busy} onPress={()=>void run(async()=>{
          if(!wallet||!spark)return;const guard=walletSession.capture();setRefund(await prepareMoveRefund(wallet,spark,operation,()=>{guard();current();}));
        })}/>
      </>}
      {claim&&<View style={styles.box}>
        <Text style={styles.value}>{t('Deposit')}: {claim.grossSats} SAT</Text>
        <Text style={styles.value}>{t('Lightning claim fee')}: {claim.feeSats} SAT</Text>
        <Text style={styles.value}>{t('Lightning receives')}: {claim.creditSats} SAT</Text>
        <BitcoinButton label={t('Confirm Lightning credit')} loading={busy} onPress={()=>void run(async()=>{
          if(!wallet||!spark)return;const guard=await authorizePayment();
          await submitMoveClaim(wallet,spark,operation,claim,()=>{guard();current();});current();setClaim(null);
          setOperation({...operation,transferStage:'claim_checking'});
        })}/>
        <BitcoinButton label={t('Continue later')} secondary disabled={busy} onPress={()=>setClaim(null)}/>
      </View>}
      {refund&&<View style={styles.box}>
        <Text style={styles.value}>{t('Network fee')}: {refund.feeSats} SAT</Text>
        <Text style={styles.value}>{t('Receive on-chain')}: {refund.amountSats} SAT</Text>
        <Text style={styles.note}>{t('The original Bitcoin fee has already been paid. This return has an additional network fee.')}</Text>
        <Text selectable style={styles.address}>{refund.address}</Text>
        <BitcoinButton label={t('Confirm return')} loading={busy} onPress={()=>void run(async()=>{
          if(!wallet||!spark)return;const guard=await authorizePayment();
          const saved=await submitMoveRefund(wallet,spark,operation,refund,()=>{guard();current();});current();setOperation(saved);setRefund(null);
        })}/>
        <BitcoinButton label={t('Continue later')} secondary disabled={busy} onPress={()=>setRefund(null)}/>
      </View>}
      {stage==='refund_checking'&&operation.refund&&<BitcoinButton label={t('Resume saved refund')} loading={busy} onPress={()=>void run(async()=>{
        if(!wallet||!spark)return;const guard=await authorizePayment();
        setOperation(await submitMoveRefund(wallet,spark,operation,operation.refund!,()=>{guard();current();}));
      })}/>}
    </>}
    {(!wallet||!spark)&&<Text style={styles.warning}>{t(onchainError||sparkError||'Both Bitcoin balances must be available.')}</Text>}
    {!!error&&<Text style={styles.warning} accessibilityLiveRegion="polite">{t(error)}</Text>}
  </BitcoinSendScreen>;
}
