import React, { useEffect, useState } from 'react';
import { BackHandler, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '@/components/ui/wallet-interaction';
import { useLanguage } from '@/hooks/useLanguage';
import { appLocale, t } from '@/lib/i18n';
import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { openHederaExplorerUrl } from '@/lib/hedera/explorer-native';
import { bitcoinExplorerUrl, lightningHashFromPayment, paymentDetailReferences, paymentDetailStatus, paymentMethodLabel,
  type PaymentHistoryItem } from '@/lib/payment-details';

export function PaymentDetailsScreen({ payment, onClose, onHide, onReviewDeposit }: {
  payment: PaymentHistoryItem;
  onClose(): void;
  onHide?: () => void;
  onReviewDeposit?: () => void;
}) {
  useLanguage();
  const insets = useSafeAreaInsets();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => { setCopied(null); setDetailsOpen(false); }, [payment.key]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]);
  const status = paymentDetailStatus(payment);
  const date = new Date(payment.timestamp);
  const dateLabel = Number.isFinite(date.getTime()) ? date.toLocaleString(appLocale(), {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : null;
  const operation = payment.operation;
  const route = t(paymentMethodLabel(payment));
  const recipient = operation?.kind === 'withdrawal' && !operation.recoveredFromProvider
    ? operation.address.trim() : '';
  const receivingAddress = operation?.kind === 'deposit' ? operation.address.trim() : '';
  const explorer = payment.asset === 'HBAR' ? payment.explorerUrl ?? null : bitcoinExplorerUrl(payment);
  const references = paymentDetailReferences(payment);
  const amount = payment.amountDisplay === '—' ? '—' :
    `${payment.type === 'incoming' ? '+' : '−'}${payment.amountDisplay} ${payment.asset}`;

  async function copy(label: string, value: string) {
    try { await Clipboard.setStringAsync(value); setCopied(label); }
    catch { setCopied(t('Copy unavailable')); }
  }
  async function openExplorer() {
    if (!explorer) return;
    try {
      if (payment.asset === 'HBAR') await openHederaExplorerUrl(explorer);
      else await Linking.openURL(explorer);
    } catch { setCopied(t('Could not open explorer')); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, {
    paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30,
  }]}>
    <View style={styles.header}>
      <Text style={styles.title}>{t('Payment details')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Close')} onPress={onClose} style={styles.close}>
        <Ionicons name="close" size={27} color={adaptColor('#fff', 'color')} />
      </Pressable>
    </View>

    <View style={styles.summary}>
      <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>{amount}</Text>
      <View style={[styles.status, status === 'Completed' ? styles.statusDone :
        status === 'Failed' || status === 'Claim required' ? styles.statusAttention : styles.statusPending]}>
        <Text style={styles.statusText}>{t(status)}</Text>
      </View>
      {status === 'Status unknown' && <Text style={styles.statusHelp}>
        {t('Do not send it again. We will keep checking automatically.')}
      </Text>}
    </View>

    <View style={styles.card}>
      <Field label={t('Direction')} value={t(payment.type === 'incoming' ? 'Receive' : 'Send')} />
      {dateLabel && <Field label={t('Date and time')} value={dateLabel} />}
      <Field label={t('Payment method')} value={route} />
      {!!recipient && <Field label={t('Recipient')} value={recipient} selectable />}
      {!!receivingAddress && <Field label={t('Receiving address')} value={receivingAddress} selectable />}
      {operation?.state === 'confirmed' && operation.actualFeeSats !== undefined &&
        <Field label={t('Fee paid')} value={`${operation.actualFeeSats.toLocaleString(appLocale())} SAT`} />}
      {operation?.feeSats !== null && operation?.feeSats !== undefined &&
        <Field label={t('Fee, at most')} value={`${operation.feeSats.toLocaleString(appLocale())} SAT`} />}
    </View>

    {onReviewDeposit && <Pressable accessibilityRole="button" onPress={onReviewDeposit} style={styles.primaryButton}>
      <Text style={styles.primaryText}>{t('Review claim fee')}</Text>
      <Ionicons name="arrow-forward" size={20} color="#15150e" />
    </Pressable>}

    {(references.length > 0 || explorer || onHide) && <View style={styles.detailsSection}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }}
        onPress={() => setDetailsOpen(value => !value)} style={styles.detailsToggle}>
        <Text style={styles.detailsTitle}>{t('Details')}</Text>
        <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={20} color={adaptColor('#a3a3ad', 'color')} />
      </Pressable>
      {detailsOpen && <View style={styles.detailsBody}>
        {references.map(({ label, value }) => <View key={label} style={styles.reference}>
          <Text style={styles.fieldLabel}>{t(label)}</Text>
          <Text selectable style={styles.referenceValue}>{value}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('Copy')} ${t(label)}`}
            onPress={() => void copy(label, value)} style={styles.copyButton}>
            <Ionicons name="copy-outline" size={19} color={adaptColor('#ffb000', 'color')} />
            <Text style={styles.actionText}>{t(copied === label ? 'Copied' : 'Copy')}</Text>
          </Pressable>
        </View>)}
        {!!explorer && <Pressable accessibilityRole="link" onPress={() => void openExplorer()} style={styles.linkButton}>
          <Text style={styles.actionText}>{t(payment.asset === 'HBAR' ? 'Open in HashScan' : 'Open in Bitcoin explorer')}</Text>
          <Ionicons name="open-outline" size={18} color={adaptColor('#ffb000', 'color')} />
        </Pressable>}
        {onHide && lightningHashFromPayment(payment) && <Pressable accessibilityRole="button" onPress={onHide} style={styles.linkButton}>
          <Text style={styles.actionText}>{t('Hide entry')}</Text>
        </Pressable>}
        {onHide && <Text style={styles.statusHelp}>
          {t('Hiding this entry removes it from your usual history and dismisses its notice. Its outcome remains unknown. Status checks and protection against sending it again stay active.')}
        </Text>}
        {!!copied && copied !== 'Payment hash' && copied !== 'Request ID' && copied !== 'Quote ID' &&
          copied !== 'Transfer ID' && copied !== 'Transaction ID' &&
          <Text style={styles.statusHelp}>{copied}</Text>}
      </View>}
    </View>}
  </ScrollView>;
}

function Field({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text selectable={selectable} style={styles.fieldValue}>{value}</Text>
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0c' },
  content: { paddingHorizontal: 20, gap: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  title: { color: '#fff', fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.5, flexShrink: 1 },
  close: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  summary: { alignItems: 'center', paddingTop: 28, paddingBottom: 12, gap: 16 },
  amount: { color: '#fff', fontSize: 42, lineHeight: 50, fontWeight: '600', fontVariant: ['tabular-nums'] },
  status: { borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  statusDone: { backgroundColor: '#132820' },
  statusAttention: { backgroundColor: '#211b0f' },
  statusPending: { backgroundColor: '#211b0f' },
  statusText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statusHelp: { color: '#a3a3ad', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  card: { backgroundColor: '#17171b', borderRadius: 22, paddingHorizontal: 18 },
  field: { paddingVertical: 17, borderBottomColor: '#303035', borderBottomWidth: StyleSheet.hairlineWidth, gap: 5 },
  fieldLabel: { color: '#a3a3ad', fontSize: 13, lineHeight: 19 },
  fieldValue: { color: '#fff', fontSize: 16, fontWeight: '600', lineHeight: 23 },
  primaryButton: { minHeight: 58, borderRadius: 18, backgroundColor: '#ffb000', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 12 },
  primaryText: { color: '#15150e', fontSize: 16, lineHeight: 22, fontWeight: '600' },
  detailsSection: { borderTopWidth: 1, borderTopColor: '#303035' },
  detailsToggle: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailsTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  detailsBody: { gap: 8, paddingBottom: 20 },
  reference: { paddingVertical: 11, gap: 7 },
  referenceValue: { color: '#d5d5da', fontSize: 13, lineHeight: 19 },
  copyButton: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionText: { color: '#ffb000', fontSize: 15, fontWeight: '600' },
}));
