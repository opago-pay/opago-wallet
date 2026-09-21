import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity, WalletActivityBoundary } from '@/components/ui/wallet-interaction';
import { Ionicons } from '@expo/vector-icons';
import { useWalletAuth } from '@/hooks/useWalletAuth';

export function WalletGate({ children }: { children: ReactNode }) {
  useLanguage();
  const { securityReady, isLocked, unlockWallet, error: walletError } = useWalletAuth();
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  async function unlock() {
    if (unlocking) return;
    setUnlocking(true);
    setError('');
    try { await unlockWallet(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not unlock your wallet.')); }
    finally { setUnlocking(false); }
  }

  if (!securityReady) return <View style={styles.lock}><ActivityIndicator color="#ffb000" /></View>;
  if (isLocked) return (
    <View style={styles.lock}>
      <Ionicons name="lock-closed-outline" color="#ffb000" size={42} />
      <Text style={styles.title}>{t("Your wallet is locked.")}</Text>
      <Text style={styles.description}>{t("Use your device passcode or biometrics to continue.")}</Text>
      <TouchableOpacity style={styles.button} onPress={() => void unlock()} disabled={unlocking} accessibilityRole="button">
        {unlocking ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>{t("Unlock Opago")}</Text>}
      </TouchableOpacity>
      {!!(error || walletError) && <Text style={styles.error} accessibilityRole="alert">{t(error || walletError || '')}</Text>}
    </View>
  );
  return (
    <WalletActivityBoundary style={styles.container}>
      <View style={[styles.container, !active && styles.hidden]} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
        {children}
      </View>
      {!active && <View style={[StyleSheet.absoluteFill, styles.lock]}><Ionicons name="lock-closed-outline" color="#ffb000" size={42} /></View>}
    </WalletActivityBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c' },
  hidden: { opacity: 0 },
  lock: { flex: 1, backgroundColor: '#0a0a0c', justifyContent: 'center', alignItems: 'center', padding: 28 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 24, textAlign: 'center' },
  description: { color: '#a5a5af', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 12 },
  button: { backgroundColor: '#ffb000', borderRadius: 18, minHeight: 56, padding: 18, alignSelf: 'stretch', alignItems: 'center', marginTop: 30 },
  buttonText: { color: '#111', fontSize: 17, fontWeight: '700' },
  error: { color: '#ffab97', lineHeight: 22, marginTop: 20, textAlign: 'center' },
});
