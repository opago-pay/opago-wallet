import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { useSecurityPreferences } from '@/hooks/useSecurityPreferences';
import { t } from '@/lib/i18n';
import { changeOpeningAuthentication } from '@/lib/storage';
import { authorizeWalletAction, withProtectedWalletAccess } from '@/lib/device-authentication';
import { adaptiveStyles, themeColor } from '@/lib/theme-styles';

function SecuritySwitch({ title, description, value, busy, onPress }: {
  title: string; description: string; value: boolean; busy: boolean; onPress(): void;
}) {
  return <TouchableOpacity
    accessibilityRole="switch" accessibilityLabel={title}
    accessibilityState={{ checked: value, disabled: busy, busy }}
    disabled={busy} onPress={onPress} style={styles.row}>
    <View style={styles.copy}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
    {busy ? <ActivityIndicator color={themeColor('accentText')} /> :
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.thumb, value && styles.thumbOn]} />
      </View>}
  </TouchableOpacity>;
}

export function SecurityOptions() {
  const { lockOnOpen, authenticatePayments, setPreferences } = useSecurityPreferences();
  const [saving, setSaving] = useState(false);

  async function changeOpening() {
    if (saving) return;
    setSaving(true);
    try { await withProtectedWalletAccess(() => changeOpeningAuthentication(!lockOnOpen)); }
    catch { Alert.alert(t('Security setting not saved'), t('Please try again.')); }
    finally { setSaving(false); }
  }

  async function changePayments() {
    if (saving) return;
    setSaving(true);
    try {
      if (authenticatePayments) {
        const assertAuthorized = await authorizeWalletAction('Change payment authentication', { allowDeviceCredential: true });
        assertAuthorized();
      }
      await setPreferences({ authenticatePayments: !authenticatePayments });
    }
    catch { Alert.alert(t('Security setting not saved'), t('Please try again.')); }
    finally { setSaving(false); }
  }

  return <View style={styles.options}>
    <SecuritySwitch title={t('Biometrics or device PIN when opening Opago')}
      description={t('Ask for device authentication each time you open or return to Opago.')}
      value={lockOnOpen} busy={saving} onPress={() => void changeOpening()} />
    <SecuritySwitch title={t('Biometrics or device PIN when paying')}
      description={t('Ask again before sending a payment. You always review the payment first.')}
      value={authenticatePayments} busy={saving} onPress={() => void changePayments()} />
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  options: { marginTop: 12, gap: 10 },
  row: { minHeight: 80, borderWidth: 1, borderColor: '#39393e', backgroundColor: '#151518', borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  copy: { flex: 1 },
  title: { color: '#fff', fontSize: 15, fontWeight: '600', lineHeight: 21 },
  description: { color: '#aaaab3', fontSize: 13, lineHeight: 19, marginTop: 4 },
  track: { width: 46, height: 28, borderRadius: 14, backgroundColor: '#505053', justifyContent: 'center', padding: 3 },
  trackOn: { backgroundColor: '#ffb000' },
  thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  thumbOn: { alignSelf: 'flex-end' },
}));
