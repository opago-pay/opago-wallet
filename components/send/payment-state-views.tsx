import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { AssetIcon } from '@/components/ui/asset-icon';
import { walletAssetKeyFromSymbol } from '@/lib/wallet-assets';
import { sendStyles as styles } from '@/styles/send-styles';
import type { OcpOption, OcpState } from './types';

export function ScannerView(props: { onScanned(value: string): void; onCancel(): void; onError?(): void }) {
  useLanguage();
  return (
    <View style={styles.camera}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onMountError={props.onError}
        onBarcodeScanned={({ data }) => props.onScanned(data)}
      />
      <View style={styles.cameraHeader} pointerEvents="none">
        <Text style={styles.cameraTitle}>{t("Scan payment code")}</Text>
        <Text style={styles.cameraSubtitle}>{t("Hold the QR code inside the frame")}</Text>
      </View>
      <View style={styles.scannerFrame} pointerEvents="none" />
      <TouchableOpacity style={styles.cameraClose} onPress={props.onCancel} accessibilityRole="button" accessibilityLabel={t("Close scanner")}>
        <Text style={styles.cameraCloseText}>{t("Cancel")}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function PaymentSuccessView(props: {
  proof: string;
  onDashboard(): void;
  onReset(): void;
}) {
  useLanguage();
  const [showDetails, setShowDetails] = useState(false);
  return (
    <View style={[styles.container, styles.centered]}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={50} color="#49d17d" accessibilityLabel={t("Confirmed")} />
      </View>
      <Text style={styles.successTitle}>{t("Payment sent")}</Text>
      <Text style={[styles.subtitle, styles.centerText]}>{t("It is complete and saved in your activity.")}</Text>
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
          <Text style={styles.proofText}>{props.proof}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.textButton} onPress={props.onReset}>
        <Text style={styles.textButtonText}>{t("Send another payment")}</Text>
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
  useLanguage();
  return (
    <View style={[styles.container, styles.centered]}>
      <Ionicons name="id-card-outline" size={76} color="#ffb000" />
      <Text style={[styles.quoteTitle, { marginTop: 24 }]}>{t("Identity required")}</Text>
      <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 24 }]}>
        {t("Verified payer data is required before requesting the invoice.")}</Text>
      {props.demo && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t("Demo mode - not legal eID verification")}</Text>
        </View>
      )}
      <TouchableOpacity style={[styles.button, { width: '100%' }]} onPress={props.onBegin} disabled={props.loading}>
        {props.loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>{t("Open AusweisApp")}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={props.onCancel}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>{t("Cancel")}</Text>
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
  useLanguage();
  return (
    <View style={styles.container}>
      <Text style={styles.quoteTitle}>{props.state.quote.merchantName}</Text>
      <Text style={styles.subtitle}>
        {t("Total:")} {props.state.quote.fiatAmount} {props.state.quote.fiatCurrency}
      </Text>
      <View style={{ marginTop: 24 }}>
        {props.state.quote.transferAmounts.map(option => (
          <TouchableOpacity
            key={option.method + ':' + option.asset}
            style={[styles.option, props.selected === option && styles.optionActive]}
            onPress={() => props.onSelect(option)}
          >
            <View style={styles.optionIdentity}>
              <AssetIcon asset={walletAssetKeyFromSymbol(option.asset)} size={38} />
              <View>
              <Text style={styles.optionTitle}>{option.chain} {option.asset}</Text>
              <Text style={styles.optionMeta}>{t("Fee:")} {option.fee}</Text>
              </View>
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
        {props.loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>{t("Review and pay")}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={props.onCancel}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>{t("Cancel")}</Text>
      </TouchableOpacity>
    </View>
  );
}
