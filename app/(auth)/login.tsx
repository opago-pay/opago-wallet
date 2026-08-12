import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { appConfig } from '@/lib/config';
import { useLoginWithOAuth } from '@privy-io/expo';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { validateMnemonic } from 'bip39';

const { width, height } = Dimensions.get('window');

function RecoveryInputScreenCaptureGuard() {
  usePreventScreenCapture('opago-recovery-input');
  return null;
}

function OAuthLoginButton({
  disabled,
  onSuccess,
}: {
  disabled: boolean;
  onSuccess: () => Promise<void>;
}) {
  const { login } = useLoginWithOAuth({ onSuccess });

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => login({ provider: 'google' })}
      disabled={disabled}
    >
      <Text style={styles.providerIcon}>G</Text>
      <Text style={styles.darkButtonText}>Continue with Google</Text>
    </TouchableOpacity>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const {
    loadOrGenerateWallet,
    restoreWallet,
    isInitializing,
    walletReady,
    initStatus,
    error,
  } = useWalletAuth();
  const [isRestoring, setIsRestoring] = useState(false);
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (walletReady) router.replace('/(tabs)');
  }, [router, walletReady]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') return;
      setMnemonicInput('');
      setIsRestoring(false);
    });
    return () => subscription.remove();
  }, []);

  async function runWalletAction(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      Alert.alert(
        'Wallet unavailable',
        cause instanceof Error ? cause.message : 'The wallet could not be initialized.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    const phrase = mnemonicInput.trim().toLowerCase();
    if (!validateMnemonic(phrase)) {
      Alert.alert('Invalid phrase', 'Enter a valid 12- or 24-word recovery phrase.');
      return;
    }
    await runWalletAction(async () => {
      await restoreWallet(phrase);
      setMnemonicInput('');
    });
  }

  const loading = busy || isInitializing;
  const recoveryWordCount = mnemonicInput.trim()
    ? mnemonicInput.trim().split(/\s+/).length
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.glowOrb1} />
      <View style={styles.glowOrb2} />
      {isRestoring && <RecoveryInputScreenCaptureGuard />}
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text style={styles.title}>Opago</Text>
            <Text style={styles.subtitle}>Lightning / Solana / Identity</Text>

            <View style={styles.card}>
              {isRestoring ? (
                <>
                  <Text style={styles.cardTitle}>Restore wallet</Text>
                  <Text style={styles.cardDesc}>
                    Enter all recovery words in order, separated by spaces. The screen stays above
                    the keyboard and capture is blocked while this form is open.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="word 1 word 2 word 3 ..."
                    placeholderTextColor="#666"
                    value={mnemonicInput}
                    onChangeText={setMnemonicInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    accessibilityLabel="Recovery phrase input"
                  />
                  <Text style={styles.wordCount}>{recoveryWordCount} words entered</Text>
                  <TouchableOpacity
                    style={[styles.button, styles.primaryButton]}
                    onPress={() => void handleRestore()}
                    disabled={loading}
                  >
                    <Text style={styles.buttonText}>Restore now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.secondaryButton]}
                    onPress={() => {
                      setMnemonicInput('');
                      setIsRestoring(false);
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.cardTitle}>Create wallet</Text>
                  <Text style={styles.cardDesc}>
                    Sign in with Google or create a device-local wallet without pretending to
                    perform an email login.
                  </Text>
                  {appConfig.importSolanaKeyToPrivy && (
                    <OAuthLoginButton
                      disabled={loading}
                      onSuccess={() => runWalletAction(loadOrGenerateWallet)}
                    />
                  )}
                  <TouchableOpacity
                    style={[styles.button, styles.localButton]}
                    onPress={() => void runWalletAction(loadOrGenerateWallet)}
                    disabled={loading}
                  >
                    <Text style={styles.buttonText}>Create local wallet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.restoreLink}
                    onPress={() => setIsRestoring(true)}
                    disabled={loading}
                  >
                    <Text style={styles.restoreText}>Restore from recovery phrase</Text>
                  </TouchableOpacity>
                </>
              )}

              {loading && (
                <View style={styles.loading}>
                  <ActivityIndicator color="#ffb000" size="large" />
                  <Text style={styles.loadingText}>{initStatus || 'Preparing wallet...'}</Text>
                </View>
              )}
              {error && !loading && <Text style={styles.errorText}>{error}</Text>}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    overflow: 'hidden',
  },
  keyboardAvoidingView: { flex: 1, width: '100%' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  glowOrb1: {
    position: 'absolute',
    top: -height * 0.1,
    left: -width * 0.2,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: '#6b5cc3',
    opacity: 0.15,
    transform: [{ scale: 1.5 }],
  },
  glowOrb2: {
    position: 'absolute',
    bottom: -height * 0.1,
    right: -width * 0.2,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: '#ffb000',
    opacity: 0.15,
    transform: [{ scale: 1.5 }],
  },
  content: { width: '100%', paddingHorizontal: 24, alignItems: 'center', zIndex: 10 },
  title: { fontSize: 48, fontWeight: '800', color: '#fff', marginBottom: 8 },
  subtitle: {
    fontSize: 16,
    color: '#8f8f9d',
    fontWeight: '500',
    marginBottom: 48,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTitle: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  cardDesc: { fontSize: 15, color: '#a0a0ab', marginBottom: 28, lineHeight: 22 },
  input: {
    backgroundColor: '#1a1a1f',
    color: '#fff',
    fontSize: 16,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    minHeight: 80,
  },
  wordCount: { color: '#8f8f9d', marginTop: -10, marginBottom: 18, textAlign: 'right' },
  button: {
    backgroundColor: '#fff',
    minHeight: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
  },
  primaryButton: { backgroundColor: '#6b5cc3' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#333' },
  localButton: { backgroundColor: '#6b5cc3' },
  buttonText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  darkButtonText: { fontSize: 17, fontWeight: '700', color: '#111' },
  providerIcon: { position: 'absolute', left: 20, fontSize: 20, fontWeight: '800' },
  restoreLink: { marginTop: 12, alignItems: 'center' },
  restoreText: { color: '#8f7de8', fontWeight: 'bold' },
  loading: { marginTop: 24, alignItems: 'center' },
  loadingText: { color: '#a0a0ab', marginTop: 16, textAlign: 'center' },
  errorText: { color: '#ff6666', marginTop: 16, textAlign: 'center' },
});
