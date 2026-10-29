import type { PropsWithChildren } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity, TextInput } from '../ui/wallet-interaction';
import { CloseWalletScreen } from '../navigation/close-wallet-screen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorMode } from '../../hooks/useColorMode';
import { useLanguage } from '../../hooks/useLanguage';
import { themeColor } from '../../lib/theme-styles';
import { t } from '../../lib/i18n';
export { TextInput };
export function OpagoPage({ title, children, busy, error, testOnly }: PropsWithChildren<{ title: string; busy: boolean; error: string; testOnly: boolean }>) {
  const insets = useSafeAreaInsets(); useColorMode(); useLanguage();
  return <ScrollView style={{ backgroundColor: themeColor('canvas') }} keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, gap: 18 }}>
    <View style={ui.header}><Text style={[ui.title, { color: themeColor('text') }]} accessibilityRole="header">{t(title)}</Text><CloseWalletScreen /></View>
    {testOnly && <Copy warning>{t('Contract test mode: synthetic data and simulated payments. No funds are transferred.')}</Copy>}
    {busy && <ActivityIndicator color={themeColor('accentText')} accessibilityLabel={t('Processing')} />}
    {!!error && <Text accessibilityRole="alert" style={{ color: themeColor('errorText'), fontSize: 16 }}>{t(error)}</Text>}
    {children}
  </ScrollView>;
}
export function Card({ title, children }: PropsWithChildren<{ title: string }>) {
  return <View style={[ui.card, { backgroundColor: themeColor('surface'), borderColor: themeColor('border') }]}>
    <Text accessibilityRole="header" style={[ui.heading, { color: themeColor('text') }]}>{t(title)}</Text>{children}
  </View>;
}
export function Copy({ children, warning = false }: PropsWithChildren<{ warning?: boolean }>) {
  return <Text style={{ color: themeColor(warning ? 'warningText' : 'secondary'), fontSize: 16, lineHeight: 24 }}>{children}</Text>;
}
export function Action({ label, onPress, disabled = false, destructive = false }: { label: string; onPress(): void; disabled?: boolean; destructive?: boolean }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
    style={[ui.button, { backgroundColor: themeColor('raised'), opacity: disabled ? 0.45 : 1 }]}>
    <Text style={{ color: themeColor(destructive ? 'errorText' : 'accentText'), fontSize: 17, fontWeight: '600' }}>{t(label)}</Text>
  </TouchableOpacity>;
}
export const ui = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', flex: 1 }, heading: { fontSize: 20, fontWeight: '600' },
  card: { padding: 18, borderRadius: 18, borderWidth: 1, gap: 12 },
  button: { minHeight: 48, padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 18 },
});
