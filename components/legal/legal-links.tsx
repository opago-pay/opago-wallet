import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { useColorMode } from '@/hooks/useColorMode';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { OPAGO_LINKS, OPAGO_OPERATOR } from '@/lib/legal-links';
import { themeColor } from '@/lib/theme-styles';

type LinkId = keyof typeof OPAGO_LINKS;
type Props = { variant?: 'section' | 'footer' | 'help'; disabled?: boolean; embedded?: boolean };

export function LegalLinks({ variant = 'section', disabled = false, embedded = false }: Props) {
  const { mode } = useColorMode();
  useLanguage();
  const [opening, setOpening] = useState<LinkId | null>(null);
  const compact = variant !== 'section';
  const unavailable = disabled || opening !== null;
  const links: { id: LinkId; label: string; detail?: string }[] = [
    { id: 'contact', label: t('Contact support') },
    { id: 'support', label: t('Support portal'), detail: t('Sign-in required') },
    { id: 'privacy', label: t('Privacy policy') },
    { id: 'imprint', label: t('Imprint') },
    { id: 'terms', label: t('Terms and conditions') },
  ];
  const visibleLinks = links.filter(link => variant === 'section'
    || (variant === 'help' ? link.id === 'contact' || link.id === 'privacy' : link.id !== 'support'));

  async function openLink(id: LinkId) {
    if (unavailable) return;
    setOpening(id);
    try {
      await Linking.openURL(OPAGO_LINKS[id]);
    } catch {
      Alert.alert(t('Could not open this page'), t('Please try again.'));
    } finally {
      setOpening(null);
    }
  }

  return (
    <View style={compact ? styles.footer : [styles.section, { borderColor: themeColor('border', mode) }, embedded && styles.embedded]}>
      {!compact && <>
        {!embedded && <Text style={[styles.title, { color: themeColor('text', mode) }]} accessibilityRole="header">{t('Help and legal')}</Text>}
        <Text style={[styles.operator, { color: themeColor('secondary', mode) }]}>{t('Operated by {company}', { company: OPAGO_OPERATOR })}</Text>
      </>}
      <View style={compact ? styles.inlineLinks : styles.rows}>
        {visibleLinks.map(link => (
          <TouchableOpacity
            key={link.id}
            accessibilityRole="link"
            accessibilityLabel={link.detail ? `${link.label}. ${link.detail}` : link.label}
            accessibilityHint={t('Opens in your browser')}
            accessibilityState={{ disabled: unavailable, busy: opening === link.id }}
            disabled={unavailable}
            onPress={() => void openLink(link.id)}
            style={[
              compact ? styles.inlineLink : [styles.row, { backgroundColor: themeColor('surface', mode), borderColor: themeColor('border', mode) }],
              unavailable && styles.disabled,
            ]}
          >
            <View style={!compact && styles.labelGroup}>
              <Text style={[compact ? styles.inlineLabel : styles.label, { color: themeColor(compact ? 'accentText' : 'text', mode) }]}>{link.label}</Text>
              {!!link.detail && <Text style={[styles.detail, { color: themeColor('secondary', mode) }]}>{link.detail}</Text>}
            </View>
            {!compact && <Ionicons name="open-outline" size={19} color={themeColor('secondary', mode)} accessible={false} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 32, paddingTop: 28, borderTopWidth: 1 },
  embedded: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  title: { fontSize: 20, fontWeight: '600' },
  operator: { fontSize: 15, lineHeight: 23, marginTop: 8, marginBottom: 16 },
  rows: { gap: 8 },
  row: { minHeight: 56, padding: 16, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  labelGroup: { flex: 1 },
  label: { fontSize: 16, lineHeight: 24 },
  detail: { fontSize: 14, lineHeight: 21, marginTop: 4 },
  footer: { marginTop: 16, alignSelf: 'stretch' },
  inlineLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 4 },
  inlineLink: { minHeight: 48, minWidth: 48, maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 12, justifyContent: 'center' },
  inlineLabel: { fontSize: 14, lineHeight: 22, textAlign: 'center', textDecorationLine: 'underline' },
  disabled: { opacity: 0.5 },
});
