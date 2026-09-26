import { adaptColor, themeColor } from '@/lib/theme-styles';
import { useColorMode } from '@/hooks/useColorMode';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaymentBackButton } from './payment-back-button';
import { appLocale, t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { Ionicons } from '@expo/vector-icons';
import { AssetIcon } from '@/components/ui/asset-icon';
import {
  formatTinybars,
  type HederaTransferResult,
} from '@/lib/hedera/payments';
import {
  getHederaPaymentFeeCeilingTinybars,
  HEDERA_NETWORK,
  HEDERA_NETWORK_BADGE,
  HEDERA_NETWORK_LABEL,
} from '@/lib/hedera/config';
import { sendStyles as styles } from '@/styles/send-styles';
import type { PendingHederaPayment } from './types';

export function HederaReviewView(props: {
  payment: PendingHederaPayment;
  sourceAccountId: string;
  loading: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  useLanguage();
  useColorMode();
  const insets = useSafeAreaInsets();
  const [showDetails, setShowDetails] = useState(false);
  const feeCeilingTinybars = getHederaPaymentFeeCeilingTinybars(
    props.payment.checkoutRequest ? 'checkout' : 'direct',
  );
  return (
    <View style={styles.scrollContainer}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
        <PaymentBackButton onPress={props.onCancel} disabled={props.loading} label={t("Back to payment details")} />
      </View>
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={[styles.formContent, styles.centered, { paddingTop: 8 }]}
    >
      <View style={styles.networkPill}>
        <Ionicons
          name={HEDERA_NETWORK === 'mainnet' ? 'shield-checkmark' : 'flask-outline'}
          size={16}
          color={themeColor(HEDERA_NETWORK === 'mainnet' ? 'successText' : 'testnetText')}
        />
        <Text style={styles.networkPillText}>HBAR · {HEDERA_NETWORK_BADGE}</Text>
      </View>
      <AssetIcon asset="hedera" size={58} />
      <Text style={styles.paymentEyebrow}>
        {props.payment.checkoutRequest ? t('MERCHANT PAYMENT') : t('HBAR TRANSFER')}
      </Text>
      <Text style={styles.amountHero}>{props.payment.amountHbar} HBAR</Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        {t("To")} {props.payment.recipientAccountId}
      </Text>
      <View style={styles.quoteBox}>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>{t("Recipient")}</Text>
          <Text style={styles.quoteValue}>
            {props.payment.recipientAccountId}
          </Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>{t("Network")}</Text>
          <Text style={styles.quoteValue}>{HEDERA_NETWORK_LABEL}</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>{t("Maximum fee")}</Text>
          <Text style={styles.quoteValue}>
            {t("Up to")} {formatTinybars(feeCeilingTinybars)} HBAR
          </Text>
        </View>
      </View>

      {props.payment.checkoutRequest && (
        <Text style={[styles.subtitle, styles.centerText]}>{t("This request does not verify the merchant’s identity. Confirm the recipient with the merchant.")}</Text>
      )}
      <View style={styles.safetyNote}>
        <Ionicons name="lock-closed-outline" size={17} color={adaptColor('#f2b45d', 'color')} />
        <Text style={styles.safetyText}>
          {t("Check the amount and recipient. Crypto payments cannot be reversed.")}</Text>
      </View>

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
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>{t("From")}</Text>
            <Text style={styles.quoteValue} selectable>{props.sourceAccountId}</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>{t("To")}</Text>
            <Text style={styles.quoteValue} selectable>{props.payment.recipientAccountId}</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>{t("Payment type")}</Text>
            <Text style={styles.quoteValue}>
              {props.payment.checkoutRequest ? t('Opago checkout') : t('Direct transfer')}
            </Text>
          </View>
          {props.payment.checkoutRequest && (
            <>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>{t("Contract")}</Text>
              <Text style={styles.quoteValue} selectable>{props.payment.checkoutRequest.contractId}</Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>{t("Payment ID")}</Text>
              <Text style={styles.quoteValue} selectable numberOfLines={2}>
                {props.payment.checkoutRequest.paymentId}
              </Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>{t("Expires")}</Text>
              <Text style={styles.quoteValue}>
                {new Date(props.payment.checkoutRequest.expiresAt * 1000).toLocaleTimeString(appLocale())}
              </Text>
            </View>
            </>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, styles.fullWidthButton, props.loading && styles.buttonDisabled]}
        onPress={props.onConfirm}
        disabled={props.loading}
        accessibilityLabel={t('Send {amount} HBAR', { amount: props.payment.amountHbar })}
      >
        {props.loading ? (
          <ActivityIndicator color={adaptColor('#111', 'color')} />
        ) : (
          <Text style={styles.buttonText}>{t('Send {amount} HBAR', { amount: props.payment.amountHbar })}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
        onPress={props.onCancel}
        disabled={props.loading}
      >
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>{t("Go back")}</Text>
      </TouchableOpacity>
    </ScrollView>
    </View>
  );
}

export function HederaSuccessView(props: {
  result: HederaTransferResult;
  onOpenHashscan(): void;
  onOpenContract?(): void;
  onDashboard(): void;
  onReset(): void;
}) {
  useLanguage();
  useColorMode();
  const [showDetails, setShowDetails] = useState(false);
  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={[styles.formContent, styles.centered]}
    >
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={50} color={adaptColor('#49d17d', 'color')} accessibilityLabel={t("Confirmed")} />
      </View>
      <Text style={styles.successTitle}>{t("Payment sent")}</Text>
      <Text style={styles.successAmount}>{props.result.amountHbar} HBAR</Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        {t('Complete on {network}. It is now saved in your activity.', { network: HEDERA_NETWORK_LABEL })}
      </Text>
      <View style={styles.successSummary}>
        <Ionicons name="shield-checkmark-outline" size={19} color={adaptColor('#49d17d', 'color')} />
        <Text style={styles.successSummaryText}>{t("Confirmed by Hedera")}</Text>
      </View>

      <TouchableOpacity style={[styles.button, styles.fullWidthButton]} onPress={props.onDashboard}>
        <Text style={styles.buttonText}>{t("Done")}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
        onPress={props.onOpenHashscan}
        accessibilityRole="link"
      >
        <View style={styles.buttonContent}>
          <Ionicons name="receipt-outline" size={18} color={adaptColor('#fff', 'color')} />
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>{t("View receipt")}</Text>
        </View>
      </TouchableOpacity>

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
          <Text style={styles.label}>{t("Transaction ID")}</Text>
          <Text style={styles.proofText} selectable>{props.result.transactionId}</Text>
          {props.result.paymentId && (
            <>
              <Text style={[styles.label, styles.detailsLabel]}>{t("Payment ID")}</Text>
              <Text style={styles.proofText} selectable>{props.result.paymentId}</Text>
            </>
          )}
        </View>
      )}
      {showDetails && props.result.contractHashscanUrl && props.onOpenContract && (
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
          onPress={props.onOpenContract}
        >
          <View style={styles.buttonContent}>
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>{t("View smart contract")}</Text>
            <Ionicons name="open-outline" size={18} color={adaptColor('#fff', 'color')} />
          </View>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.textButton}
        onPress={props.onReset}
      >
        <Text style={styles.textButtonText}>{t("Send another payment")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
