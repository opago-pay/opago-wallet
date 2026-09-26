import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { useLanguage } from '@/hooks/useLanguage';
import { useColorMode } from '@/hooks/useColorMode';
import { t } from '@/lib/i18n';
import { adaptColor, adaptiveStyles, themeColor } from '@/lib/theme-styles';
import type { ColorMode } from '@/lib/color-mode';

export function ColorModePicker({ embedded = false }: { embedded?: boolean }) {
  useLanguage();
  const { mode, setMode } = useColorMode();
  const [saving, setSaving] = useState<ColorMode | null>(null);
  async function select(next: ColorMode) {
    if (saving || next === mode) return;
    setSaving(next);
    try { await setMode(next); }
    catch { Alert.alert(t('Appearance not saved'), t('Please try again.')); }
    finally { setSaving(null); }
  }
  return <View style={[styles.section, embedded && styles.embedded]}>
    {!embedded && <Text style={styles.title} accessibilityRole="header">{t('Appearance')}</Text>}
    <Text style={styles.subtitle}>{t('Choose a light or dark background.')}</Text>
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={t('Appearance')}>
      {(['light', 'dark'] as const).map(item => <TouchableOpacity
        key={item} style={[styles.choice, item === mode && styles.selected]}
        accessibilityRole="radio" accessibilityLabel={t(item === 'light' ? 'Day' : 'Night')}
        aria-checked={item === mode}
        accessibilityState={{ checked: item === mode, disabled: saving !== null, busy: saving === item }}
        disabled={saving !== null} onPress={() => void select(item)}
      >
          <Ionicons name={item === 'light' ? 'sunny-outline' : 'moon-outline'} size={21} color={item === mode ? themeColor('accentText') : adaptColor('#96969d', 'color')} />
        <Text style={[styles.choiceText, item === mode && styles.selectedText]}>{t(item === 'light' ? 'Day' : 'Night')}</Text>
        {saving === item ? <ActivityIndicator color={adaptColor('#ffb000', 'color')} /> :
          <Ionicons name={item === mode ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={item === mode ? themeColor('accentText') : adaptColor('#96969d', 'color')} />}
      </TouchableOpacity>)}
    </View>
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  section: { marginTop: 32, paddingTop: 28, borderTopWidth: 1, borderColor: '#28282c' },
  embedded: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  title: { color: '#fff', fontSize: 20, fontWeight: '600' },
  subtitle: { color: '#b8b8c0', fontSize: 15, lineHeight: 23, marginTop: 8, marginBottom: 16 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { flexGrow: 1, flexBasis: 140, minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: '#39393e', backgroundColor: '#151518', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 12 },
  selected: { borderColor: '#96701c', backgroundColor: '#211c11' },
  choiceText: { color: '#eeeef0', fontSize: 16, fontWeight: '600', flexShrink: 1 },
  selectedText: { color: '#ffb000' },
}));
