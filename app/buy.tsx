import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseWalletScreen } from '@/components/navigation/close-wallet-screen';
import { useColorMode } from '@/hooks/useColorMode';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { markNavigationReady } from '@/lib/performance-trace';

export default function BuyScreen() {
  useLanguage();
  const { mode } = useColorMode();
  const insets = useSafeAreaInsets();
  const light = mode === 'light';

  useEffect(() => { markNavigationReady('buy'); }, []);

  return (
    <View style={[styles.screen, { backgroundColor: light ? '#fff' : '#0a0a0c', paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: light ? '#18181d' : '#fff' }]}>{t('Buy crypto')}</Text>
        <CloseWalletScreen />
      </View>
      <View style={styles.message}>
        <View style={[styles.iconCircle, { backgroundColor: light ? '#f3f3f5' : '#1b1b20' }]}>
          <Ionicons name="card-outline" size={38} color={light ? '#18181d' : '#fff'} />
        </View>
        <Text style={[styles.comingSoon, { color: light ? '#18181d' : '#fff' }]}>{t('Coming soon')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: 32, lineHeight: 38, fontWeight: '600', letterSpacing: -0.8 },
  message: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 22, paddingBottom: 80 },
  iconCircle: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  comingSoon: { fontSize: 24, lineHeight: 30, fontWeight: '600', textAlign: 'center' },
});
