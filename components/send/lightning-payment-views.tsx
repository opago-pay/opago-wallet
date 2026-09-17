import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
  const [showDetails, setShowDetails] = useState(false);
  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={[styles.formContent, styles.centered]}
    >
      <View style={styles.networkPill}>
        <Ionicons
          name={appConfig.isMainnet ? 'shield-checkmark' : 'flask-outline'}
          size={16}
          color={appConfig.isMainnet ? '#49d17d' : '#b7a8ff'}
        />
        <Text style={styles.networkPillText}>
          Bitcoin · {appConfig.isMainnet ? 'LIGHTNING' : 'TEST MODE'}
        </Text>
      </View>
      <AssetIcon asset="lightning" size={58} />
      <Text style={styles.paymentEyebrow}>LIGHTNING PAYMENT</Text>
      <Text style={styles.amountHero}>{props.payment.amountSats.toLocaleString()} SAT</Text>
      <Text style={[styles.subtitle, styles.centerText]}>{props.payment.recipientLabel}</Text>

      <View style={styles.quoteBox}>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Amount</Text>
          <Text style={styles.quoteValue}>{props.payment.amountSats.toLocaleString()} SAT</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Network</Text>
          <Text style={styles.quoteValue}>
            {appConfig.isMainnet ? 'Bitcoin Lightning' : 'Lightning test network'}
          </Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Network fee</Text>
          <Text style={styles.quoteValue}>
            {props.payment.estimatedFeeSats === null
              ? `Up to ${props.payment.maxFeeSats} SAT`
              : `${props.payment.estimatedFeeSats} SAT`}
          </Text>
        </View>
      </View>

      <View style={styles.safetyNote}>
        <Ionicons name="lock-closed-outline" size={17} color="#f2b45d" />
        <Text style={styles.safetyText}>
          Check the amount. Bitcoin payments cannot be reversed.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.detailsToggle}
        onPress={() => setShowDetails(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
      >
        <Text style={styles.detailsToggleText}>
          {showDetails ? 'Hide payment details' : 'Show payment details'}
        </Text>
        <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color="#9b9ba7" />
      </TouchableOpacity>

      {showDetails && (
        <View style={styles.technicalDetails}>
          <Text style={styles.label}>Payment reference</Text>
          <Text style={styles.proofText} selectable>
            ln:{props.payment.invoice.paymentHash}
          </Text>
          {props.payment.invoice.expiresAt !== null && (
            <>
              <Text style={[styles.label, styles.detailsLabel]}>Request expires</Text>
              <Text style={styles.proofText}>
                {new Date(props.payment.invoice.expiresAt).toLocaleTimeString()}
              </Text>
            </>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, styles.fullWidthButton, props.loading && styles.buttonDisabled]}
        onPress={props.onConfirm}
        disabled={props.loading}
        accessibilityLabel={`Send ${props.payment.amountSats} satoshis`}
      >
        {props.loading ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text style={styles.buttonText}>Send {props.payment.amountSats.toLocaleString()} SAT</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
        onPress={props.onCancel}
        disabled={props.loading}
      >
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Go back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export function LightningSuccessView(props: {
  amountSats: number;
  reference: string;
  onDashboard(): void;
  onReset(): void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={[styles.formContent, styles.centered]}
    >
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={50} color="#49d17d" accessibilityLabel="Confirmed" />
      </View>
      <Text style={styles.successTitle}>Payment sent</Text>
      <Text style={styles.successAmount}>{props.amountSats.toLocaleString()} SAT</Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        Complete on Lightning. It is now saved in your activity.
      </Text>
      <View style={styles.successSummary}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#49d17d" />
        <Text style={styles.successSummaryText}>Payment confirmed</Text>
      </View>
      <TouchableOpacity style={[styles.button, styles.fullWidthButton]} onPress={props.onDashboard}>
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.detailsToggle}
        onPress={() => setShowDetails(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
      >
        <Text style={styles.detailsToggleText}>
          {showDetails ? 'Hide payment details' : 'Show payment details'}
        </Text>
        <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color="#9b9ba7" />
      </TouchableOpacity>
      {showDetails && (
        <View style={styles.technicalDetails}>
          <Text style={styles.label}>Payment reference</Text>
          <Text style={styles.proofText} selectable>{props.reference}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.textButton} onPress={props.onReset}>
        <Text style={styles.textButtonText}>Send another payment</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
