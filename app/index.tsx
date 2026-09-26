import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useColorMode } from '@/hooks/useColorMode';
import { themeColor } from '@/lib/theme-styles';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { getSecureItem, hasStoredMnemonic, WALLET_WIPE_PENDING_KEY } from '../lib/storage';

export default function Index() {
  useLanguage();
  const { mode } = useColorMode();
  const [loading, setLoading] = useState(true);
  const [hasWallet, setHasWallet] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function checkWallet() {
      setLoading(true);
      setFailed(false);
      try {
        if (await getSecureItem(WALLET_WIPE_PENDING_KEY) === 'true') {
          const { resumePendingWalletWipe } = await import('../lib/wallet-wipe-native');
          await resumePendingWalletWipe();
        }
        const exists = await hasStoredMnemonic();
        if (mounted) setHasWallet(exists);
      } catch {
        if (mounted) setFailed(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void checkWallet();
    return () => {
      mounted = false;
    };
  }, [attempt]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: mode === 'light' ? '#fff' : '#0a0a0c',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color={themeColor('accentText', mode)} />
      </View>
    );
  }

  if (failed) return (
    <View style={{ flex: 1, backgroundColor: mode === 'light' ? '#fff' : '#0a0a0c', justifyContent: 'center', padding: 28 }}>
      <Text style={{ color: mode === 'light' ? '#18181d' : '#fff', fontSize: 22, marginBottom: 20 }}>{t("Your secure wallet storage is temporarily unavailable.")}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ padding: 20, backgroundColor: '#ffb000', borderRadius: 18 }}>
        <Text style={{ color: '#111', textAlign: 'center', fontWeight: '700' }}>{t("Try again")}</Text>
      </TouchableOpacity>
    </View>
  );

  return <Redirect href={hasWallet ? '/(tabs)' : '/(auth)/login'} />;
}
