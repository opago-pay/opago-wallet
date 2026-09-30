import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import type { BitcoinOperation } from '@/lib/bitcoin/store';
import { BitcoinButton, BitcoinMoney, bitcoinStyles } from './payment-ui';
import { themeColor } from '@/lib/theme-styles';
import { useColorMode } from '@/hooks/useColorMode';
import { PaymentSuccessIcon, PaymentSuccessMotionScrollView, type SuccessExit } from '@/components/ui/payment-success-motion';

export function BitcoinTransferResult({ operation, onDashboard, onRefresh }: { operation: BitcoinOperation; onDashboard(): void; onRefresh?(): void }) {
  useLanguage();
  useColorMode();
  const insets = useSafeAreaInsets();
  const confirmed = operation.state === 'confirmed';
  const failed = operation.state === 'failed';
  const checking = operation.state === 'checking' || operation.state === 'prepared';
  const content = (exit: SuccessExit) => <>
    <View style={{ alignItems: 'center', marginVertical: 20 }}>{confirmed
      ? <PaymentSuccessIcon accessibilityLabel={t('Confirmed')} />
      : <Ionicons name={failed ? 'close-circle-outline' : 'time-outline'} size={66}
        color={themeColor(failed ? 'errorText' : 'warningText')} />}</View>
    <Text style={[bitcoinStyles.title, { textAlign: 'center' }]}>{t(failed ? 'Payment not completed' : confirmed ? 'Bitcoin sent' : checking ? 'Payment is being checked' : 'Bitcoin is on its way')}</Text>
    <BitcoinMoney amount={operation.amountSats} historicalBtcEurRate={operation.btcEurRate} hero />
    <Text style={bitcoinStyles.muted}>{t(failed ? 'Payment failed.' : checking ? 'Please do not send again. We are checking the payment automatically.' : confirmed ? 'Payment confirmed' : 'Arrives after confirmation in the Bitcoin network. This can take some time.')}</Text>
    <View style={bitcoinStyles.box}><Text style={bitcoinStyles.value}>{t('Recipient')}</Text><Text style={bitcoinStyles.address} selectable>{operation.address}</Text>
      <Text style={bitcoinStyles.muted}>{t(failed ? 'Payment failed.' : operation.state === 'broadcast' ? 'Broadcast to the Bitcoin network' : confirmed ? 'Completed' : checking ? 'Payment is being checked' : 'Waiting for network confirmation')}</Text>
      {!!operation.txid && <Text selectable style={bitcoinStyles.address}>{operation.txid}</Text>}
    </View>
    <BitcoinButton label={t('Back to Home')} onPress={() => exit(onDashboard)} />
    {!confirmed && !failed && onRefresh && <BitcoinButton secondary label={t('Check status')} onPress={onRefresh} />}
  </>;
  const pageProps = { style: bitcoinStyles.screen, contentContainerStyle: [bitcoinStyles.page, { paddingTop: insets.top + 44 }] };
  if (confirmed) return <PaymentSuccessMotionScrollView {...pageProps}>{exit => content(exit)}</PaymentSuccessMotionScrollView>;
  return <ScrollView {...pageProps}>{content(action => action())}</ScrollView>;
}
