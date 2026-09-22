import React, { useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { AssetIcon } from '@/components/ui/asset-icon';
import { BitcoinSendScreen } from './send-sheet';
import { appLocale, t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { satsToBtc } from '@/lib/bitcoin/amount';
import { appConfig } from '@/lib/config';

export function BitcoinMoney({ amount, hero = false }: { amount: number; hero?: boolean }) {
  const rates = useExchangeRates();
  const fresh = rates.updatedAt > 0 && Date.now() - rates.updatedAt <= 5 * 60_000;
  const eur = rates.btcToEur > 0 && fresh ? new Intl.NumberFormat(appLocale(), { style: 'currency', currency: 'EUR' }).format(amount / 1e8 * rates.btcToEur) : null;
  return <View>
    <Text style={hero ? bitcoinStyles.amount : bitcoinStyles.value}>{eur ?? `${amount.toLocaleString(appLocale())} SAT`}</Text>
    <Text style={[bitcoinStyles.muted, hero && { textAlign: 'center' }]}>{satsToBtc(amount)} BTC · {amount.toLocaleString(appLocale())} SAT</Text>
    {!eur && <Text style={bitcoinStyles.note}>{t('EUR estimate unavailable')}</Text>}
  </View>;
}

export function BitcoinReview(props: {
  amountSats: number; feeSats: number; route: 'lightning' | 'onchain'; recipient: string;
  label?: string; expiresAt?: number | null; networkFeeSats?: number; serviceFeeSats?: number;
  loading: boolean; onConfirm(): void; onCancel(): void;
}) {
  useLanguage();
  const [details, setDetails] = useState(false);
  const rates = useExchangeRates();
  const fresh = rates.updatedAt > 0 && Date.now() - rates.updatedAt <= 300_000;
  const eur = fresh && rates.btcToEur > 0 ? new Intl.NumberFormat(appLocale(), { style: 'currency', currency: 'EUR' }).format(props.amountSats / 1e8 * rates.btcToEur) : null;
  const shortRecipient = props.recipient.length > 44 ? `${props.recipient.slice(0, 18)}…${props.recipient.slice(-12)}` : props.recipient;
  return <BitcoinSendScreen title={t('Check this payment')} loading={props.loading} onBack={props.onCancel}
    footer={<BitcoinPaymentActions label={t('Send')} onConfirm={props.onConfirm} onCancel={props.onCancel} loading={props.loading} />}>
    <TouchableOpacity style={bitcoinStyles.recipient} onPress={() => setDetails(!details)} accessibilityRole="button"
      accessibilityLabel={t('Payment details')} accessibilityState={{ expanded: details }}>
      <AssetIcon asset="bitcoin" size={38} /><View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={2} style={bitcoinStyles.value}>{props.route === 'onchain' ? shortRecipient : props.label?.split('\n')[0] || t('Lightning payment request')}</Text>
        <Text style={bitcoinStyles.note}>{props.route === 'lightning' ? 'Lightning' : t('Bitcoin network')}</Text>
      </View><Ionicons name={details ? 'chevron-up' : 'chevron-down'} color="#aaaab3" size={18} />
    </TouchableOpacity>
    {details && <View style={bitcoinStyles.box}>
      {!!props.label && <><Text style={bitcoinStyles.value}>{props.label}</Text><Text style={bitcoinStyles.note}>{t('Label supplied by the sender. Identity not verified.')}</Text></>}
      <Text selectable style={bitcoinStyles.address}>{props.recipient}</Text>
      {props.networkFeeSats !== undefined && <Text style={bitcoinStyles.muted}>{t('Network fee')}: {props.networkFeeSats} SAT</Text>}
      {props.serviceFeeSats !== undefined && <Text style={bitcoinStyles.muted}>{t('Service fee')}: {props.serviceFeeSats} SAT</Text>}
      {!!props.expiresAt && <Text style={bitcoinStyles.muted}>{t('Request expires')}: {new Date(props.expiresAt).toLocaleString(appLocale())}</Text>}
    </View>}
    {!appConfig.isMainnet && <Text style={bitcoinStyles.warning}>REGTEST · {t('TEST MODE')}</Text>}
    <View style={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 32, gap: 6 }}>
      <Text style={[bitcoinStyles.note, { textAlign: 'center' }]}>{t('Recipient receives')}</Text>
      <Text style={bitcoinStyles.amount}>{props.amountSats.toLocaleString(appLocale())} SAT</Text>
      {eur && <Text style={[bitcoinStyles.muted, { textAlign: 'center' }]}>≈ {eur}</Text>}
    </View>
    <View style={[bitcoinStyles.quote, { marginBottom: 22 }]}>
      <Cost label={t('Fee, at most')} amount={props.feeSats} />
      <Cost label={t('Maximum total')} amount={props.amountSats + props.feeSats} />
    </View>
    {props.route === 'onchain' && <Text style={[bitcoinStyles.note, { marginBottom: 16 }]}>{t('Bitcoin network confirmation required.')}</Text>}
    {props.feeSats > props.amountSats / 10 && <Text style={[bitcoinStyles.note, { color: '#ffce6b', marginBottom: 16 }]}>{t('Fee is high relative to the amount.')}</Text>}
  </BitcoinSendScreen>;
}

/** Read-only preparation: never display an editable amount or an invented fee. */
export function BitcoinReviewLoading(props: { amountSats?: number; label?: string; onCancel(): void }) {
  useLanguage();
  return <BitcoinSendScreen title={t('Check this payment')} onBack={props.onCancel}
    footer={<BitcoinPaymentActions label={t('Send')} disabled onConfirm={() => undefined} onCancel={props.onCancel} />}>
    <View style={bitcoinStyles.recipient}>
      <AssetIcon asset="bitcoin" size={38} /><View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={2} style={bitcoinStyles.value}>{props.label?.split('\n')[0] || t('Bitcoin payment')}</Text>
      </View>
    </View>
    <View style={{ flexGrow: 1, justifyContent: 'center', gap: 16, paddingVertical: 32 }} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>
      {props.amountSats !== undefined && <>
        <Text style={[bitcoinStyles.note, { textAlign: 'center' }]}>{t('Recipient receives')}</Text>
        <Text style={bitcoinStyles.amount}>{props.amountSats.toLocaleString(appLocale())} SAT</Text>
      </>}
      <ActivityIndicator color="#ffb000" size="large" />
      <Text style={[bitcoinStyles.muted, { textAlign: 'center' }]}>{t('Checking payment and fees…')}</Text>
    </View>
  </BitcoinSendScreen>;
}
function Cost({ label, amount }: { label: string; amount: number }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / fontScale < 360;
  return <View style={[bitcoinStyles.row, stacked && { flexDirection: 'column', alignItems: 'flex-start' }]}><Text style={[bitcoinStyles.muted, !stacked && { flex: 1 }]}>{label}</Text><Text style={bitcoinStyles.value}>{amount.toLocaleString(appLocale())} SAT</Text></View>;
}
export function BitcoinPaymentActions(props: { label: string; onConfirm(): void; onCancel(): void; loading?: boolean; disabled?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / fontScale < 320;
  return <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 10 }}>
    <View style={{ flex: stacked ? undefined : 1 }}><BitcoinButton label={t('Cancel')} secondary disabled={props.loading}
      style={{ backgroundColor: '#303034', borderColor: '#64646c' }}
      onPress={() => { Keyboard.dismiss(); props.onCancel(); }} /></View>
    <View style={{ flex: stacked ? undefined : 1.3 }}><BitcoinButton label={props.label} loading={props.loading} disabled={props.disabled}
      onPress={() => { Keyboard.dismiss(); props.onConfirm(); }} /></View>
  </View>;
}
export function BitcoinButton({ label, onPress, loading, disabled, secondary, style }: {
  label: string; onPress(): void; loading?: boolean; disabled?: boolean; secondary?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
    disabled={disabled || loading} onPress={onPress} style={[bitcoinStyles.button, secondary && bitcoinStyles.secondary, style, (disabled || loading) && { opacity: 0.5 }]}>
    {loading ? <ActivityIndicator color={secondary ? '#fff' : '#101011'} /> : <Text style={[bitcoinStyles.buttonText, secondary && { color: '#fafaf7' }]}>{label}</Text>}
  </TouchableOpacity>;
}
export function BitcoinInfo() {
  const [expanded, setExpanded] = useState(false);
  return <View><TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={t('About your Bitcoin balance')}
    style={bitcoinStyles.disclosure} onPress={() => setExpanded(!expanded)}>
    <Text style={bitcoinStyles.muted}>{t('One balance. Two payment routes.')}</Text><Ionicons name="information-circle-outline" size={23} color="#aaaab3" />
  </TouchableOpacity>{expanded && <Text style={bitcoinStyles.note}>{t('It stays your Bitcoin. Lightning and the Bitcoin network are two ways to send and receive Bitcoin. You use one Bitcoin balance. Opago recognises the route from the address or request. You see costs and timing before sending. Learn about Spark and its dependencies in advanced wallet details.')}</Text>}</View>;
}
export const bitcoinStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#09090b' }, page: { flexGrow: 1, paddingHorizontal: 23, paddingBottom: 36, gap: 16 },
  title: { color: '#fafaf7', fontSize: 31, lineHeight: 37, fontWeight: '600', letterSpacing: -0.8, marginTop: 12 },
  value: { color: '#fafaf7', fontSize: 16, fontWeight: '600' }, muted: { color: '#aaaab3', fontSize: 14, lineHeight: 21 },
  note: { color: '#aaaab3', fontSize: 13, lineHeight: 20 }, footnote: { color: '#aaaab3', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  amount: { color: '#fafaf7', fontSize: 42, fontWeight: '600', textAlign: 'center', marginVertical: 8, fontVariant: ['tabular-nums'] },
  recipient: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 },
  quote: { marginVertical: 8, gap: 14 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  button: { backgroundColor: '#ffb000', borderRadius: 15, minHeight: 54, padding: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#101011', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  secondary: { backgroundColor: '#161619', borderWidth: 1, borderColor: '#2c2c31' },
  box: { backgroundColor: '#161619', borderWidth: 1, borderColor: '#2c2c31', borderRadius: 18, padding: 17, gap: 12 },
  warning: { color: '#ffce6b', backgroundColor: '#282113', borderRadius: 15, padding: 14, fontSize: 14, lineHeight: 21 },
  address: { color: '#fafaf7', fontSize: 14, lineHeight: 22 },
  disclosure: { minHeight: 48, borderTopColor: '#2c2c31', borderTopWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  input: { color: '#fafaf7', fontSize: 16, minHeight: 54, borderWidth: 1, borderColor: '#2c2c31', backgroundColor: '#161619', borderRadius: 15, padding: 14 },
});
