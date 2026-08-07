import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import type { HederaTransferResult } from '@/lib/hedera/payments';
import { sendStyles as styles } from '@/styles/send-styles';
import type { PendingHederaPayment } from './types';

export function HederaReviewView(props: {
  payment: PendingHederaPayment;
  sourceAccountId: string;
  loading: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <View style={[styles.container, styles.centered]}>
      <View style={[styles.testnetBanner, { width: '100%' }]}>
        <Text style={styles.testnetTitle}>HEDERA TESTNET</Text>
        <Text style={styles.testnetText}>Review every detail before signing.</Text>
      </View>
      <Text style={styles.quoteTitle}>Confirm HBAR payment</Text>
      <View style={styles.quoteBox}>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Amount</Text>
          <Text style={styles.quoteValue}>{props.payment.amountHbar} HBAR</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>From</Text>
          <Text style={styles.quoteValue}>{props.sourceAccountId}</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>To</Text>
          <Text style={styles.quoteValue}>{props.payment.recipientAccountId}</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Network</Text>
          <Text style={styles.quoteValue}>Hedera testnet</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Route</Text>
          <Text style={styles.quoteValue}>
            {props.payment.checkoutRequest ? 'Opago checkout contract' : 'Direct transfer'}
          </Text>
        </View>
        {props.payment.checkoutRequest && (
          <>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Contract</Text>
              <Text style={styles.quoteValue}>{props.payment.checkoutRequest.contractId}</Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Payment ID</Text>
              <Text style={styles.quoteValue} numberOfLines={1}>
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
      <TouchableOpacity style={styles.button} onPress={props.onConfirm} disabled={props.loading}>
        {props.loading ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text style={styles.buttonText}>Sign and send test HBAR</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={props.onCancel}
        disabled={props.loading}
      >
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
      </TouchableOpacity>
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
  return (
    <View style={[styles.container, styles.centered]}>
      <View style={[styles.testnetBanner, { width: '100%' }]}>
        <Text style={styles.testnetTitle}>HEDERA TESTNET</Text>
      </View>
      <View style={styles.successCircle}><Text style={styles.checkmark}>OK</Text></View>
      <Text style={styles.successTitle}>HBAR sent</Text>
      <Text style={styles.subtitle}>
        {props.result.amountHbar} HBAR was confirmed on Hedera testnet.
      </Text>
      <View style={styles.proofBox}>
        <Text style={styles.label}>Transaction ID</Text>
        <Text style={styles.proofText} selectable>{props.result.transactionId}</Text>
      </View>
      {props.result.paymentId && (
        <View style={styles.proofBox}>
          <Text style={styles.label}>Checkout payment ID</Text>
          <Text style={styles.proofText} selectable>{props.result.paymentId}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.button} onPress={props.onOpenHashscan}>
        <Text style={styles.buttonText}>Open transaction in HashScan</Text>
      </TouchableOpacity>
      {props.result.contractHashscanUrl && props.onOpenContract && (
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={props.onOpenContract}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>
            Open checkout contract
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={props.onDashboard}
      >
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Return to dashboard</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={props.onReset}
      >
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Send another</Text>
      </TouchableOpacity>
    </View>
  );
}
