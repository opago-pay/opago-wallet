import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaymentBackButton } from './payment-back-button';
import { appLocale, t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { Ionicons } from '@expo/vector-icons';
import { AssetIcon } from '@/components/ui/asset-icon';
import { appConfig } from '@/lib/config';
import { sendStyles as styles } from '@/styles/send-styles';
import type { PendingLightningPayment } from './types';

export function LightningReviewView(props: {
  payment: PendingLightningPayment;
  loading: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  useLanguage();
  const insets = useSafeAreaInsets();
  const [showDetails, setShowDetails] = useState(false);
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
          name={appConfig.isMainnet ? 'shield-checkmark' : 'flask-outline'}
          size={16}
          color={appConfig.isMainnet ? '#49d17d' : '#b7a8ff'}
        />
        <Text style={styles.networkPillText}>
          Bitcoin · {appConfig.isMainnet ? 'LIGHTNING' : t('TEST MODE')}
        </Text>
      </View>
      <AssetIcon asset="lightning" size={58} />
      <Text style={styles.paymentEyebrow}>{t("LIGHTNING PAYMENT")}</Text>
      <Text style={styles.amountHero}>{props.payment.amountSats.toLocaleString(appLocale())} SAT</Text>
      <Text style={[styles.subtitle, styles.centerText]}>{props.payment.recipientLabel}</Text>

      <View style={styles.quoteBox}>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>{t("Amount")}</Text>
          <Text style={styles.quoteValue}>{props.payment.amountSats.toLocaleString(appLocale())} SAT</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>{t("Network")}</Text>
          <Text style={styles.quoteValue}>
            {appConfig.isMainnet ? 'Bitcoin Lightning' : t('Lightning test network')}
          </Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>{t("Maximum network fee")}</Text>
          <Text style={styles.quoteValue}>
            {t('Up to {amount} SAT', { amount: props.payment.maxFeeSats.toLocaleString(appLocale()) })}
          </Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>{t("Maximum total")}</Text>
          <Text style={styles.quoteValue}>
            {(props.payment.amountSats + props.payment.maxFeeSats).toLocaleString(appLocale())} SAT
          </Text>
        </View>
      </View>

      <View style={styles.safetyNote}>
        <Ionicons name="lock-closed-outline" size={17} color="#f2b45d" />
        <Text style={styles.safetyText}>
          {t("Check the amount. Bitcoin payments cannot be reversed.")}</Text>
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
        <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color="#9b9ba7" />
      </TouchableOpacity>

      {showDetails && (
        <View style={styles.technicalDetails}>
          <Text style={styles.label}>{t("Payment reference")}</Text>
          <Text style={styles.proofText} selectable>
            ln:{props.payment.invoice.paymentHash}
          </Text>
          {props.payment.invoice.expiresAt !== null && (
            <>
              <Text style={[styles.label, styles.detailsLabel]}>{t("Request expires")}</Text>
              <Text style={styles.proofText}>
                {new Date(props.payment.invoice.expiresAt).toLocaleTimeString(appLocale())}
              </Text>
            </>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, styles.fullWidthButton, props.loading && styles.buttonDisabled]}
        onPress={props.onConfirm}
        disabled={props.loading}
        accessibilityLabel={t('Send {amount} satoshis', { amount: props.payment.amountSats })}
      >
        {props.loading ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text style={styles.buttonText}>{t('Send {amount} satoshis', { amount: props.payment.amountSats.toLocaleString(appLocale()) })}</Text>
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

export function LightningSuccessView(props: {
  amountSats: number;
  reference: string;
  onDashboard(): void;
  onReset(): void;
}) {
  useLanguage();
  const [showDetails, setShowDetails] = useState(false);
  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={[styles.formContent, styles.centered]}
    >
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={50} color="#49d17d" accessibilityLabel={t("Confirmed")} />
      </View>
      <Text style={styles.successTitle}>{t("Payment sent")}</Text>
      <Text style={styles.successAmount}>{props.amountSats.toLocaleString(appLocale())} SAT</Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        {t("Complete on Lightning. It is now saved in your activity.")}</Text>
      <View style={styles.successSummary}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#49d17d" />
        <Text style={styles.successSummaryText}>{t("Payment confirmed")}</Text>
      </View>
      <TouchableOpacity style={[styles.button, styles.fullWidthButton]} onPress={props.onDashboard}>
        <Text style={styles.buttonText}>{t("Done")}</Text>
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
        <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color="#9b9ba7" />
      </TouchableOpacity>
      {showDetails && (
        <View style={styles.technicalDetails}>
          <Text style={styles.label}>{t("Payment reference")}</Text>
          <Text style={styles.proofText} selectable>{props.reference}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.textButton} onPress={props.onReset}>
        <Text style={styles.textButtonText}>{t("Send another payment")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
