import { onchainErrorMessage } from '@/lib/onchain/errors';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useOnchainBalance } from '@/hooks/useOnchainBalance';
import { useLanguage } from '@/hooks/useLanguage';
import { markFirstConfirmedPayment } from '@/lib/first-payment-feedback';
import { BitcoinSendScreen } from '@/components/bitcoin/send-sheet';
import { BitcoinButton, BitcoinMoney, bitcoinStyles as styles } from '@/components/bitcoin/payment-ui';
import { TextInput } from '@/components/ui/wallet-interaction';
import { appLocale, t } from '@/lib/i18n';
import { walletSession } from '@/lib/wallet-session';
import { authorizePayment } from '@/lib/payment-authorization';
import { btcToSats } from '@/lib/bitcoin/amount';
import { sats } from '@/lib/onchain/policy';
import { onchainJournal } from '@/lib/onchain/journal-native';
import type { OnchainOperation, OnchainQuote } from '@/lib/onchain/types';

export default function OnchainSendFlow() {
  useLanguage();
  const router=useRouter();
  const params=useLocalSearchParams<{address?:string;amountSats?:string;id?:string}>();
  const {onchainWallet:wallet,onchainError,retryOnchainConnection,hederaPublicKey}=useWalletAuth();
  const balance=useOnchainBalance();
  const [address,setAddress]=useState(typeof params.address==='string'?params.address:'');
  const [amount,setAmount]=useState(typeof params.amountSats==='string'?params.amountSats:'');
  const [unit,setUnit]=useState<'SAT'|'BTC'>('SAT');
  const [quote,setQuote]=useState<OnchainQuote|null>(null);
  const [operation,setOperation]=useState<OnchainOperation|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const active=useRef(true);const inFlight=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[wallet]);
  useEffect(()=>{
    if(!wallet||!params.id)return;let cancelled=false;
    void onchainJournal().list(wallet.scope).then(rows=>{
      const row=rows.find(item=>item.id===params.id&&item.kind==='send');
      if(!cancelled){if(row)setOperation(row);else setError('Payment could not be loaded.');}
    }).catch(()=>{if(!cancelled)setError('Payment could not be loaded.');});
    return()=>{cancelled=true;};
  },[wallet,params.id,balance.state.updatedAt]);
  // BDK confirms asynchronously; the user can still be on this stack screen.
  // Only a finalized external send counts, never an unconfirmed broadcast.
  useEffect(() => {
    if (operation?.kind !== 'send' || operation.state !== 'confirmed') return;
    void markFirstConfirmedPayment(hederaPublicKey, 'sent');
  }, [operation?.id, operation?.kind, operation?.state, hederaPublicKey]);
  const close=()=>router.canGoBack()?router.back():router.replace('/(tabs)');
  const current=()=>{if(!active.current)throw new Error('Payment screen closed.');};
  const run=async(work:()=>Promise<void>)=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError(null);
    try{await work();}catch(cause){if(active.current)setError(onchainErrorMessage(cause));}
    finally{inFlight.current=false;if(active.current)setBusy(false);}
  };
  const prepare=()=>run(async()=>{
    if(!wallet)throw new Error(onchainError||'Bitcoin wallet is unavailable.');
    const amountSats=unit==='BTC'?btcToSats(amount):/^\d+$/.test(amount)?sats(Number(amount)):0;
    if(!amountSats)throw new Error('Enter a positive amount.');
    const session=walletSession.capture();
    const prepared=await wallet.prepare(address.trim(),amountSats,()=>{session();current();});
    current();setQuote(prepared);
  });
  const send=()=>run(async()=>{
    if(!wallet||!quote)return;
    const authorization=await authorizePayment();
    const guard=()=>{authorization();current();};
    guard();
    try{
      const sent=await wallet.send(quote,guard);current();setOperation(sent);setQuote(null);void balance.refresh();
    }catch(cause){
      const saved=(await onchainJournal().list(wallet.scope)).find(row=>row.txid===quote.txid && row.state!=='aborted');
      current();
      if(saved){setOperation(saved);setQuote(null);}
      throw cause;
    }
  });
  const label=operation?operation.state==='confirmed'?'Completed':operation.state==='prepared'?'Payment not sent':'Bitcoin confirmation pending':quote?'Check this payment':'Send Bitcoin';
  return <BitcoinSendScreen title={t(label)} loading={busy} onBack={close} footer={<>
    {quote?<><BitcoinButton label={t('Confirm and send')} loading={busy} onPress={()=>void send()}/>
      <BitcoinButton label={t('Back')} secondary disabled={busy} onPress={()=>setQuote(null)}/></>:
    operation?<BitcoinButton label={t('Close')} secondary onPress={close}/>:
    <><BitcoinButton label={t('Check amount and fee')} loading={busy} disabled={!wallet||!!params.id&&!operation} onPress={()=>void prepare()}/>
      <BitcoinButton label={t('Close')} secondary disabled={busy} onPress={close}/></>}
  </>}>
    <Text style={styles.muted}>Bitcoin · {t('Onchain')} {wallet?.network!=='mainnet'?'· '+(wallet?.network??'').toUpperCase():''}</Text>
    {!operation&&!quote&&!params.id&&<>
      <Text style={[styles.note,{marginVertical:16}]}>{t('Available: {amount} SAT',{amount:balance.state.value?.availableSats.toLocaleString(appLocale())??'—'})}</Text>
      <Text style={styles.value}>{t('Recipient address')}</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} editable={!busy}
        accessibilityLabel={t('Recipient address')} placeholder="bc1…" />
      <Text style={styles.value}>{t('Amount')} · {unit}</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType={unit==='SAT'?'number-pad':'decimal-pad'} editable={!busy} accessibilityLabel={t('Amount')+' '+unit}/>
      <BitcoinButton label={unit==='SAT'?'BTC':'SAT'} secondary disabled={busy} onPress={()=>{setUnit(unit==='SAT'?'BTC':'SAT');setAmount('');}}/>
      <BitcoinButton label={t('Send from Lightning balance')} secondary disabled={busy} onPress={()=>router.replace({pathname:'/send-flow',params:{account:'bitcoin_spark',destination:address,amountSats:unit==='SAT'?amount:''}})}/>
    </>}
    {quote&&<View style={[styles.box,{marginTop:24,gap:16}]}>
      <BitcoinMoney amount={quote.amountSats} hero/>
      <Text selectable style={styles.address}>{quote.address}</Text>
      <Text style={styles.value}>{t('Network fee')}: {quote.feeSats.toLocaleString(appLocale())} SAT</Text>
      <Text style={styles.value}>{t('Total deducted')}: {quote.totalSats.toLocaleString(appLocale())} SAT</Text>
      <Text style={styles.note}>{t('Bitcoin network confirmation required.')}</Text>
      {quote.feeSats>quote.amountSats/10&&<Text style={styles.warning}>{t('Fee is high relative to the amount.')}</Text>}
    </View>}
    {operation&&<View style={[styles.box,{marginTop:24,gap:16}]}>
      <BitcoinMoney amount={operation.amountSats} hero/>
      <Text selectable style={styles.address}>{operation.txid}</Text>
      <Text style={styles.note}>{t(operation.state==='prepared'?'No transaction has been broadcast. You can cancel this preparation.':'Your transaction is saved. Closing this screen does not cancel it.')}</Text>
      {operation.rawTransaction&&operation.state==='broadcast_pending'&&<BitcoinButton label={t('Check and resend saved transaction')} loading={busy} onPress={()=>void run(async()=>{
        if(!wallet)return;await wallet.sync();current();const guard=walletSession.capture();
        setOperation(await wallet.rebroadcast(operation,()=>{guard();current();}));
      })}/>}
      {operation.state==='prepared'&&<BitcoinButton label={t('Cancel preparation')} secondary disabled={busy} onPress={()=>void run(async()=>{
        walletSession.capture()();await onchainJournal().update(operation.scope,operation.id,{state:'aborted'});current();setOperation(null);void balance.refresh();
      })}/>}
      <BitcoinButton label={t('Activity')} secondary onPress={()=>router.replace({pathname:'/(tabs)',params:{activity:'all'}})}/>
    </View>}
    {!wallet&&<View style={styles.box}><Text style={styles.note}>{t(onchainError||'Loading Bitcoin balance…')}</Text>
      <BitcoinButton label={t('Try again')} secondary onPress={()=>void run(retryOnchainConnection)}/></View>}
    {busy&&<ActivityIndicator/>}
    {!!error&&<Text style={styles.warning} accessibilityLiveRegion="polite">{t(error)}</Text>}
  </BitcoinSendScreen>;
}
