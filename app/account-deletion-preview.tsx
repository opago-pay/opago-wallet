import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { themeColor } from '@/lib/theme-styles';
import { ACCOUNT_DELETION_PREVIEW_ENABLED, MockAccountLifecycleAdapter, type DeletionReceipt } from '@/lib/opago/account-wallet-lifecycle-preview';

export default function AccountDeletionPreview() {
  useLanguage();
  const router = useRouter();
  const adapter = useMemo(() => new MockAccountLifecycleAdapter(Date.now, randomUUID), []);
  const [receipt, setReceipt] = useState<DeletionReceipt | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const action = (label: string, onPress: () => void) =>
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onPress} style={{ padding: 16, marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: themeColor('border') }}>
      <Text style={{ color: themeColor('text') }}>{t(label)}</Text>
    </TouchableOpacity>;
  async function requestDeletion() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await adapter.deleteAccount({ accountBearer: 'mock-account-bearer', authTime: Date.now(), idempotencyKey: randomUUID(), hpkeEnvelope: true });
      setReceipt(result);
      setStatus(t('Deletion requested (mock)') + ': ' + result.scheduled_delete_at);
      await adapter.deletionStatus(result.deletion_id, result.receipt_token);
    } catch (error) { Alert.alert(t('Account deletion failed'), t(error instanceof Error ? error.message : 'Network error. Please retry.')); }
    finally { setBusy(false); }
  }
  async function cancelDeletion() {
    if (!receipt || busy) return;
    setBusy(true);
    try {
      await adapter.cancelDeletion({ deletionId: receipt.deletion_id, accountBearer: 'mock-account-bearer', authTime: Date.now(), idempotencyKey: randomUUID() });
      setStatus(t('Deletion cancelled (mock)'));
      setReceipt(null);
    } catch (error) { Alert.alert(t('Account deletion failed'), t(error instanceof Error ? error.message : 'Network error. Please retry.')); }
    finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 72, backgroundColor: themeColor('canvas') }}>
    <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: themeColor('text') }}>{t('Delete OPAGO account')}</Text>
    {!ACCOUNT_DELETION_PREVIEW_ENABLED ?
      <Text style={{ color: themeColor('text'), marginTop: 16 }}>{t('Account deletion preview is disabled.')}</Text> :
      <>
        <Text style={{ color: themeColor('text'), marginTop: 16 }}>{t('Mock only: no live account request is made.')}</Text>
        <Text style={{ color: themeColor('text'), marginTop: 12 }}>{t('Deleting your OPAGO account immediately blocks account access and automatically detaches linked wallets. Your self-custody wallet and keys remain on your device. Final deletion is scheduled after 30 days; you can cancel during this grace period.')}</Text>
        {!receipt ? action('Request account deletion (mock)', () => Alert.alert(t('Delete OPAGO account?'),
          t('Deleting your OPAGO account immediately blocks account access and automatically detaches linked wallets. Your self-custody wallet and keys remain on your device. Final deletion is scheduled after 30 days; you can cancel during this grace period.'),
          [{ text: t('Cancel'), style: 'cancel' }, { text: t('Confirm account deletion'), style: 'destructive', onPress: () => void requestDeletion() }])) :
          action('Cancel scheduled deletion (mock)', () => void cancelDeletion())}
        {!!status && <Text accessibilityLiveRegion="polite" style={{ color: themeColor('text'), marginTop: 16 }}>{status}</Text>}
      </>}
    {action('Back', () => router.back())}
  </ScrollView>;
}
