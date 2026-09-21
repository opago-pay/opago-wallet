import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from './wallet-interaction';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';

export function AdvancedOptions({ expanded, onChange, disabled, children }: PropsWithChildren<{
  expanded: boolean;
  onChange(expanded: boolean): void;
  disabled?: boolean;
}>) {
  useLanguage();
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => onChange(!expanded)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('Advanced options')}
        accessibilityState={{ expanded, disabled: !!disabled }}
      >
        <Text style={styles.label}>{t('Advanced options')}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={19} color="#969987" />
      </TouchableOpacity>
      {expanded && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18, borderTopWidth: 1, borderTopColor: '#292d23' },
  toggle: { minHeight: 52, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { flex: 1, color: '#a3a69a', fontSize: 14, fontWeight: '500' },
  content: { paddingBottom: 8 },
});
