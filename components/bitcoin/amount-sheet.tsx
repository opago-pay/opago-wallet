import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { useEffect } from 'react';
import { Keyboard, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { BitcoinSendScreen } from './send-sheet';
import { BitcoinPaymentActions, bitcoinStyles } from './payment-ui';
import { appLocale, t } from '@/lib/i18n';
import { appConfig } from '@/lib/config';
import type { PaymentCurrency } from '@/components/send/types';
import { editPaymentAmount } from '@/lib/payment-input';

export function BitcoinAmountSheet(props: {
  amount: string; currency: PaymentCurrency; fixedAmount?: number | null;
  recipient: string; loading: boolean; disabled: boolean; onchain: boolean; alternative?: boolean; balanceError?: boolean;
  onAmount(value: string): void; onCurrency(value: PaymentCurrency): void; onBack(): void; onContinue(): void;
}) {
  const { height } = useWindowDimensions();
  const separator = new Intl.NumberFormat(appLocale()).formatToParts(1.1).find(part => part.type === 'decimal')?.value === ',' ? ',' : '.';
  useEffect(() => { Keyboard.dismiss(); }, []);
  const keyHeight = height < 740 ? 48 : 56;
  return <BitcoinSendScreen title={t('Amount')} loading={props.loading} onBack={props.onBack}
    footer={<BitcoinPaymentActions label={t(props.onchain ? 'Prepare fee offer' : 'Continue')}
      onConfirm={props.onContinue} onCancel={props.onBack} loading={props.loading} disabled={props.disabled} />}>
    <View style={amountStyles.content}>
      <Text style={bitcoinStyles.muted} numberOfLines={2}>{props.recipient.length > 64 ? `${props.recipient.slice(0, 22)}…${props.recipient.slice(-12)}` : props.recipient}</Text>
      {!appConfig.isMainnet && <Text style={bitcoinStyles.warning}>REGTEST · {t('TEST MODE')}</Text>}
      {props.fixedAmount != null ? <Text style={amountStyles.amount}>{props.fixedAmount.toLocaleString(appLocale())} SAT</Text> : <>
        <View style={amountStyles.field}>
          <Text style={amountStyles.input} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}
            accessibilityLabel={`${t('Amount')}: ${props.amount || '0'} ${props.currency}`} accessibilityLiveRegion="polite">
            {props.amount || '0'}
          </Text>
          <Text style={amountStyles.unit}>{props.currency}</Text>
        </View>
        <View style={amountStyles.currencies} accessibilityRole="radiogroup">
          {(['SAT', 'EUR'] as const).map(currency => <TouchableOpacity key={currency} disabled={props.loading}
            accessibilityRole="radio" accessibilityLabel={currency} accessibilityState={{ checked: props.currency === currency }}
            style={[amountStyles.currency, currency === props.currency && amountStyles.selected]}
            onPress={() => { props.onAmount(''); props.onCurrency(currency); }}>
            <Text style={[amountStyles.currencyText, currency === props.currency && { color: '#ffb000' }]}>{currency}</Text>
          </TouchableOpacity>)}
        </View>
        <View style={amountStyles.keypad}>
          {['123', '456', '789', `${props.currency === 'EUR' ? separator : ' '}0⌫`].map((row, rowIndex) =>
            <View key={rowIndex} style={amountStyles.keyRow}>
              {Array.from(row).map(key => key === ' ' ? <View key={key} style={amountStyles.emptyKey} /> :
                <TouchableOpacity key={key} style={[amountStyles.key, { minHeight: keyHeight }]} disabled={props.loading}
                  accessibilityRole="button" accessibilityState={{ disabled: props.loading }}
                  accessibilityLabel={key === '⌫' ? t('Delete last digit') : key === separator ? t('Decimal separator') : key}
                  onPress={() => { if (!props.loading) props.onAmount(editPaymentAmount(props.amount, key === '⌫' ? 'delete' : key, props.currency, separator)); }}>
                  {key === '⌫' ? <Ionicons name="backspace-outline" size={25} color={adaptColor('#fafaf7', 'color')} /> : <Text style={amountStyles.keyText}>{key}</Text>}
                </TouchableOpacity>)}
            </View>)}
        </View>
      </>}
      {props.onchain && <Text style={bitcoinStyles.note}>{t('Device approval prepares the fee offer. You confirm sending afterwards.')}</Text>}
      {props.alternative && <Text style={bitcoinStyles.warning}>{t('The Lightning part has expired. You can review a new payment to the Bitcoin address instead. Its costs and timing are different.')}</Text>}
      {props.balanceError && <Text style={bitcoinStyles.warning}>{t('Some balances may be out of date. Please try again.')}</Text>}
    </View>
  </BitcoinSendScreen>;
}
const amountStyles = adaptiveStyles(StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: 18 }, amount: { fontSize: 40, color: '#fafaf7', textAlign: 'center', fontWeight: '600', paddingVertical: 16 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#44444a', paddingVertical: 8 },
  input: { flex: 1, color: '#fafaf7', fontSize: 42, textAlign: 'center', paddingVertical: 6, fontVariant: ['tabular-nums'] },
  unit: { color: '#aaaab3', fontSize: 19 },
  currencies: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: '#222225', alignSelf: 'center' },
  currency: { minHeight: 44, minWidth: 78, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  selected: { backgroundColor: '#3a301c' }, currencyText: { fontSize: 14, color: '#b5b5bd', fontWeight: '600' },
  keypad: { gap: 8 }, keyRow: { flexDirection: 'row', gap: 10 }, emptyKey: { flex: 1 },
  key: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#242427', paddingVertical: 4 },
  keyText: { fontSize: 28, color: '#fafaf7', fontWeight: '500', fontVariant: ['tabular-nums'] },
}));
