import { useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWalletMotion } from '@/hooks/useWalletMotion';
import { useLanguage } from '@/hooks/useLanguage';
import { Pressable, WalletActivityBoundary } from '@/components/ui/wallet-interaction';
import { PaymentNetworkIcon } from '@/components/receive/payment-network-icon';
import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { t } from '@/lib/i18n';
import type { WalletAccount } from '@/lib/onchain/types';

export function AccountIcon({account,size=44}:{account:WalletAccount;size?:number}) {
  return <PaymentNetworkIcon network={account==='bitcoin_spark'?'lightning':account==='hedera'?'hedera':'bitcoin'} size={size}/>;
}
export function AccountDetails(props:{
  account:WalletAccount|null; title:string; balance:string; fiat:string; available?:string; status?:string;
  identifier?:string; onchainUnavailable?:boolean; onClose():void; onReceive():void; onSend():void; onTransfer():void; onCopy?():void;
}) {
  useLanguage();
  const insets=useSafeAreaInsets();const {height}=useWindowDimensions();const motion=useWalletMotion();const heading=useRef<Text>(null);
  return <Modal visible={props.account!==null} transparent animationType={motion?'slide':'none'} onRequestClose={props.onClose}
    onShow={()=>{const handle=findNodeHandle(heading.current);if(handle)AccessibilityInfo.setAccessibilityFocus(handle);}}
    statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} accessibilityRole="button" accessibilityLabel={t('Close')}/>
      <WalletActivityBoundary accessibilityViewIsModal style={[styles.sheet,{maxHeight:height*.78,paddingBottom:Math.max(insets.bottom,20)}]}>
        <View style={styles.handle}/>
        <View style={styles.header}><View style={styles.headingRow}>
          {props.account&&<AccountIcon account={props.account}/>}
          <Text ref={heading} accessibilityRole="header" style={styles.heading}>{props.title}</Text>
        </View><Pressable style={styles.close} onPress={props.onClose} accessibilityRole="button" accessibilityLabel={t('Close')}>
          <Ionicons name="close" size={24} color={adaptColor('#fff','color')}/>
        </Pressable></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.balance}>{props.balance}</Text><Text style={styles.fiat}>{props.fiat}</Text>
          {!!props.available&&<Text style={styles.note}>{props.available}</Text>}
          {!!props.status&&<Text style={styles.note} accessibilityLiveRegion="polite">{props.status}</Text>}
          {props.account==='bitcoin_spark'&&<Text style={styles.note}>{t('Your Lightning balance uses Spark. Bitcoin stays here until you send it or move it to on-chain.')}</Text>}
          <View style={styles.actions}>
            <Action icon="arrow-down" label={t('Receive')} disabled={props.account==='bitcoin_onchain'&&props.onchainUnavailable} onPress={props.onReceive}/>
            <Action icon="arrow-up" label={t('Send')} disabled={props.account==='bitcoin_onchain'&&props.onchainUnavailable} onPress={props.onSend}/>
          </View>
          {props.account!=='hedera'&&<Pressable style={[styles.transfer,props.onchainUnavailable&&{opacity:0.45}]} disabled={props.onchainUnavailable} accessibilityState={{disabled:props.onchainUnavailable}} onPress={props.onTransfer} accessibilityRole="button">
            <Ionicons name="swap-horizontal" size={22} color={adaptColor('#ffb000','color')}/>
            <View style={{flex:1}}><Text style={styles.actionLabel}>{t(props.account==='bitcoin_onchain'?'Move to Lightning':'Move to on-chain')}</Text>
              <Text style={styles.note}>{t('Move Bitcoin between your balances. Fees apply.')}</Text></View>
            <Ionicons name="chevron-forward" size={19} color={adaptColor('#999','color')}/>
          </Pressable>}
          {!!props.identifier&&<Pressable style={styles.identifier} onPress={props.onCopy} accessibilityRole="button" accessibilityLabel={t('Copy address')}>
            <Text style={styles.note} selectable>{props.identifier}</Text><Ionicons name="copy-outline" size={20} color={adaptColor('#aaa','color')}/>
          </Pressable>}
        </ScrollView>
      </WalletActivityBoundary>
    </View>
  </Modal>;
}
function Action({icon,label,onPress,disabled=false}:{icon:'arrow-up'|'arrow-down';label:string;disabled?:boolean;onPress():void}) {
  return <Pressable style={[styles.action,disabled&&{opacity:0.45}]} disabled={disabled} accessibilityState={{disabled}} onPress={onPress} accessibilityRole="button">
    <Ionicons name={icon} size={23} color={adaptColor('#fff','color')}/><Text style={styles.actionLabel}>{label}</Text>
  </Pressable>;
}
const styles=adaptiveStyles(StyleSheet.create({
  overlay:{flex:1,justifyContent:'flex-end',backgroundColor:'#000b'},
  sheet:{backgroundColor:'#151518',borderTopLeftRadius:30,borderTopRightRadius:30,paddingHorizontal:24,paddingTop:10},
  handle:{height:4,width:36,borderRadius:2,backgroundColor:'#505053',alignSelf:'center',marginBottom:16},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:20},
  headingRow:{flexDirection:'row',alignItems:'center',gap:12,flex:1},heading:{color:'#fff',fontSize:22,fontWeight:'600',flexShrink:1},
  close:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  content:{paddingBottom:4,gap:8},balance:{color:'#fff',fontSize:34,fontWeight:'600',letterSpacing:-.7},
  fiat:{color:'#aaaab3',fontSize:18},note:{color:'#aaaab3',fontSize:14,lineHeight:21},
  actions:{flexDirection:'row',gap:12,marginTop:18,marginBottom:10},
  action:{flex:1,minHeight:68,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#39393e',borderRadius:18,padding:12},
  actionLabel:{color:'#fff',fontSize:16,fontWeight:'500'},
  transfer:{flexDirection:'row',alignItems:'center',gap:13,padding:16,backgroundColor:'#242427',borderRadius:18,minHeight:76},
  identifier:{flexDirection:'row',gap:12,alignItems:'center',justifyContent:'space-between',paddingVertical:16},
}));
