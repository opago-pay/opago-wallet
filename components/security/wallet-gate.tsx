import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity, WalletActivityBoundary } from '@/components/ui/wallet-interaction';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { LegalLinks } from '@/components/legal/legal-links';

export function WalletGate({ children }: { children: ReactNode }) {
  useLanguage();
  const router = useRouter();
  const segments = useSegments();
  const { securityReady, hasStoredWallet, isLocked, unlockWallet, loadOrGenerateWallet, recoveryRequired, walletReady, error: walletError } = useWalletAuth();
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(AppState.currentState === 'active');
  const unlockingRef = useRef(false);
  const foregroundVisit = useRef(0);
  const attemptedVisit = useRef(-1);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      // A system Face ID sheet can briefly background iOS. It is still the
      // same attempt, so its return must not open another authentication sheet.
      if (state === 'background' && !unlockingRef.current) foregroundVisit.current += 1;
      setActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (securityReady && hasStoredWallet && !isLocked && !walletReady && !recoveryRequired && !walletError && segments[0] !== '(auth)') {
      void loadOrGenerateWallet().catch(() => undefined);
    }
  }, [securityReady, hasStoredWallet, isLocked, walletReady, recoveryRequired, walletError, segments, loadOrGenerateWallet]);

  const unlock = useCallback(async () => {
    if (unlockingRef.current || AppState.currentState !== 'active') return;
    unlockingRef.current = true;
    attemptedVisit.current = foregroundVisit.current;
    setUnlocking(true);
    setError('');
    try { await unlockWallet(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not unlock your wallet.')); }
    finally { unlockingRef.current = false; setUnlocking(false); }
  }, [unlockWallet]);

  useEffect(() => {
    // An idle or explicit lock in the same foreground visit must not summon
    // Face ID by itself. Only launch or a later return from background may.
    if (!isLocked) attemptedVisit.current = foregroundVisit.current;
  }, [isLocked]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !securityReady || hasStoredWallet !== true || !isLocked || !active) return;
    const visit = foregroundVisit.current;
    if (attemptedVisit.current === visit) return;
    // Let iOS finish returning to the foreground before presenting Face ID.
    const timer = setTimeout(() => {
      if (AppState.currentState === 'active' && attemptedVisit.current !== visit) void unlock();
    }, 200);
    return () => clearTimeout(timer);
  }, [securityReady, hasStoredWallet, isLocked, active, unlock]);

  if (!securityReady) return <View style={styles.lock}><ActivityIndicator color={adaptColor('#ffb000', 'color')} /></View>;
  if (Platform.OS === 'ios' && isLocked && hasStoredWallet === true && active &&
      (unlocking || attemptedVisit.current !== foregroundVisit.current)) {
    return <View style={styles.lock}><ActivityIndicator color={adaptColor('#ffb000', 'color')} /></View>;
  }
  if (isLocked && hasStoredWallet !== false) return (
    <ScrollView style={styles.container} contentContainerStyle={styles.lockContent}>
      <Ionicons name="lock-closed-outline" color={adaptColor('#ffb000', 'color')} size={42} />
      <Text style={styles.title}>{t("Your wallet is locked.")}</Text>
      <Text style={styles.description}>{t(Platform.OS === 'ios'
        ? 'Use Face ID or Touch ID to continue. Set up biometrics in your device settings if needed.'
        : 'Use your device passcode or biometrics to continue.')}</Text>
      <TouchableOpacity style={styles.button} onPress={() => void unlock()} disabled={unlocking} accessibilityRole="button">
        {unlocking ? <ActivityIndicator color={adaptColor('#111', 'color')} /> : <Text style={styles.buttonText}>{t("Unlock Opago")}</Text>}
      </TouchableOpacity>
      {!!(error || walletError) && <Text style={styles.error} accessibilityRole="alert">{t(error || walletError || '')}</Text>}
      <LegalLinks variant="help" disabled={unlocking} />
    </ScrollView>
  );
  if (recoveryRequired && segments[0] !== '(auth)') return (
    <ScrollView style={styles.container} contentContainerStyle={styles.lockContent}>
      <Ionicons name="key-outline" color={adaptColor('#ffb000', 'color')} size={42} />
      <Text style={styles.title}>{t('Wallet unavailable')}</Text>
      <Text style={styles.description}>{t('The wallet keys on this device cannot be read. Use your saved recovery words to restore access; local payment records will remain.')}</Text>
      <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/login?restore=1')} accessibilityRole="button">
        <Text style={styles.buttonText}>{t('Restore with your recovery phrase')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.retryButton} onPress={() => void loadOrGenerateWallet().catch(cause =>
        setError(cause instanceof Error ? cause.message : t('The wallet could not be initialized.')))} accessibilityRole="button">
        <Text style={styles.retryText}>{t('Try again')}</Text>
      </TouchableOpacity>
      {!!(error || walletError) && <Text style={styles.error} accessibilityRole="alert">{t(error || walletError || '')}</Text>}
      <LegalLinks variant="help" />
    </ScrollView>
  );
  if (hasStoredWallet && !walletReady && segments[0] !== '(auth)') return (
    <ScrollView style={styles.container} contentContainerStyle={styles.lockContent}>
      {walletError ? <>
        <Ionicons name="alert-circle-outline" color={adaptColor('#ffb000', 'color')} size={42} />
        <Text style={styles.title}>{t('Wallet unavailable')}</Text>
        <Text style={styles.description}>{t(walletError)}</Text>
        <TouchableOpacity style={styles.button} onPress={() => void loadOrGenerateWallet().catch(() => undefined)} accessibilityRole="button">
          <Text style={styles.buttonText}>{t('Try again')}</Text>
        </TouchableOpacity>
        <LegalLinks variant="help" />
      </> : <>
        <ActivityIndicator color={adaptColor('#ffb000', 'color')} />
        <Text style={styles.description}>{t('Opening your wallet…')}</Text>
      </>}
    </ScrollView>
  );
  return (
    <WalletActivityBoundary style={styles.container}>
      <View style={[styles.container, !active && styles.hidden]} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
        {children}
      </View>
      {!active && <View style={[StyleSheet.absoluteFill, styles.lock]}><Ionicons name="lock-closed-outline" color={adaptColor('#ffb000', 'color')} size={42} /></View>}
    </WalletActivityBoundary>
  );
}

const styles = adaptiveStyles(StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c' },
  hidden: { opacity: 0 },
  lock: { flex: 1, backgroundColor: '#0a0a0c', justifyContent: 'center', alignItems: 'center', padding: 28 },
  lockContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 24, textAlign: 'center' },
  description: { color: '#a5a5af', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 12 },
  button: { backgroundColor: '#ffb000', borderRadius: 18, minHeight: 56, padding: 18, alignSelf: 'stretch', alignItems: 'center', marginTop: 30 },
  buttonText: { color: '#111', fontSize: 17, fontWeight: '700' },
  retryButton: { minHeight: 52, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#ffab97', lineHeight: 22, marginTop: 20, textAlign: 'center' },
}));
