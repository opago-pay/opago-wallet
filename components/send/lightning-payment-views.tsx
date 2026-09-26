import { adaptColor } from '@/lib/theme-styles';
import { BitcoinButton, BitcoinReview } from '@/components/bitcoin/payment-ui';
import { BitcoinPaymentProgress } from '@/components/bitcoin/payment-progress';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { Ionicons } from '@expo/vector-icons';
import { sendStyles as styles } from '@/styles/send-styles';
import type { PendingLightningPayment } from './types';

export function LightningReviewView(props: {
  payment: PendingLightningPayment;
  loading: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  useLanguage();
  return <BitcoinReview amountSats={props.payment.amountSats} feeSats={props.payment.maxFeeSats}
    route="lightning" recipient={props.payment.invoice.invoice} label={props.payment.recipientLabel}
    expiresAt={props.payment.invoice.expiresAt} loading={props.loading} onConfirm={props.onConfirm} onCancel={props.onCancel} />;
}

export function LightningSuccessView(props: {
  amountSats: number;
  reference: string;
  onDashboard(): void;
  onReset(): void;
}) {
  useLanguage();
  const [showDetails, setShowDetails] = useState(false);
  return (
    <BitcoinPaymentProgress phase="success" amountSats={props.amountSats} onBack={props.onDashboard}
      footer={<BitcoinButton label={t('Done')} onPress={props.onDashboard} />}>
      <TouchableOpacity
        style={styles.detailsToggle}
        onPress={() => setShowDetails(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
      >
        <Text style={styles.detailsToggleText}>
          {showDetails ? t('Hide payment details') : t('Show payment details')}
        </Text>
        <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={adaptColor('#9b9ba7', 'color')} />
      </TouchableOpacity>
      {showDetails && (
        <View style={styles.technicalDetails}>
          <Text style={styles.label}>{t("Payment reference")}</Text>
          <Text style={styles.proofText} selectable>{props.reference}</Text>
        </View>
      )}
    </BitcoinPaymentProgress>
  );
}
