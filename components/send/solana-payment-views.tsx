import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AssetIcon } from '@/components/ui/asset-icon';
import { appConfig } from '@/lib/config';
import type { PendingSolanaPayment, SolanaTransferResult } from './types';
import { sendStyles as styles } from '@/styles/send-styles';

export function SolanaReviewView(props: {
  payment: PendingSolanaPayment;
  sourceAddress: string;
  loading: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  const iconAsset = props.payment.asset === 'SOL' ? 'solana' : 'usdc';
  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.formContent}>
      <View style={styles.testnetBanner}>
        <View style={styles.testnetBannerContent}>
          <AssetIcon asset={iconAsset} size={36} />
          <View>
            <Text style={styles.testnetTitle}>
              SOLANA {appConfig.isMainnet ? 'MAINNET' : 'DEVNET'}
            </Text>
            {!appConfig.isMainnet && (
              <Text style={styles.testnetText}>Test assets only. No real-world value.</Text>
            )}
          </View>
        </View>
      </View>
      <Text style={styles.quoteTitle}>Review Solana payment</Text>
      <Text style={styles.subtitle}>Verify the asset, exact amount, and recipient before signing.</Text>
      <View style={styles.quoteBox}>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Asset</Text>
          <Text style={styles.quoteValue}>{props.payment.asset}</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Amount</Text>
          <Text style={styles.quoteValue}>
            {props.payment.amountDisplay} {props.payment.asset}
          </Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>From</Text>
          <Text style={styles.quoteValue} selectable>{props.sourceAddress}</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Recipient</Text>
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
      <TouchableOpacity
        style={styles.button}
        onPress={props.onConfirm}
        disabled={props.loading}
        accessibilityRole="button"
        accessibilityLabel={`Sign and send ${props.payment.amountDisplay} ${props.payment.asset} on Solana`}
      >
        {props.loading
          ? <ActivityIndicator color="#111" />
          : <Text style={styles.buttonText}>Sign and send</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={props.onCancel}
        disabled={props.loading}
      >
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
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
  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={[styles.formContent, styles.centered]}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={50} color="#49d17d" accessibilityLabel="Confirmed" />
      </View>
      <Text style={styles.successTitle}>Solana payment confirmed</Text>
      <Text style={[styles.subtitle, { textAlign: 'center' }]}>
        {props.result.amountDisplay} {props.result.asset} reached confirmed commitment.
      </Text>
      <View style={styles.proofBox}>
        <Text style={styles.label}>Transaction signature</Text>
        <Text style={styles.proofText} selectable>{props.result.signature}</Text>
      </View>
      <TouchableOpacity style={styles.button} onPress={props.onOpenExplorer} accessibilityRole="link">
        <View style={styles.buttonContent}>
          <Ionicons name="open-outline" size={18} color="#111" />
          <Text style={styles.buttonText}>Open in Solana Explorer</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={props.onDashboard}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Return to dashboard</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={props.onReset}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Send another</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
