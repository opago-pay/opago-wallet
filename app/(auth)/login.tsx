import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useLoginWithOAuth } from '@privy-io/expo';
import { validateMnemonic } from 'bip39';

const { width, height } = Dimensions.get('window');

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

  const { login: loginOAuth } = useLoginWithOAuth({
    onSuccess: () => runWalletAction(loadOrGenerateWallet),
  });

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

  return (
    <View style={styles.container}>
      <View style={styles.glowOrb1} />
      <View style={styles.glowOrb2} />
      <View style={styles.content}>
        <Text style={styles.title}>Opago</Text>
        <Text style={styles.subtitle}>Lightning / Solana / Identity</Text>

        <View style={styles.card}>
          {isRestoring ? (
            <>
              <Text style={styles.cardTitle}>Restore wallet</Text>
              <Text style={styles.cardDesc}>
                Enter the recovery phrase. It is stored only in the protected device keychain.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Recovery phrase"
                placeholderTextColor="#666"
                value={mnemonicInput}
                onChangeText={setMnemonicInput}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
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
                Sign in with Google or create a device-local wallet without pretending to perform
                an email login.
              </Text>
              <TouchableOpacity
                style={styles.button}
                onPress={() => loginOAuth({ provider: 'google' })}
                disabled={loading}
              >
                <Text style={styles.providerIcon}>G</Text>
                <Text style={styles.darkButtonText}>Continue with Google</Text>
              </TouchableOpacity>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
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
