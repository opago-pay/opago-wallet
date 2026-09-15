import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AssetIcon } from '@/components/ui/asset-icon';
import { appConfig } from '@/lib/config';
import type { PendingSolanaPayment, SolanaTransferResult } from './types';
import { sendStyles as styles } from '@/styles/send-styles';
import { compactWalletIdentifier } from '@/lib/wallet-display';

export function SolanaReviewView(props: {
  payment: PendingSolanaPayment;
  sourceAddress: string;
  loading: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const iconAsset = props.payment.asset === 'SOL' ? 'solana' : 'usdc';
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
          {props.payment.asset} · {appConfig.isMainnet ? 'MAINNET' : 'DEVNET'}
        </Text>
      </View>
      <AssetIcon asset={iconAsset} size={58} />
      <Text style={styles.paymentEyebrow}>PAYMENT</Text>
      <Text style={styles.amountHero}>
        {props.payment.amountDisplay} {props.payment.asset}
      </Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        To {compactWalletIdentifier(props.payment.recipientAddress)}
      </Text>
      <View style={styles.quoteBox}>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Asset</Text>
          <Text style={styles.quoteValue}>{props.payment.asset}</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Recipient</Text>
          <Text style={styles.quoteValue}>{compactWalletIdentifier(props.payment.recipientAddress)}</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Network</Text>
          <Text style={styles.quoteValue}>Solana {appConfig.isMainnet ? 'Mainnet' : 'Devnet'}</Text>
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
            <Text style={styles.quoteValue} selectable>{props.sourceAddress}</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>To</Text>
            <Text style={styles.quoteValue} selectable>{props.payment.recipientAddress}</Text>
          </View>
          {props.payment.request?.label && (
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Label</Text>
              <Text style={styles.quoteValue}>{props.payment.request.label}</Text>
            </View>
          )}
          {props.payment.request?.memo && (
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Memo</Text>
              <Text style={styles.quoteValue}>{props.payment.request.memo}</Text>
            </View>
          )}
          {props.payment.request?.message && (
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Message</Text>
              <Text style={styles.quoteValue}>{props.payment.request.message}</Text>
            </View>
          )}
        </View>
      )}
      <TouchableOpacity
        style={[styles.button, styles.fullWidthButton, props.loading && styles.buttonDisabled]}
        onPress={props.onConfirm}
        disabled={props.loading}
        accessibilityRole="button"
        accessibilityLabel={`Sign and send ${props.payment.amountDisplay} ${props.payment.asset} on Solana`}
      >
        {props.loading
          ? <ActivityIndicator color="#111" />
          : <Text style={styles.buttonText}>
              Send {props.payment.amountDisplay} {props.payment.asset}
            </Text>}
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

export function SolanaSuccessView(props: {
  result: SolanaTransferResult;
  onOpenExplorer(): void;
  onDashboard(): void;
  onReset(): void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={[styles.formContent, styles.centered]}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={50} color="#49d17d" accessibilityLabel="Confirmed" />
      </View>
      <Text style={styles.successTitle}>Payment sent</Text>
      <Text style={styles.successAmount}>
        {props.result.amountDisplay} {props.result.asset}
      </Text>
      <Text style={[styles.subtitle, styles.centerText]}>
        Complete on Solana. It is now saved in your activity.
      </Text>
      <View style={styles.successSummary}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#49d17d" />
        <Text style={styles.successSummaryText}>Confirmed by Solana</Text>
      </View>
      <TouchableOpacity style={[styles.button, styles.fullWidthButton]} onPress={props.onDashboard}>
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
        onPress={props.onOpenExplorer}
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
          <Text style={styles.label}>Transaction signature</Text>
          <Text style={styles.proofText} selectable>{props.result.signature}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.textButton} onPress={props.onReset}>
        <Text style={styles.textButtonText}>Send another payment</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
