import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { t } from '@/lib/i18n';
import { sendStyles as styles } from '@/styles/send-styles';

export function PaymentBackButton({ onPress, disabled, label }: { onPress(): void; disabled: boolean; label: string }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
    style={[styles.backButton, disabled && { opacity: 0.4 }]}>
    <Ionicons name="arrow-back" size={22} color="#fff" />
    <Text style={styles.backButtonText}>{t('Back')}</Text>
  </TouchableOpacity>;
}
