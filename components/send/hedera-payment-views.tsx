import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
import { compactWalletIdentifier } from '@/lib/wallet-display';
import type { PendingHederaPayment } from './types';

export function HederaReviewView(props: {
  payment: PendingHederaPayment;
  sourceAccountId: string;
  loading: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const feeCeilingTinybars = getHederaPaymentFeeCeilingTinybars(
    props.payment.checkoutRequest ? 'checkout' : 'direct',
  );
  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={[styles.formContent, styles.centered]}
    >
      <View style={styles.networkPill}>
        <Ionicons
          name={HEDERA_NETWORK === 'mainnet' ? 'shield-checkmark' : 'flask-outline'}
          size={16}
          color={HEDERA_NETWORK === 'mainnet' ? '#49d17d' : '#b7a8ff'}
        />
        <Text style={styles.networkPillText}>HBAR · {HEDERA_NETWORK_BADGE}</Text>
      </View>
      <AssetIcon asset="hedera" size={58} />
      <Text style={styles.paymentEyebrow}>
        {props.payment.checkoutRequest ? 'MERCHANT PAYMENT' : 'HBAR TRANSFER'}
      </Text>
      <Text style={styles.amountHero}>{props.payment.amountHbar} HBAR</Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        To {compactWalletIdentifier(props.payment.recipientAccountId)}
      </Text>
      <View style={styles.quoteBox}>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Recipient</Text>
          <Text style={styles.quoteValue}>
            {compactWalletIdentifier(props.payment.recipientAccountId)}
          </Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Network</Text>
          <Text style={styles.quoteValue}>{HEDERA_NETWORK_LABEL}</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Maximum fee</Text>
          <Text style={styles.quoteValue}>
            Up to {formatTinybars(feeCeilingTinybars)} HBAR
          </Text>
        </View>
      </View>

      <View style={styles.safetyNote}>
        <Ionicons name="lock-closed-outline" size={17} color="#f2b45d" />
        <Text style={styles.safetyText}>
          Check the amount and recipient. Crypto payments cannot be reversed.
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
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>From</Text>
            <Text style={styles.quoteValue} selectable>{props.sourceAccountId}</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>To</Text>
            <Text style={styles.quoteValue} selectable>{props.payment.recipientAccountId}</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Payment type</Text>
            <Text style={styles.quoteValue}>
              {props.payment.checkoutRequest ? 'Opago checkout' : 'Direct transfer'}
            </Text>
          </View>
          {props.payment.checkoutRequest && (
            <>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Contract</Text>
              <Text style={styles.quoteValue} selectable>{props.payment.checkoutRequest.contractId}</Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Payment ID</Text>
              <Text style={styles.quoteValue} selectable numberOfLines={2}>
                {props.payment.checkoutRequest.paymentId}
              </Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Expires</Text>
              <Text style={styles.quoteValue}>
                {new Date(props.payment.checkoutRequest.expiresAt * 1000).toLocaleTimeString()}
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
        accessibilityLabel={`Send ${props.payment.amountHbar} HBAR`}
      >
        {props.loading ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text style={styles.buttonText}>Send {props.payment.amountHbar} HBAR</Text>
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

export function HederaSuccessView(props: {
  result: HederaTransferResult;
  onOpenHashscan(): void;
  onOpenContract?(): void;
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
      <Text style={styles.successAmount}>{props.result.amountHbar} HBAR</Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        Complete on {HEDERA_NETWORK_LABEL}. It is now saved in your activity.
      </Text>
      <View style={styles.successSummary}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#49d17d" />
        <Text style={styles.successSummaryText}>Confirmed by Hedera</Text>
      </View>

      <TouchableOpacity style={[styles.button, styles.fullWidthButton]} onPress={props.onDashboard}>
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
        onPress={props.onOpenHashscan}
        accessibilityRole="link"
      >
        <View style={styles.buttonContent}>
          <Ionicons name="receipt-outline" size={18} color="#fff" />
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>View receipt</Text>
        </View>
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
          <Text style={styles.label}>Transaction ID</Text>
          <Text style={styles.proofText} selectable>{props.result.transactionId}</Text>
          {props.result.paymentId && (
            <>
              <Text style={[styles.label, styles.detailsLabel]}>Payment ID</Text>
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
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>View smart contract</Text>
            <Ionicons name="open-outline" size={18} color="#fff" />
          </View>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.textButton}
        onPress={props.onReset}
      >
        <Text style={styles.textButtonText}>Send another payment</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
