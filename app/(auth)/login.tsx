import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useColorMode } from '@/hooks/useColorMode';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecoveryForm } from '@/components/onboarding/recovery-form';
import { LegalLinks } from '@/components/legal/legal-links';

function RecoveryInputScreenCaptureGuard() {
  usePreventScreenCapture('opago-recovery-input');
  return null;
}

export default function LoginScreen() {
  const { mode } = useColorMode();
  useLanguage();
  const router = useRouter();
  const { restore } = useLocalSearchParams<{ restore?: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { createWallet, restoreWallet, recoveryRequired, isInitializing, walletReady, initStatus, error } = useWalletAuth();
  const [isRestoring, setIsRestoring] = useState(restore === '1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (walletReady) router.replace('/(tabs)');
  }, [router, walletReady]);

  useEffect(() => { if (restore === '1') setIsRestoring(true); }, [restore]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') return;
      // Unmounting RecoveryForm discards all entered recovery words.
      setIsRestoring(false);
    });
    return () => subscription.remove();
  }, []);

  async function runWalletAction(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (cause) {
      Alert.alert(t('Wallet unavailable'), t(cause instanceof Error ? cause.message : t('The wallet could not be initialized.')));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || isInitializing;
  const compact = height < 760;

  return (
    <View style={styles.container}>
      {isRestoring && <RecoveryInputScreenCaptureGuard />}
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 18, paddingBottom: Math.max(insets.bottom + 12, 24) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {isRestoring ? (
              <RecoveryForm
                loading={loading}
                onBack={() => recoveryRequired ? router.replace('/(tabs)') : setIsRestoring(false)}
                onRestore={phrase => runWalletAction(() => restoreWallet(phrase))}
              />
            ) : (
              <>
                <View style={styles.header}>
                  <Image
                    source={mode === 'light'
                      ? require('@/assets/images/opago-wordmark-light.svg')
                      : require('@/assets/images/opago-wordmark.svg')}
                    style={styles.wordmark}
                    contentFit="contain"
                    accessibilityLabel="Opago"
                    accessibilityRole="image"
                  />
                </View>

                <View style={[styles.hero, compact && styles.heroCompact]}>
                  <Text style={[styles.title, (width < 370 || compact) && styles.titleCompact]}>
                    {t("Your bitcoin.")}{'\n'}<Text style={styles.titleSecondary}>{t("Your move.")}</Text>
                  </Text>
                  <Text style={styles.description}>{t("Hold. Pay.")}{'\n'}{t("On your terms.")}</Text>
                </View>

                <View style={styles.actions}>
                  {!recoveryRequired && <TouchableOpacity
                    style={[styles.primaryButton, loading && styles.disabledButton]}
                    onPress={() => void runWalletAction(createWallet)}
                    disabled={loading}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityHint={t("Creates a new wallet with new recovery words")}
                  >
                    <View style={styles.actionCopy}>
                      <Text style={styles.primaryButtonText}>{t("Create a new wallet")}</Text>
                    </View>
                    {loading
                      ? <ActivityIndicator color="#15150e" />
                      : <Ionicons name="arrow-forward" size={22} color="#15150e" />}
                  </TouchableOpacity>}
                  <TouchableOpacity
                    style={[styles.restoreButton, loading && styles.disabledButton]}
                    onPress={() => setIsRestoring(true)}
                    disabled={loading}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityHint={t("Restore an existing wallet one recovery word at a time")}
                  >
                    <View style={styles.actionCopy}>
                      <Text style={styles.restoreButtonTitle}>{t("I already have a wallet")}</Text>
                      <Text style={styles.restoreButtonSubtitle}>{t("Restore with your recovery phrase")}</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={21} color={adaptColor('#b0b4a7', 'color')} style={styles.restoreArrow} />
                  </TouchableOpacity>
                  <View style={styles.footer}>
                    <Ionicons name="key-outline" size={13} color={adaptColor('#979f8d', 'color')} />
                    <Text style={styles.footerText}>{t("Your keys. Your control.")}</Text>
                  </View>
                </View>
              </>
            )}
            {loading && (
              <Text style={styles.loadingText} accessibilityLiveRegion="polite">
                {t(initStatus || 'Securing your wallet…')}
              </Text>
            )}
            {error && !loading && <Text style={styles.errorText} accessibilityRole="alert">{t(error || '')}</Text>}
            <LegalLinks variant="footer" disabled={loading} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = adaptiveStyles(StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0e0b' },
  keyboardAvoidingView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 26 },
  content: { flexGrow: 1, width: '100%', maxWidth: 460, alignSelf: 'center' },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { width: 104, height: 30 },
  hero: { flexGrow: 1, justifyContent: 'center', paddingTop: 32, paddingBottom: 34 },
  heroCompact: { paddingTop: 24, paddingBottom: 24 },
  title: { color: '#f3f4eb', fontSize: 50, lineHeight: 54, letterSpacing: -2.2, fontWeight: '600' },
  titleCompact: { fontSize: 46, lineHeight: 50, letterSpacing: -2 },
  titleSecondary: { color: '#999d91' },
  description: { color: '#92988b', fontSize: 16, lineHeight: 26, marginTop: 24 },
  actions: { gap: 12 },
  primaryButton: { minHeight: 60, borderRadius: 20, backgroundColor: '#ffb000', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
  actionCopy: { flex: 1, paddingVertical: 16 },
  primaryButtonText: { color: '#15150e', fontSize: 16, fontWeight: '700' },
  restoreButton: { minHeight: 76, borderRadius: 20, backgroundColor: '#161a13', borderWidth: 1, borderColor: '#2d3426', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
  restoreButtonTitle: { color: '#f0f2e8', fontSize: 16, fontWeight: '600' },
  restoreButtonSubtitle: { color: '#a5ae9a', fontSize: 12, marginTop: 4, lineHeight: 17 },
  restoreArrow: { transform: [{ rotate: '-45deg' }] },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 6 },
  footerText: { color: '#979f8d', fontSize: 11 },
  disabledButton: { opacity: 0.5 },
  loadingText: { color: '#aab29f', marginTop: 18, textAlign: 'center', fontSize: 13 },
  errorText: { color: '#ffab97', marginTop: 18, lineHeight: 20, textAlign: 'center' },
}));
