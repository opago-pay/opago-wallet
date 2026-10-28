import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useBitcoinOnly } from '@/hooks/useBitcoinOnly';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { adaptiveStyles, themeColor } from '@/lib/theme-styles';

export function BitcoinOnlyToggle({ disabled = false }: { disabled?: boolean }) {
  useLanguage();
  const { bitcoinOnly, ready, setBitcoinOnly } = useBitcoinOnly();
  const [saving, setSaving] = useState(false);
  const change = async (enabled: boolean) => {
    if (saving || disabled) return;
    setSaving(true);
    try { await setBitcoinOnly(enabled); }
    catch { Alert.alert(t('Setting not saved'), t('Please try again.')); }
    finally { setSaving(false); }
  };
  return <View style={styles.row}>
    <View style={styles.copy}>
      <Text style={styles.title}>Bitcoin Only</Text>
      <Text style={styles.detail}>{t('Show only Bitcoin and Lightning balances and payment options. All activity stays visible.')}</Text>
    </View>
    <Switch value={bitcoinOnly} onValueChange={enabled => void change(enabled)}
      disabled={!ready || saving || disabled} accessibilityLabel="Bitcoin Only"
      accessibilityHint={t('Show only Bitcoin and Lightning balances and payment options. All activity stays visible.')}
      trackColor={{ true: themeColor('accentText'), false: themeColor('muted') }} />
  </View>;
}
const styles = adaptiveStyles(StyleSheet.create({
  row: { padding: 16, minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#39393e' },
  copy: { flex: 1 }, title: { color: '#fff', fontSize: 16, fontWeight: '600', lineHeight: 23 },
  detail: { color: '#aaaab3', fontSize: 13, lineHeight: 20, marginTop: 3 },
}));
