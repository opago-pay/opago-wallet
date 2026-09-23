import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Keyboard, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { t } from '@/lib/i18n';
import { markNavigationStart } from '@/lib/performance-trace';

/** Leave a wallet screen without clearing its saved payment/request state. */
export function CloseWalletScreen({ disabled = false, style }: { disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  return <TouchableOpacity
    onPress={() => { markNavigationStart('home'); Keyboard.dismiss(); router.replace('/(tabs)'); }}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={t('Home')}
    accessibilityState={{ disabled }}
    style={[styles.button, style, disabled && { opacity: 0.4 }]}
  >
    <Ionicons name="close" size={26} color={adaptColor('#fff', 'color')} />
  </TouchableOpacity>;
}

const styles = adaptiveStyles(StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1b1b20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
}));
