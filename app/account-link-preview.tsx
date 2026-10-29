import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { themeColor } from '@/lib/theme-styles';
import { ACCOUNT_LINK_PREVIEW_ENABLED, LinkPreviewError, MockAccountLinkAdapter, type LinkStatus } from '@/lib/opago/account-link-preview';

export default function AccountLinkPreview() {
  useLanguage();
  const router = useRouter();
  const adapter = useMemo(() => new MockAccountLinkAdapter('preview-wallet'), []);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); }
    catch (cause) {
      const code = cause instanceof LinkPreviewError ? cause.code : 'network';
      setError(t(({ conflict: 'Wallet is linked to another account.', challenge_expired: 'Challenge expired. Please try again.', network: 'Network error. Please retry.', cancelled: 'Action cancelled.' })[code]));
    } finally { setBusy(false); }
  }
  const action = (label: string, onPress: () => void) =>
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onPress} style={{ padding: 16, borderWidth: 1, borderRadius: 12, borderColor: themeColor('border'), marginTop: 12 }}>
      <Text style={{ color: themeColor('text') }}>{t(label)}</Text>
    </TouchableOpacity>;
  if (!ACCOUNT_LINK_PREVIEW_ENABLED) return <View style={{ flex: 1, padding: 24, backgroundColor: themeColor('canvas') }}>
    <Text style={{ color: themeColor('text') }}>{t('Account linking preview is disabled.')}</Text>
    {action('Back', () => router.back())}
  </View>;
  return <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72, backgroundColor: themeColor('canvas'), flexGrow: 1 }}>
    <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: themeColor('text') }}>{t('OPAGO account and wallet linking')}</Text>
    <Text style={{ marginTop: 12, color: themeColor('text') }}>{t('Mock preview only. No real account or wallet changes are made.')}</Text>
    <Text style={{ marginTop: 12, color: themeColor('text') }}>{accountId ? t('Signed in (mock)') : t('Not signed in')}</Text>
    <Text style={{ color: themeColor('text') }}>{status?.linked ? t('Wallet linked') : t('Wallet not linked')}</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: themeColor('text') }}>{error}</Text>}
    {!accountId && action('Sign in to OPAGO (mock)', () => void run(async () => { const id = await adapter.login(); if (id) { setAccountId(id); setStatus(await adapter.status(id)); } }))}
    {accountId && <>
      {action('Refresh linking status', () => void run(async () => setStatus(await adapter.status(accountId))))}
      {action('Link wallet (Spark signature required)', () => Alert.alert(t('Proof unavailable'), t('Connect the existing Spark Identity Key signer before enabling this preview. No signature was created.')))}
      {status?.linked && action('Unlink wallet', () => Alert.alert(t('Unlink wallet?'), t('This does not delete your local wallet.'), [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Unlink'), style: 'destructive', onPress: () => void run(async () => { await adapter.unlink(accountId); setStatus(await adapter.status(accountId)); }) },
      ]))}
      {action('Sign out', () => { setAccountId(null); setStatus(null); })}
    </>}
    {action('Back', () => router.back())}
  </ScrollView>;
}
