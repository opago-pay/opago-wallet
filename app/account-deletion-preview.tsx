import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { themeColor } from '@/lib/theme-styles';
import { ACCOUNT_DELETION_PREVIEW_ENABLED, MockAccountDeletionAdapter, deletePreviewAccount } from '@/lib/opago/account-deletion-preview';
import { MemoryPrivateStore } from '@/lib/opago/store';

export default function AccountDeletionPreview() {
  useLanguage();
  const router = useRouter();
  const adapter = useMemo(() => new MockAccountDeletionAdapter(), []);
  const store = useMemo(() => new MemoryPrivateStore(), []);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true);
    try {
      const credential = await adapter.login();
      if (credential) { setAccountId(credential.accountId); setStatus(''); }
    } catch { Alert.alert(t('Account deletion failed'), t('Network error. Please retry.')); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!accountId || busy) return;
    setBusy(true);
    try {
      const result = await deletePreviewAccount(adapter, store, accountId);
      setStatus(result.status === 'deleted' ? t('Account deletion confirmed (mock).') : t('Account deletion pending (mock).'));
      setAccountId(null);
    } catch { Alert.alert(t('Account deletion failed'), t('Network error. Please retry.')); }
    finally { setBusy(false); }
  }
  const action = (label: string, onPress: () => void) =>
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onPress} style={{ padding: 16, marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: themeColor('border') }}>
      <Text style={{ color: themeColor('text') }}>{t(label)}</Text>
    </TouchableOpacity>;
  return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 72, backgroundColor: themeColor('background') }}>
    <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: themeColor('text') }}>{t('Delete OPAGO account')}</Text>
    {!ACCOUNT_DELETION_PREVIEW_ENABLED ?
      <Text style={{ color: themeColor('text'), marginTop: 16 }}>{t('Account deletion preview is disabled.')}</Text> :
      <>
        <Text style={{ color: themeColor('text'), marginTop: 16 }}>{t('Mock only: This deletes account-scoped preview data, not a real OPAGO account.')}</Text>
        <Text style={{ color: themeColor('text'), marginTop: 12 }}>{t('Deleting your OPAGO account does not delete your self-custody wallet or recovery phrase. Keep your recovery words safe. Backend data retention depends on the service policy.')}</Text>
        {!accountId ? action('Sign in to OPAGO (mock)', () => void signIn()) : action('Delete account', () => Alert.alert(
          t('Delete OPAGO account?'),
          t('Your account access and associated account data may be removed by the backend. Your wallet seed remains on this device. This cannot be undone.'),
          [{ text: t('Cancel'), style: 'cancel' }, { text: t('Confirm account deletion'), style: 'destructive', onPress: () => void remove() }],
        ))}
        {!!status && <Text accessibilityLiveRegion="polite" style={{ color: themeColor('text'), marginTop: 16 }}>{status}</Text>}
      </>}
    {action('Back', () => router.back())}
  </ScrollView>;
}
