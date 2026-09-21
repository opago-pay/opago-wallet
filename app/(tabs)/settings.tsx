import { AdvancedOptions } from '@/components/ui/advanced-options';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { walletSession } from '@/lib/wallet-session';
import { authorizeWalletAction } from '@/lib/device-authentication';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TextInput, TouchableOpacity, WalletActivityBoundary } from '@/components/ui/wallet-interaction';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ProtectedRecoveryPhrase } from '@/components/security/recovery-phrase';
import { BackupStatusNotice } from '@/components/security/backup-prompt';
import { LanguagePicker } from '@/components/settings/language-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useFocusEffect, useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { getSecureItem, MNEMONIC_STORE_KEY } from '@/lib/storage';
import { appConfig } from '@/lib/config';
import { operationalHealth } from '@/lib/operational-health-native';
import type { ServiceHealthRecord } from '@/lib/operational-health';

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
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [available[index], available[randomIndex]] = [available[randomIndex], available[index]];
  }
  return available.slice(0, 3).sort((left, right) => left - right);
}

export default function SettingsScreen() {
  useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wipeWallet, hederaPublicKey, backupStatus, markBackupVerified, lockWallet } = useWalletAuth();
  const backupChecked = backupStatus === 'verified';
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [deletionVerified, setDeletionVerified] = useState(false);
  const [verificationPurpose, setVerificationPurpose] = useState<'backup' | 'removal'>('backup');
  const [hasViewedWords, setHasViewedWords] = useState(false);
  const [isSavingBackup, setIsSavingBackup] = useState(false);
  const savingBackup = useRef(false);
  const [isVerifyingBackup, setIsVerifyingBackup] = useState(false);
  const [backupChallenge, setBackupChallenge] = useState<BackupChallenge | null>(null);
  const [backupChallengeIndex, setBackupChallengeIndex] = useState(0);
  const [backupWordInput, setBackupWordInput] = useState('');
  const [backupChallengeError, setBackupChallengeError] = useState('');
  const backupInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lightningHealth, setLightningHealth] = useState<ServiceHealthRecord | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    void operationalHealth.get('lightning')
      .then(record => {
        if (active) setLightningHealth(record);
      })
      .catch(() => {
        if (active) setLightningHealth(null);
      });
    return () => {
      active = false;
    };
  }, []));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') return;
      setMnemonic(null);
      setIsRevealed(false);
      setBackupChallenge(null);
      setBackupChallengeIndex(0);
      setBackupWordInput('');
      setBackupChallengeError('');
      setDeletionVerified(false);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isRevealed) return;
    const hide = () => {
      setMnemonic(null);
      setIsRevealed(false);
    };
    const timer = setTimeout(hide, 120_000);
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
      const assertUnlocked = await authorizeWalletAction('Unlock your Opago recovery phrase');
      const phrase = await getSecureItem(MNEMONIC_STORE_KEY);
      assertUnlocked();
      if (!phrase) throw new Error('Recovery phrase is unavailable.');
      setMnemonic(phrase);
      setIsRevealed(true);
      setHasViewedWords(true);
    } catch (cause) {
      Alert.alert(
        t('Could not unlock recovery phrase'),
        t(cause instanceof Error ? cause.message : t('Device authentication failed.')),
      );
    } finally {
      setIsUnlocking(false);
    }
  }

  async function performReset(assertAuthorized: () => void) {
    setIsDeleting(true);
    try {
      assertAuthorized();
      await wipeWallet();
      setMnemonic(null);
      setIsRevealed(false);
      setBackupChallenge(null);
      setBackupChallengeIndex(0);
      setBackupWordInput('');
      setBackupChallengeError('');
      setDeletionVerified(false);
      router.replace('/(auth)/login');
    } catch (cause) {
      Alert.alert(
        t('Wallet deletion failed'),
        t(cause instanceof Error ? cause.message : t('Local wallet data could not be removed.')),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function beginRecoveryBackupVerification(purpose: 'backup' | 'removal' = 'backup') {
    if (isVerifyingBackup || savingBackup.current) return;
    setIsVerifyingBackup(true);
    setVerificationPurpose(purpose);
    try {
      const assertUnlocked = await authorizeWalletAction('Unlock your Opago recovery phrase');
      const phrase = await getSecureItem(MNEMONIC_STORE_KEY);
      assertUnlocked();
      if (!phrase || !hederaPublicKey) throw new Error('Recovery phrase is unavailable.');
      const words = phrase.trim().toLowerCase().split(/\s+/);
      const positions = selectBackupChallengePositions(words.length);
      setMnemonic(null);
      setIsRevealed(false);
      setDeletionVerified(false);
      setBackupChallenge({
        positions,
        expectedWords: positions.map(position => words[position]),
      });
      setBackupChallengeIndex(0);
      setBackupWordInput('');
      setBackupChallengeError('');
    } catch (cause) {
      setDeletionVerified(false);
      Alert.alert(
        t('Could not start backup verification'),
        t(cause instanceof Error ? cause.message : t('The phrase could not be verified.')),
      );
    } finally {
      setIsVerifyingBackup(false);
    }
  }

  function cancelBackupVerification() {
    Keyboard.dismiss();
    setBackupChallenge(null);
    setBackupChallengeIndex(0);
    setBackupWordInput('');
    setBackupChallengeError('');
  }

  async function submitBackupChallengeWord() {
    if (!backupChallenge || savingBackup.current) return;
    const candidate = backupWordInput.trim().toLowerCase();
    if (!candidate) return;
    if (candidate !== backupChallenge.expectedWords[backupChallengeIndex]) {
      setBackupChallengeError(
        t('Word {number} does not match your wallet.', { number: backupChallenge.positions[backupChallengeIndex] + 1 }),
      );
      return;
    }

    setBackupWordInput('');
    setBackupChallengeError('');
    if (backupChallengeIndex < backupChallenge.positions.length - 1) {
      setBackupChallengeIndex(index => index + 1);
      return;
    }

    Keyboard.dismiss();
    savingBackup.current = true;
    setIsSavingBackup(true);
    setBackupChallenge(null);
    setBackupChallengeIndex(0);
    try {
      await markBackupVerified();
      setDeletionVerified(true);
      if (verificationPurpose === 'removal') showRemovalConfirmation();
    } catch {
      setDeletionVerified(false);
      Alert.alert(t('Backup check not saved'), t('Unlock your wallet and check the backup again.'));
    } finally {
      savingBackup.current = false;
      setIsSavingBackup(false);
    }
  }

  function confirmReset() {
    if (isDeleting || isVerifyingBackup || savingBackup.current) return;
    if (!deletionVerified) {
      Alert.alert(
        t('Check your backup before removal'),
        t('To protect your access, check three words from this wallet’s paper backup. You will then confirm removal separately. If you have not saved the words yet, cancel and reveal them first.'),
        [
          { text: t('Cancel'), style: 'cancel' },
          { text: t('Check my backup'), onPress: () => void beginRecoveryBackupVerification('removal') },
        ],
      );
      return;
    }
    showRemovalConfirmation();
  }

  function showRemovalConfirmation() {
    const assertAuthorized = walletSession.capture();
    Alert.alert(
      t('Remove wallet from this device?'),
      t('This removes the wallet’s keys, saved account details and local payment history from this device. It does not reverse payments. You will need the complete recovery phrase to access this wallet again.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Remove wallet'), style: 'destructive', onPress: () => void performReset(assertAuthorized) },
      ],
    );
  }

  const busy = isUnlocking || isVerifyingBackup || isSavingBackup || isDeleting;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title} accessibilityRole="header">{t("Security")}</Text>
          <Text style={styles.subtitle}>{t("Keep access to your money.")}</Text>
        </View>
        <Image source={require('@/assets/images/logo_new.svg')} style={styles.logo} contentFit="contain" accessibilityLabel="Opago" />
      </View>

      {backupStatus === 'loading' ? <View style={styles.backupCard}><BackupStatusNotice /></View> : <View style={styles.backupCard}>
        <View style={styles.statusRow}>
          <Ionicons name={backupChecked ? 'checkmark-circle-outline' : 'key-outline'} size={20} color={backupChecked ? '#75d3af' : '#ffb000'} />
          <Text style={[styles.statusText, backupChecked && styles.checkedText]} accessibilityLiveRegion="polite">
            {backupChecked ? t('Backup checked') : t('Backup needed')}
          </Text>
        </View>
        <Text style={styles.backupTitle} accessibilityRole="header">
          {backupChecked ? t('Your backup is checked.') : t('Back up your wallet.')}
        </Text>
        <Text style={styles.body}>
          {backupChecked
            ? t('Three recovery words matched this wallet. Keep your complete backup offline and somewhere only you can access.')
            : t('Your recovery words keep your wallet recoverable. Write them down in order, then check three words from your paper backup.')}
        </Text>

        <Text style={styles.stepLabel}>{t("1 · Save your recovery words")}</Text>
        <Text style={styles.caption}>{t("Never share them, including with Opago support.")}</Text>
        <TouchableOpacity
          style={[styles.actionButton, !backupChecked && !hasViewedWords ? styles.primaryButton : styles.secondaryButton, busy && styles.disabledButton]}
          onPress={() => void toggleRecoveryPhrase()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ expanded: isRevealed, disabled: busy, busy: isUnlocking }}
          accessibilityHint={t("Reveals numbered words after device authentication. Screen readers can read each word when focused. Use headphones or a private space.")}
        >
          {isUnlocking ? <ActivityIndicator color="#ffb000" /> : (
            <Text style={[styles.actionText, !backupChecked && !hasViewedWords && styles.primaryText]}>
              {isRevealed ? t('Hide recovery words') : t('Show recovery words')}
            </Text>
          )}
        </TouchableOpacity>
        {isRevealed && mnemonic && (
          <View>
            <Text style={styles.caption}>{t("Read in numbered order. Hidden when you leave Opago or after 2 minutes. With a screen reader, focus each word in a private space.")}</Text>
            <ProtectedRecoveryPhrase phrase={mnemonic} />
          </View>
        )}

        <Text style={styles.stepLabel}>{t("2 · Check your paper backup")}</Text>
        <Text style={styles.caption}>{t("We will ask for three numbered words. The check stays on this device.")}</Text>
        <TouchableOpacity
          style={[styles.actionButton, !backupChecked && hasViewedWords ? styles.primaryButton : styles.secondaryButton, busy && styles.disabledButton]}
          onPress={() => void beginRecoveryBackupVerification()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy: isVerifyingBackup || isSavingBackup }}
        >
          {isVerifyingBackup || isSavingBackup ? <ActivityIndicator color="#ffb000" /> : (
            <Text style={[styles.actionText, !backupChecked && hasViewedWords && styles.primaryText]}>
              {backupChecked ? t('Check backup again') : t('Check my backup')}
            </Text>
          )}
        </TouchableOpacity>
      </View>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{t("App protection")}</Text>
        <Text style={styles.body}>{t("Opago locks when you leave the app or after 2 minutes without activity. Unlock with your device passcode or biometrics.")}</Text>
        <Text style={styles.caption}>{t("Every payment needs your review and confirmation with supported biometrics or your Android device passcode.")}</Text>
        <TouchableOpacity accessibilityRole="button" style={styles.lockButton} onPress={lockWallet}>
          <Ionicons name="lock-closed-outline" size={19} color="#d5d5dc" />
          <Text style={styles.actionText}>{t("Lock wallet now")}</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={backupChallenge !== null}
        transparent
        animationType="none"
        onShow={() => backupInputRef.current?.focus()}
        onRequestClose={cancelBackupVerification}
      >
        {backupChallenge && <SensitiveInputScreenCaptureGuard />}
        <WalletActivityBoundary style={{ flex: 1 }}><KeyboardAvoidingView
          style={styles.modalKeyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.modalOverlay}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.challengeCard}>
              <Text style={styles.challengeEyebrow}>
                {t('PAPER BACKUP · {number} OF 3', { number: backupChallengeIndex + 1 })}
              </Text>
              <Text style={styles.challengeTitle}>
                {t('Enter word #{number}', { number: (backupChallenge?.positions[backupChallengeIndex] ?? 0) + 1 })}
              </Text>
              <Text style={styles.challengeSubtitle}>
                {t("Read only this numbered word from your paper backup. Never send it to support or chat.")}</Text>
              <TextInput
                ref={backupInputRef}
                style={styles.verificationInput}
                placeholder={t("One word")}
                placeholderTextColor="#666"
                value={backupWordInput}
                onChangeText={value => {
                  setBackupWordInput(value);
                  setBackupChallengeError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
                importantForAutofill="noExcludeDescendants"
                spellCheck={false}
                editable={!isDeleting && !isSavingBackup}
                returnKeyType="done"
                submitBehavior="submit"
                blurOnSubmit={false}
                onSubmitEditing={submitBackupChallengeWord}
                accessibilityLabel={t('Recovery word {number}', { number: (backupChallenge?.positions[backupChallengeIndex] ?? 0) + 1 })}
              />
              <Text style={styles.challengeError} accessibilityLiveRegion="polite">
                {t(backupChallengeError || ' ')}
              </Text>
              <TouchableOpacity
                style={[
                  styles.verifyButton,
                  !backupWordInput.trim() && styles.disabledButton,
                ]}
                onPress={submitBackupChallengeWord}
                accessibilityRole="button"
                disabled={!backupWordInput.trim() || isSavingBackup}
              >
                <Text style={styles.verifyButtonText}>
                  {backupChallengeIndex === 2 ? t('Verify paper backup') : t('Next word')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={styles.cancelButton} onPress={cancelBackupVerification}>
                <Text style={styles.cancelButtonText}>{t("Cancel")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView></WalletActivityBoundary>
      </Modal>

      <LanguagePicker />
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{t("Manage this wallet")}</Text>
        <Text style={styles.body}>{t("Remove the keys and saved payment data from this device. Keep your complete recovery phrase to access the wallet again.")}</Text>
        <Text style={styles.caption}>{t("Backup verification and a separate confirmation protect against accidental removal.")}</Text>
        <TouchableOpacity
          style={[styles.dangerButton, busy && styles.disabledButton]}
          onPress={confirmReset}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy: isDeleting }}
          accessibilityHint={t("Checks your backup before opening a separate removal confirmation.")}
        >
          {isDeleting ? <ActivityIndicator color="#ffab97" /> : <Text style={styles.dangerText}>{t("Remove wallet from this device")}</Text>}
        </TouchableOpacity>
      </View>

      <AdvancedOptions expanded={showAdvanced} onChange={setShowAdvanced}>
        <View style={styles.advancedSection}>
          <Text style={styles.sectionTitle}>{t("Networks")}</Text>
          <Text style={styles.body}>Bitcoin · {appConfig.isMainnet ? 'Lightning Mainnet' : 'Regtest'}</Text>
          <Text style={styles.body}>HBAR · {appConfig.isHederaMainnet ? 'Mainnet' : 'Testnet'}</Text>
          <Text style={styles.stepLabel}>{t("Lightning service status")}</Text>
          <Text style={styles.body}>
            {!lightningHealth?.lastSuccessAt && !lightningHealth?.lastFailureAt
              ? t('No local health check has run yet.')
              : lightningHealth.consecutiveFailures > 0
                ? t('Needs attention · {category} connection issue', { category: lightningHealth.lastErrorCategory || 'unknown' })
                : t('Available · last wallet refresh succeeded')}
          </Text>
          <Text style={styles.stepLabel}>{t('Hedera {network} public key', { network: appConfig.hederaNetwork })}</Text>
          <Text style={styles.caption}>{t("Identifies your account. It cannot authorize a payment.")}</Text>
          <Text style={styles.publicKey}>{hederaPublicKey || t('Wallet key is not ready.')}</Text>
          {!!hederaPublicKey && (
            <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]} accessibilityRole="button" onPress={() => void Clipboard.setStringAsync(hederaPublicKey).catch(() => Alert.alert(t('Copy unavailable'), t('Please try again.')))}>
              <Text style={styles.actionText}>{t("Copy public key")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </AdvancedOptions>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c' },
  content: { paddingHorizontal: 20, paddingBottom: 44 },
  header: { marginBottom: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 20 },
  headerCopy: { flex: 1 },
  title: { fontSize: 32, fontWeight: '700', color: '#fff', letterSpacing: -0.8 },
  subtitle: { color: '#a3a3ad', fontSize: 15, marginTop: 6 },
  logo: { width: 36, height: 36 },
  backupCard: { backgroundColor: '#151518', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#2d2d31' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  statusText: { color: '#ffb000', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  checkedText: { color: '#75d3af' },
  backupTitle: { color: '#fff', fontSize: 27, fontWeight: '700', letterSpacing: -0.6, marginBottom: 12 },
  body: { color: '#b8b8c0', fontSize: 15, lineHeight: 23 },
  caption: { color: '#a3a3ad', fontSize: 14, lineHeight: 21, marginTop: 7 },
  stepLabel: { color: '#eeeef0', fontSize: 16, fontWeight: '600', marginTop: 24 },
  actionButton: { minHeight: 54, padding: 15, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryButton: { backgroundColor: '#ffb000' },
  secondaryButton: { backgroundColor: '#202024', borderWidth: 1, borderColor: '#39393e' },
  actionText: { color: '#eeeef0', fontSize: 16, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  primaryText: { color: '#111' },
  section: { marginTop: 32, paddingTop: 28, borderTopWidth: 1, borderColor: '#28282c' },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 12 },
  lockButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#39393e', borderRadius: 15, minHeight: 54, padding: 15, marginTop: 18 },
  dangerButton: { minHeight: 54, padding: 16, borderRadius: 15, borderWidth: 1, borderColor: '#4c3535', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  dangerText: { color: '#ffab97', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  advancedSection: { padding: 18, borderRadius: 18, backgroundColor: '#151518' },
  publicKey: { color: '#d5d5dc', fontSize: 14, lineHeight: 22, marginTop: 14 },
  disabledButton: { opacity: 0.45 },
  modalKeyboardView: { flex: 1 },
  modalOverlay: { flexGrow: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)', padding: 20 },
  challengeCard: { backgroundColor: '#17171b', borderWidth: 1, borderColor: '#39393e', borderRadius: 24, padding: 22 },
  challengeEyebrow: { color: '#ffb000', fontSize: 13, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  challengeTitle: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 12 },
  challengeSubtitle: { color: '#b8b8c0', fontSize: 16, lineHeight: 23, marginBottom: 20 },
  verificationInput: { backgroundColor: '#222227', borderWidth: 1, borderColor: '#48484f', borderRadius: 14, color: '#fff', fontSize: 20, padding: 16, minHeight: 58, marginBottom: 12 },
  challengeError: { color: '#ffab97', fontSize: 14, lineHeight: 21, marginBottom: 12 },
  verifyButton: { backgroundColor: '#ffb000', minHeight: 54, borderRadius: 15, padding: 16, alignItems: 'center', justifyContent: 'center' },
  verifyButtonText: { color: '#111', fontWeight: '700', fontSize: 16, textAlign: 'center' },
  cancelButton: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelButtonText: { color: '#b8b8c0', fontWeight: '600', fontSize: 16 },
});
