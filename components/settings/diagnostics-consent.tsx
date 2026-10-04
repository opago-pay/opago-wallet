import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { useLanguage } from '@/hooks/useLanguage';
import { diagnosticsConsent } from '@/lib/diagnostics-consent';
import { t } from '@/lib/i18n';
import { adaptiveStyles } from '@/lib/theme-styles';

export function DiagnosticsConsentPanel() {
  useLanguage();
  const { ready, granted } = useSyncExternalStore(
    diagnosticsConsent.subscribe, diagnosticsConsent.getSnapshot, diagnosticsConsent.getSnapshot,
  );
  const [saving, setSaving] = useState(false);
  useEffect(() => { void diagnosticsConsent.initialize(); }, []);

  async function change(enabled: boolean) {
    if (saving || !ready) return;
    setSaving(true);
    try { await diagnosticsConsent.setGranted(enabled); }
    catch { Alert.alert(t('Selection not saved'), t('Please try again. Your previous choice may still apply after restarting the app.')); }
    finally { setSaving(false); }
  }

  return <View style={styles.card}>
    <Text style={styles.title} accessibilityRole="header">{t('Optional error reports')}</Text>
    <Text style={styles.body}>{t('If you agree, Opago sends filtered app errors and crashes to Sentry to improve stability. Reports can contain the app version, device and operating-system details, and your IP address. Sentry stores error events in the EU for 30 days. Wallet keys and payment details are filtered before sending. The wallet works without error reports.')}</Text>
    <Text style={styles.body}>{t('You can withdraw your choice here at any time. This stops future error reporting; reports already sent cannot be recalled.')}</Text>
    <Text style={styles.status}>{ready ? (granted ? t('Error reports are on') : t('Error reports are off')) : t('Loading your choice…')}</Text>
    <View style={styles.actions}>
      <TouchableOpacity style={[styles.button, granted ? styles.secondary : styles.primary]} accessibilityRole="button"
        accessibilityState={{ disabled: !ready || saving, selected: granted }} disabled={!ready || saving}
        onPress={() => void change(true)}>
        <Text style={[styles.buttonText, !granted && styles.primaryButtonText]}>{t('Allow error reports')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondary]} accessibilityRole="button"
        accessibilityState={{ disabled: !ready || saving, selected: ready && !granted }} disabled={!ready || saving}
        onPress={() => void change(false)}>
        <Text style={styles.buttonText}>{t('Keep error reports off')}</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  card: { padding: 20, borderRadius: 20, backgroundColor: '#151518', borderWidth: 1, borderColor: '#2d2d31', gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff' },
  body: { fontSize: 15, lineHeight: 23, color: '#c5c5cb' },
  status: { fontSize: 14, fontWeight: '600', color: '#ffb000' },
  actions: { gap: 10 },
  button: { minHeight: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', padding: 12 },
  primary: { backgroundColor: '#ffb000' },
  secondary: { backgroundColor: '#28282d', borderWidth: 1, borderColor: '#45454a' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  primaryButtonText: { color: '#15150e' },
}));
