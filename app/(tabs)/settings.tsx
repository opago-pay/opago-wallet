import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Text as SvgText } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { getSecureItem, MNEMONIC_STORE_KEY } from '@/lib/storage';
import { appConfig } from '@/lib/config';

function ProtectedRecoveryPhrase({ phrase }: { phrase: string }) {
  usePreventScreenCapture('opago-recovery-phrase');
  const words = phrase.trim().split(/\s+/);
  const columns = words.length > 12 ? 3 : 4;
  const rowHeight = 30;
  const canvasWidth = 600;
  const canvasHeight = Math.ceil(words.length / columns) * rowHeight;

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: '100%' }}
    >
      <Svg
        accessible={false}
        accessibilityElementsHidden
        height={canvasHeight}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        viewBox={'0 0 ' + canvasWidth + ' ' + canvasHeight}
        width="100%"
      >
        {words.map((word, index) => (
          <SvgText
            key={index}
            fill="#fff"
            fontFamily="monospace"
            fontSize={16}
            x={(index % columns) * (canvasWidth / columns) + 8}
            y={Math.floor(index / columns) * rowHeight + 21}
          >
            {index + 1 + '. ' + word}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function SensitiveInputScreenCaptureGuard() {
  usePreventScreenCapture('opago-recovery-verification');
  return null;
}

type BackupChallenge = {
  positions: number[];
  expectedWords: string[];
};

function selectBackupChallengePositions(wordCount: number): number[] {
  if (wordCount < 3) throw new Error('Recovery phrase is incomplete.');
  const available = Array.from({ length: wordCount }, (_, index) => index);
  for (let index = available.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [available[index], available[swapIndex]] = [available[swapIndex], available[index]];
  }
  return available.slice(0, 3).sort((left, right) => left - right);
}

export default function SettingsScreen() {
  const router = useRouter();
  const { wipeWallet, hederaPublicKey } = useWalletAuth();
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [backupVerified, setBackupVerified] = useState(false);
  const [isVerifyingBackup, setIsVerifyingBackup] = useState(false);
  const [backupChallenge, setBackupChallenge] = useState<BackupChallenge | null>(null);
  const [backupChallengeIndex, setBackupChallengeIndex] = useState(0);
  const [backupWordInput, setBackupWordInput] = useState('');
  const [backupChallengeError, setBackupChallengeError] = useState('');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') return;
      setMnemonic(null);
      setIsRevealed(false);
      setBackupChallenge(null);
      setBackupChallengeIndex(0);
      setBackupWordInput('');
      setBackupChallengeError('');
      setBackupVerified(false);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isRevealed) return;
    const hide = () => {
      setMnemonic(null);
      setIsRevealed(false);
    };
    const timer = setTimeout(hide, 30_000);
    return () => {
      clearTimeout(timer);
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
      setBackupChallenge(null);
      setBackupChallengeIndex(0);
      setBackupWordInput('');
      setBackupChallengeError('');
      setBackupVerified(false);
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

  async function beginRecoveryBackupVerification() {
    setIsVerifyingBackup(true);
    try {
      const phrase = await getSecureItem(MNEMONIC_STORE_KEY);
      if (!phrase || !hederaPublicKey) throw new Error('Recovery phrase is unavailable.');
      const words = phrase.trim().toLowerCase().split(/\s+/);
      const positions = selectBackupChallengePositions(words.length);
      setMnemonic(null);
      setIsRevealed(false);
      setBackupVerified(false);
      setBackupChallenge({
        positions,
        expectedWords: positions.map(position => words[position]),
      });
      setBackupChallengeIndex(0);
      setBackupWordInput('');
      setBackupChallengeError('');
    } catch (cause) {
      setBackupVerified(false);
      Alert.alert(
        'Could not start backup verification',
        cause instanceof Error ? cause.message : 'The phrase could not be verified.',
      );
    } finally {
      setIsVerifyingBackup(false);
    }
  }

  function cancelBackupVerification() {
    setBackupChallenge(null);
    setBackupChallengeIndex(0);
    setBackupWordInput('');
    setBackupChallengeError('');
  }

  function submitBackupChallengeWord() {
    if (!backupChallenge) return;
    const candidate = backupWordInput.trim().toLowerCase();
    setBackupWordInput('');
    if (candidate !== backupChallenge.expectedWords[backupChallengeIndex]) {
      setBackupChallengeError(
        `Word ${backupChallenge.positions[backupChallengeIndex] + 1} does not match your wallet.`,
      );
      return;
    }

    setBackupChallengeError('');
    if (backupChallengeIndex < backupChallenge.positions.length - 1) {
      setBackupChallengeIndex(index => index + 1);
      return;
    }

    setBackupChallenge(null);
    setBackupChallengeIndex(0);
    setBackupVerified(true);
    Alert.alert(
      'Recovery backup verified',
      'The paper backup matches this wallet. Deletion is unlocked only for this app session.',
    );
  }

  function confirmReset() {
    if (!backupVerified) {
      Alert.alert(
        'Verify recovery backup first',
        'Complete the three-word paper-backup check before deleting local keys.',
      );
      return;
    }
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
          accessibilityRole="button"
          accessibilityLabel={
            isRevealed
              ? 'Recovery phrase revealed. Tap to hide.'
              : 'Hidden recovery phrase. Tap to authenticate and reveal.'
          }
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
        <Text style={styles.sectionTitle}>Verify backup before deletion</Text>
        <Text style={styles.sectionSubtitle}>
          Never type or send all recovery words. The app asks for three random word positions,
          one at a time, and checks them locally against this exact wallet.
        </Text>
        <TouchableOpacity
          style={[
            styles.verifyButton,
            (isVerifyingBackup || isDeleting || backupVerified) && styles.disabledButton,
          ]}
          onPress={() => void beginRecoveryBackupVerification()}
          disabled={isVerifyingBackup || isDeleting || backupVerified}
        >
          {isVerifyingBackup ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.verifyButtonText}>
              {backupVerified ? 'Paper backup verified' : 'Start 3-word backup check'}
            </Text>
          )}
        </TouchableOpacity>
        {backupVerified && (
          <Text style={styles.verifiedText}>
            Verified for this session. Wallet deletion is now unlocked.
          </Text>
        )}
      </View>

      <Modal
        visible={backupChallenge !== null}
        transparent
        animationType="fade"
        onRequestClose={cancelBackupVerification}
      >
        {backupChallenge && <SensitiveInputScreenCaptureGuard />}
        <KeyboardAvoidingView
          style={styles.modalKeyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.challengeCard}>
              <Text style={styles.challengeEyebrow}>
                PAPER BACKUP · {backupChallengeIndex + 1} OF 3
              </Text>
              <Text style={styles.challengeTitle}>
                Enter word #{(backupChallenge?.positions[backupChallengeIndex] ?? 0) + 1}
              </Text>
              <Text style={styles.challengeSubtitle}>
                Read only this numbered word from your paper backup. Never send it to support or
                chat.
              </Text>
              <TextInput
                key={backupChallengeIndex}
                style={styles.verificationInput}
                placeholder="One word"
                placeholderTextColor="#666"
                value={backupWordInput}
                onChangeText={value => {
                  setBackupWordInput(value);
                  setBackupChallengeError('');
                }}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                editable={!isDeleting}
                returnKeyType={backupChallengeIndex === 2 ? 'done' : 'next'}
                onSubmitEditing={submitBackupChallengeWord}
                accessibilityLabel={`Recovery word ${
                  (backupChallenge?.positions[backupChallengeIndex] ?? 0) + 1
                }`}
              />
              {!!backupChallengeError && (
                <Text style={styles.challengeError}>{backupChallengeError}</Text>
              )}
              <TouchableOpacity
                style={[
                  styles.verifyButton,
                  !backupWordInput.trim() && styles.disabledButton,
                ]}
                onPress={submitBackupChallengeWord}
                disabled={!backupWordInput.trim()}
              >
                <Text style={styles.verifyButtonText}>
                  {backupChallengeIndex === 2 ? 'Verify paper backup' : 'Next word'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={cancelBackupVerification}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.section}>
        <TouchableOpacity
          style={[
            styles.dangerButton,
            (isDeleting || !backupVerified) && styles.disabledButton,
          ]}
          onPress={confirmReset}
          disabled={isDeleting || !backupVerified}
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
  verificationInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 16,
    minHeight: 52,
    marginBottom: 12,
  },
  modalKeyboardView: { flex: 1 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.82)',
    padding: 24,
  },
  challengeCard: {
    backgroundColor: '#17171c',
    borderWidth: 1,
    borderColor: 'rgba(107,92,195,0.65)',
    borderRadius: 20,
    padding: 24,
  },
  challengeEyebrow: {
    color: '#ffb000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  challengeTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 12 },
  challengeSubtitle: { color: '#aaaab5', fontSize: 16, lineHeight: 23, marginBottom: 20 },
  challengeError: { color: '#ff6767', lineHeight: 20, marginBottom: 12 },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelButtonText: { color: '#aaaab5', fontWeight: '700', fontSize: 16 },
  verifyButton: {
    backgroundColor: '#6b5cc3',
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  verifiedText: { color: '#32d6b2', marginTop: 12, lineHeight: 20 },
  disabledButton: { opacity: 0.4 },
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
