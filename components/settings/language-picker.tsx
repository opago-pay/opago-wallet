import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type AppLanguage } from '@/lib/i18n/language';

export function LanguagePicker({ embedded = false }: { embedded?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const [saving, setSaving] = useState<AppLanguage | null>(null);
  async function select(next: AppLanguage) {
    if (saving || next === language) return;
    setSaving(next);
    try { await setLanguage(next); }
    catch { Alert.alert(t('Language not saved'), t('Please try again.')); }
    finally { setSaving(null); }
  }
  return (
    <View style={[styles.section, embedded && styles.embedded]}>
      {!embedded && <Text style={styles.title} accessibilityRole="header">{t('Language')}</Text>}
      <Text style={styles.subtitle}>{t('Choose the language for Opago.')}</Text>
      <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={t('App language')}>
        {SUPPORTED_LANGUAGES.map(item => (
          <TouchableOpacity key={item} style={[styles.choice, item === language && styles.selected]} accessibilityRole="radio" accessibilityLabel={LANGUAGE_NAMES[item]} accessibilityLanguage={item} aria-checked={item === language} accessibilityState={{ checked: item === language, disabled: saving !== null, busy: saving === item }} disabled={saving !== null} onPress={() => void select(item)}>
            <Text style={[styles.name, item === language && styles.selectedText]}>{LANGUAGE_NAMES[item]}</Text>
            {saving === item ? <ActivityIndicator color={adaptColor('#ffb000', 'color')} /> : <Ionicons name={item === language ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={adaptColor(item === language ? '#ffb000' : '#666670', 'color')} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = adaptiveStyles(StyleSheet.create({
  section: { marginTop: 32, paddingTop: 28, borderTopWidth: 1, borderColor: '#28282c' },
  embedded: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  title: { color: '#fff', fontSize: 20, fontWeight: '600' },
  subtitle: { color: '#b8b8c0', fontSize: 15, lineHeight: 23, marginTop: 8, marginBottom: 16 },
  choices: { gap: 8 },
  choice: { borderWidth: 1, borderColor: '#39393e', borderRadius: 14, padding: 16, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#151518' },
  selected: { borderColor: '#96701c', backgroundColor: '#211c11' },
  name: { fontSize: 16, color: '#eeeef0', flex: 1 },
  selectedText: { color: '#ffca54', fontWeight: '600' },
}));
