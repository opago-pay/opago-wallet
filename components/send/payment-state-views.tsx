import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { sendStyles as styles } from '@/app/send-styles';
import type { BridgeQuote, OcpOption, OcpState } from './types';

export function ScannerView(props: { onScanned(value: string): void; onCancel(): void }) {
  return (
    <View style={styles.camera}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => props.onScanned(data)}
      />
      <TouchableOpacity style={styles.cameraClose} onPress={props.onCancel}>
        <Text style={styles.cameraCloseText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

export function PaymentSuccessView(props: {
  proof: string;
  onDashboard(): void;
  onReset(): void;
}) {
  return (
    <View style={[styles.container, styles.centered]}>
      <View style={styles.successCircle}><Text style={styles.checkmark}>OK</Text></View>
      <Text style={styles.successTitle}>Payment confirmed</Text>
      <Text style={styles.subtitle}>The payment was completed successfully.</Text>
      <View style={styles.proofBox}><Text style={styles.proofText}>{props.proof}</Text></View>
      <TouchableOpacity style={styles.button} onPress={props.onDashboard}>
        <Text style={styles.buttonText}>Return to dashboard</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={props.onReset}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Send another</Text>
      </TouchableOpacity>
    </View>
  );
}

export function IdentityRequiredView(props: {
  demo: boolean;
  loading: boolean;
  onBegin(): void;
  onCancel(): void;
}) {
  return (
    <View style={[styles.container, styles.centered]}>
      <Ionicons name="id-card-outline" size={76} color="#ffb000" />
      <Text style={[styles.quoteTitle, { marginTop: 24 }]}>Identity required</Text>
      <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 24 }]}>
        Verified payer data is required before requesting the invoice.
      </Text>
      {props.demo && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Demo mode - not legal eID verification</Text>
        </View>
      )}
      <TouchableOpacity style={[styles.button, { width: '100%' }]} onPress={props.onBegin} disabled={props.loading}>
        {props.loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Open AusweisApp</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={props.onCancel}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

export function BridgeQuoteView(props: {
  quote: BridgeQuote;
  loading: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <View style={[styles.container, styles.centered]}>
      <Text style={styles.quoteTitle}>Review bridge quote</Text>
      <View style={styles.quoteBox}>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Lightning</Text>
          <Text style={styles.quoteValue}>{props.quote.amountSats} SAT</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Source cost</Text>
          <Text style={styles.quoteValue}>
            {props.quote.sourceCost.toFixed(6)} {props.quote.sourceAsset}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.button} onPress={props.onConfirm} disabled={props.loading}>
        {props.loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Confirm bridge</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={props.onCancel}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

export function OcpQuoteView(props: {
  state: OcpState;
  selected: OcpOption | null;
  loading: boolean;
  onSelect(option: OcpOption): void;
  onExecute(): void;
  onCancel(): void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.quoteTitle}>{props.state.quote.merchantName}</Text>
      <Text style={styles.subtitle}>
        Total: {props.state.quote.fiatAmount} {props.state.quote.fiatCurrency}
      </Text>
      <View style={{ marginTop: 24 }}>
        {props.state.quote.transferAmounts.map(option => (
          <TouchableOpacity
            key={option.method + ':' + option.asset}
            style={[styles.option, props.selected === option && styles.optionActive]}
            onPress={() => props.onSelect(option)}
          >
            <View>
              <Text style={styles.optionTitle}>{option.chain} {option.asset}</Text>
              <Text style={styles.optionMeta}>Fee: {option.fee}</Text>
            </View>
            <Text style={styles.optionTitle}>{option.amount}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.button, !props.selected && { opacity: 0.5 }]}
        onPress={props.onExecute}
        disabled={props.loading || !props.selected}
      >
        {props.loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Review and pay</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={props.onCancel}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}
