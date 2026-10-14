import { useEffect,useState } from 'react';
import { Text,View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/hooks/useLanguage';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useOnchainBalance } from '@/hooks/useOnchainBalance';
import { BitcoinSendScreen } from '@/components/bitcoin/send-sheet';
import { BitcoinButton,bitcoinStyles as styles } from '@/components/bitcoin/payment-ui';
import { Pressable } from '@/components/ui/wallet-interaction';
import { appLocale,t } from '@/lib/i18n';
import type { OnchainTransaction } from '@/lib/onchain/types';

export default function OnchainActivity(){
  useLanguage();const router=useRouter();const {onchainWallet:wallet}=useWalletAuth();const balance=useOnchainBalance();
  const [rows,setRows]=useState<OnchainTransaction[]>([]);const [error,setError]=useState(false);
  useEffect(()=>{
    if(!wallet)return;let cancelled=false;
    void wallet.transactions().then(items=>{if(!cancelled){setRows(items);setError(false);}}).catch(()=>{if(!cancelled)setError(true);});
    return()=>{cancelled=true;};
  },[wallet,balance.state.updatedAt]);
  const close=()=>router.canGoBack()?router.back():router.replace('/(tabs)');
  const linked=new Set(balance.operations.filter(item=>item.transferStage).flatMap(item=>[item.txid,item.refund?.txid].filter(Boolean)));
  return <BitcoinSendScreen title={t('Bitcoin activity')} onBack={close} footer={<BitcoinButton label={t('Close')} secondary onPress={close}/>}>
    {balance.operations.filter(item=>item.transferStage&&item.state!=='aborted').map(item=><Pressable key={item.id} style={styles.box} accessibilityRole="button"
      onPress={()=>router.push({pathname:'/exchange-flow' as '/send-flow',params:{id:item.id}})}>
      <Text style={styles.value}>{item.kind==='refund'?t('Previous Lightning deposits'):item.kind==='from_lightning'?'Lightning → Bitcoin':'Bitcoin → Lightning'}</Text>
      <Text style={styles.muted}>{t(item.kind==='refund'?'Deposit':'Internal transfer')} · {item.amountSats.toLocaleString(appLocale())} SAT</Text>
      <Text style={styles.note}>{t(item.transferStage==='completed'?'Completed':item.transferStage==='refunded'?'Returned to on-chain':item.transferStage==='claim_required'?'Lightning fee approval required':'Checking transfer')}</Text>
    </Pressable>)}
    {balance.operations.filter(item=>item.kind==='send'&&item.state!=='aborted').map(item=><Pressable key={item.id} style={styles.box} accessibilityRole="button"
      onPress={()=>router.push({pathname:'/onchain-send',params:{id:item.id}})}>
      <Text style={styles.value}>{t('Sent Bitcoin')} · {item.amountSats.toLocaleString(appLocale())} SAT</Text>
      <Text style={styles.note}>{t(item.state==='prepared'?'Payment not sent':item.state==='confirmed'?'Completed':'Bitcoin confirmation pending')}</Text>
      <Text selectable style={styles.address}>{item.address}</Text>
    </Pressable>)}
    {rows.filter(row=>!linked.has(row.txid)&&!balance.operations.some(item=>item.kind==='send'&&item.state!=='aborted'&&item.txid===row.txid)).map(row=><View key={row.txid} style={styles.box}>
      <Text style={styles.value}>{t(row.sentSats>0?'Sent Bitcoin':'Received Bitcoin')} · {row.sentSats>0&&row.feeSats===null?'—':(row.sentSats>0?Math.max(0,row.sentSats-row.receivedSats-(row.feeSats??0)):row.receivedSats).toLocaleString(appLocale())} SAT</Text>
      <Text style={styles.note}>{t(row.confirmed?'Completed':'Bitcoin confirmation pending')}</Text>
      <Text selectable style={styles.address}>{row.txid}</Text>
      {row.sentSats>0&&row.feeSats!==null&&<Text style={styles.note}>{t('Network fee')}: {row.feeSats} SAT</Text>}
    </View>)}
    {error&&<Text style={styles.warning}>{t('Transaction history could not be fully loaded. Pull down to retry.')}</Text>}
    {!rows.length&&!balance.operations.length&&<Text style={styles.note}>{t('No payments yet')}</Text>}
  </BitcoinSendScreen>;
}
