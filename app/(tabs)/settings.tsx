import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { getSecureItem, MNEMONIC_STORE_KEY } from '@/lib/storage';
import { appConfig } from '@/lib/config';

function ProtectedRecoveryPhrase({ phrase }: { phrase: string }) {
  usePreventScreenCapture('opago-recovery-phrase');
  return <Text style={styles.mnemonicText}>{phrase}</Text>;
}
export default function SettingsScreen() {
  const router = useRouter();
  const { wipeWallet, hederaPublicKey } = useWalletAuth();
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  useEffect(() => {
    if (!isRevealed) return;
    const hide = () => {
      setMnemonic(null);
      setIsRevealed(false);
    };
    const timer = setTimeout(hide, 30_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') hide();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [isRevealed]);

  async function toggleRecoveryPhrase() {
    if (isRevealed) {
      setMnemonic(null);
      setIsRevealed(false);
      return;
    }
    setIsUnlocking(true);
    try {
      const phrase = await getSecureItem(MNEMONIC_STORE_KEY);
      if (!phrase) throw new Error('Recovery phrase is unavailable.');
      setMnemonic(phrase);
      setIsRevealed(true);
    } catch (cause) {
      Alert.alert(
        'Could not unlock recovery phrase',
        cause instanceof Error ? cause.message : 'Device authentication failed.',
      );
    } finally {
      setIsUnlocking(false);
    }
  }

  async function performReset() {
    setIsDeleting(true);
    try {
      await wipeWallet();
      setMnemonic(null);
      setIsRevealed(false);
      router.replace('/(auth)/login');
    } catch (cause) {
      Alert.alert(
        'Wallet deletion failed',
        cause instanceof Error ? cause.message : 'Local wallet data could not be removed.',
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function confirmReset() {
    Alert.alert(
      'Delete wallet from this device?',
      'Make sure the recovery phrase is backed up. This removes local keys, history and swap caches.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete wallet',
          style: 'destructive',
          onPress: () => void performReset(),
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Image
          source={require('@/assets/images/logo_new.svg')}
          style={{ width: 36, height: 36 }}
          contentFit="contain"
        />
      </View>
      <Text style={styles.subtitle}>Manage protected wallet keys and network safety.</Text>

      <View style={styles.networkBanner}>
        <Text style={styles.sectionTitle}>
          {appConfig.isMainnet ? 'Mainnet enabled' : 'Safe development networks'}
        </Text>
        <Text style={styles.sectionSubtitle}>
          {appConfig.isMainnet
            ? 'Real-fund transfers are enabled for this build.'
            : 'Real-fund transfers are blocked until mainnet is explicitly enabled.'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hedera testnet provisioning key</Text>
        <Text style={styles.sectionSubtitle}>
          This public key is safe to copy into the local provisioning script. It is not a private key.
        </Text>
        <TouchableOpacity
          style={styles.mnemonicBox}
          disabled={!hederaPublicKey}
          onPress={() => hederaPublicKey && void Clipboard.setStringAsync(hederaPublicKey)}
        >
          <Text style={styles.mnemonicText}>{hederaPublicKey || 'Wallet key is not ready.'}</Text>
          {hederaPublicKey && <Text style={styles.overlayText}>Tap to copy public key</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recovery phrase</Text>
        <Text style={styles.sectionSubtitle}>
          Device authentication is requested when supported. Never share this phrase.
        </Text>
        <TouchableOpacity
          style={styles.mnemonicBox}
          onPress={() => void toggleRecoveryPhrase()}
          disabled={isUnlocking}
        >
          {isUnlocking ? (
            <ActivityIndicator color="#ffb000" />
          ) : isRevealed && mnemonic ? (
            <ProtectedRecoveryPhrase phrase={mnemonic} />
          ) : (
            <Text style={styles.mnemonicText}>Hidden recovery phrase</Text>
          )}
          {!isRevealed && !isUnlocking && (
            <Text style={styles.overlayText}>Tap to authenticate and reveal</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.dangerButton, isDeleting && { opacity: 0.5 }]}
          onPress={confirmReset}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator color="#ff4444" />
          ) : (
            <Text style={styles.dangerButtonText}>Delete wallet</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c', paddingHorizontal: 16 },
  content: { paddingBottom: 50 },
  header: {
    marginTop: 60,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 32, fontWeight: '800', color: '#fff' },
  subtitle: { color: '#8f8f9d' },
  networkBanner: {
    marginTop: 28,
    backgroundColor: 'rgba(107,92,195,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(107,92,195,0.4)',
    borderRadius: 16,
    padding: 18,
  },
  section: {
    marginTop: 32,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingTop: 32,
  },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  sectionSubtitle: { color: '#8f8f9d', marginBottom: 16, lineHeight: 20 },
  mnemonicBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 24,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 120,
  },
  mnemonicText: {
    color: '#fff',
    fontSize: 17,
    lineHeight: 28,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  overlayText: { color: '#ffb000', fontWeight: '700', marginTop: 14 },
  dangerButton: {
    backgroundColor: 'rgba(255,60,60,0.1)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,60,60,0.3)',
  },
  dangerButtonText: { color: '#ff4444', fontWeight: '700', fontSize: 16 },
});
