import { useMemo, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { authorizeWalletAction } from '@/lib/device-authentication';
import { walletSession } from '@/lib/wallet-session';
import { appConfig } from '@/lib/config';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { themeColor } from '@/lib/theme-styles';
import { ACCOUNT_LINK_PREVIEW_ENABLED, LinkPreviewError, MockAccountLinkAdapter, linkWithSparkProof, type LinkStatus } from '@/lib/opago/account-link-preview';

export default function AccountLinkPreview() {
  useLanguage();
  const router = useRouter();
  const { sparkWallet } = useWalletAuth();
  const [walletKey, setWalletKey] = useState<string | null>(null);
  const adapter = useMemo(() => walletKey ? new MockAccountLinkAdapter(walletKey, appConfig.isMainnet ? 'mainnet' : 'regtest', randomUUID) : null, [walletKey]);
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
    {!accountId && action('Sign in to OPAGO (mock)', () => void run(async () => {
      if (!sparkWallet) throw new LinkPreviewError('cancelled');
      const key = await sparkWallet.getIdentityPublicKey();
      if (!key) throw new LinkPreviewError('cancelled');
      setWalletKey(key);
      const current = new MockAccountLinkAdapter(key, appConfig.isMainnet ? 'mainnet' : 'regtest', randomUUID);
      const id = await current.login();
      if (id) { setAccountId(id); setStatus(await current.status(id)); }
    }))}
    {accountId && <>
      {adapter && action('Refresh linking status', () => void run(async () => setStatus(await adapter.status(accountId))))}
      {action('Link wallet (Spark signature required)', () => void run(async () => {
        if (!sparkWallet || !walletKey || !adapter) throw new LinkPreviewError('cancelled');
        const assertCurrent = walletSession.captureRuntime();
        const approve = await authorizeWalletAction('Approve OPAGO wallet ownership');
        approve();
        assertCurrent();
        const linked = await linkWithSparkProof(adapter, {
          sign: async ({ challenge, intent }) => {
            approve(); assertCurrent();
            const proof = await sparkWallet.signOpagoWalletChallenge(
              challenge, intent, appConfig.isMainnet ? 'mainnet' : 'regtest', randomUUID(),
            );
            approve(); assertCurrent();
            return proof;
          },
        }, accountId, walletKey);
        assertCurrent();
        setStatus(linked);
      }))}
      {status?.linked && adapter && action('Unlink wallet', () => Alert.alert(t('Unlink wallet?'), t('This does not delete your local wallet.'), [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Unlink'), style: 'destructive', onPress: () => void run(async () => { await adapter.unlink(accountId); setStatus(await adapter.status(accountId)); }) },
      ]))}
      {action('Sign out', () => { setAccountId(null); setStatus(null); })}
    </>}
    {action('Back', () => router.back())}
  </ScrollView>;
}
