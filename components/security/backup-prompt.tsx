import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity, WalletActivityBoundary } from '@/components/ui/wallet-interaction';
import { useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';

export function BackupPrompt() {
  useLanguage();
  const router = useRouter();
  const { walletReady, backupStatus, beginBackup, deferBackup } = useWalletAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  function defer() {
    Alert.alert(t('Continue without a checked backup?'), t('If this device is lost, damaged, or its protected keys become inaccessible, you may permanently lose access to your money. Opago cannot recover your words.'), [
      { text: t('Back'), style: 'cancel' },
      { text: t('I understand — back up later'), onPress: () => {
        setSaving(true);
        void deferBackup().catch(() => setError(t('Could not save your choice. Please try again.'))).finally(() => setSaving(false));
      } },
    ]);
  }
  return (
    <Modal visible={walletReady && backupStatus === 'required'} animationType="fade" transparent onRequestClose={() => undefined}>
      <WalletActivityBoundary style={styles.overlay}><ScrollView style={styles.card} contentContainerStyle={styles.cardContent}>
        <Text style={styles.title}>{t("Protect your wallet first.")}</Text>
        <Text style={styles.body}>{t("Your recovery words are the only way to restore this wallet. Write them down in order, keep them offline, then check three words before adding money.")}</Text>
        <TouchableOpacity accessibilityRole="button" style={styles.button} disabled={saving} onPress={() => { beginBackup(); router.replace('/(tabs)/settings'); }}>
          <Text style={styles.buttonText}>{t("Back up my wallet")}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.secondary} disabled={saving} onPress={defer}>
          <Text style={styles.body}>{t("Back up later")}</Text>
        </TouchableOpacity>
        {!!error && <Text style={styles.body} accessibilityRole="alert">{error}</Text>}
      </ScrollView></WalletActivityBoundary>
    </Modal>
  );
}

export function BackupStatusNotice() {
  useLanguage();
  const { error, isInitializing, loadOrGenerateWallet } = useWalletAuth();
  useEffect(() => {
    if (!error && !isInitializing) void loadOrGenerateWallet().catch(() => undefined);
  }, [error, isInitializing, loadOrGenerateWallet]);
  return <View accessibilityLiveRegion="polite">
    {!error && <ActivityIndicator color="#ffb000" />}
    <Text style={styles.body}>{t(error ? 'Backup status could not be loaded.' : 'Loading backup status…')}</Text>
    {!!error && <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => void loadOrGenerateWallet().catch(() => undefined)}>
      <Text style={styles.reminderTitle}>{t('Try again')}</Text>
    </TouchableOpacity>}
  </View>;
}

export function BackupReminder() {
  useLanguage();
  const { backupStatus, beginBackup } = useWalletAuth();
  const router = useRouter();
  if (backupStatus === 'loading' || backupStatus === 'verified') return null;
  return (
    <TouchableOpacity accessibilityRole="button" style={styles.reminder} onPress={() => { beginBackup(); router.push('/(tabs)/settings'); }}>
      <Text style={styles.reminderTitle}>{t("Back up your wallet")}</Text>
      <Text style={styles.body}>{t("Your recovery backup has not been checked. Protect access to your money.")}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: '#000b', padding: 24 },
  card: { backgroundColor: '#16161a', borderRadius: 24, flexGrow: 0, maxHeight: '100%' },
  cardContent: { padding: 24 },
  title: { color: '#fff', fontSize: 27, fontWeight: '700' },
  body: { color: '#b5b5bf', fontSize: 15, lineHeight: 23, marginTop: 10 },
  button: { backgroundColor: '#ffb000', borderRadius: 16, minHeight: 56, justifyContent: 'center', alignItems: 'center', padding: 16, marginTop: 24 },
  buttonText: { color: '#111', fontWeight: '700', fontSize: 16 },
  secondary: { padding: 12, alignItems: 'center' },
  reminder: { borderColor: '#6b541b', borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 20 },
  reminderTitle: { color: '#ffb000', fontSize: 17, fontWeight: '700' },
});
