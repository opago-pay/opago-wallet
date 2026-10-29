import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { themeColor } from '@/lib/theme-styles';
import { WALLET_DETACH_PREVIEW_ENABLED, MockWalletDetachAdapter } from '@/lib/opago/account-wallet-lifecycle-preview';

export default function WalletDetachPreview() {
  useLanguage();
  const router = useRouter();
  const adapter = useMemo(() => new MockWalletDetachAdapter(randomUUID(), randomUUID(), 1, Date.now, randomUUID), []);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const action = (label: string, onPress: () => void) =>
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onPress} style={{ padding: 16, marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: themeColor('border') }}>
      <Text style={{ color: themeColor('text') }}>{t(label)}</Text>
    </TouchableOpacity>;
  async function detach() {
    if (busy || done) return;
    setBusy(true);
    try {
      const challenge = await adapter.challenge();
      const proof = await adapter.verify(challenge, true);
      const result = await adapter.detach({ accountBearer: 'mock-account-bearer', authTime: Date.now(),
        proofToken: proof.proof_token, installationId: randomUUID(), idempotencyKey: randomUUID(), signatureVerified: true });
      setDone(true);
      Alert.alert(t('Wallet detached (mock). Payments are disabled.'), result.evidence_id);
    } catch (error) { Alert.alert(t('Wallet detach failed'), t(error instanceof Error ? error.message : 'Network error. Please retry.')); }
    finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 72, backgroundColor: themeColor('canvas') }}>
    <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: themeColor('text') }}>{t('Unlink wallet')}</Text>
    {!WALLET_DETACH_PREVIEW_ENABLED ?
      <Text style={{ color: themeColor('text'), marginTop: 16 }}>{t('Wallet detach preview is disabled.')}</Text> :
      <>
        <Text style={{ color: themeColor('text'), marginTop: 16 }}>{t('Mock only: no live wallet request is made.')}</Text>
        <Text style={{ color: themeColor('text'), marginTop: 12 }}>{t('Detaching disables inbound and outbound payments and your OPAGO Lightning address. Open invoices remain valid until they expire. Your wallet and keys stay on this device. Re-linking creates a new binding. No recovery or support exception is available.')}</Text>
        {!done && action('Detach wallet (mock)', () => Alert.alert(t('Unlink wallet?'),
          t('Detaching disables inbound and outbound payments and your OPAGO Lightning address. Open invoices remain valid until they expire. Your wallet and keys stay on this device. Re-linking creates a new binding. No recovery or support exception is available.'),
          [{ text: t('Cancel'), style: 'cancel' }, { text: t('Detach wallet (mock)'), style: 'destructive', onPress: () => void detach() }]))}
      </>}
    {action('Back', () => router.back())}
  </ScrollView>;
}
