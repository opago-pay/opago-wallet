import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { AssetIcon } from '@/components/ui/asset-icon';
import { appConfig } from '@/lib/config';
import { formatTinybars } from '@/lib/hedera/payments';
import { getWalletAssetPresentation, type WalletAssetKey } from '@/lib/wallet-assets';
import { sendStyles as styles } from '@/styles/send-styles';
import type { PaymentCurrency, PaymentSource, WalletBalances } from './types';

const CURRENCIES: PaymentCurrency[] = ['SAT', 'EUR'];

export function PaymentForm(props: {
  destination: string;
  amountInput: string;
  currency: PaymentCurrency;
  source: PaymentSource;
  balances: WalletBalances;
  balanceError: string | null;
  loading: boolean;
  walletReady: boolean;
  onDestinationChange(value: string): void;
  onAmountChange(value: string): void;
  onCurrencyChange(value: PaymentCurrency): void;
  onSourceChange(value: PaymentSource): void;
  onScan(): void;
  onReview(): void;
}) {
  const isHedera = props.source === 'hedera';
  const sources: { source: PaymentSource; asset: WalletAssetKey; balance: string }[] = [
    { source: 'spark', asset: 'lightning', balance: props.balances.spark + ' SAT' },
    { source: 'solana', asset: 'solana', balance: props.balances.sol.toFixed(4) + ' SOL' },
    { source: 'usdc', asset: 'usdc', balance: props.balances.usdc.toFixed(2) + ' USDC' },
    { source: 'hedera', asset: 'hedera', balance: formatTinybars(props.balances.hbarTinybars) + ' HBAR' },
  ];

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Send</Text>
          <Text style={styles.screenSubtitle}>Choose an asset and review before signing.</Text>
        </View>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} />
      </View>
      {!appConfig.isMainnet && !isHedera && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Safe development mode: real mainnet payments and Atomiq swaps are blocked.
          </Text>
        </View>
      )}
      {isHedera && (
        <View style={styles.testnetBanner}>
          <Text style={styles.testnetTitle}>HEDERA TESTNET</Text>
          <Text style={styles.testnetText}>Test HBAR only. These funds have no real value.</Text>
        </View>
      )}
      {props.balanceError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{props.balanceError}</Text>
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.label}>Destination</Text>
        <View style={[styles.row, { alignItems: 'center' }]}>
          <TextInput
            style={[styles.input, styles.destinationInput, { flex: 1 }]}
            placeholder={isHedera ? 'Hedera account ID (0.0.x) or payment QR' : 'BOLT11, Lightning Address or LNURL'}
            placeholderTextColor="#666"
            value={props.destination}
            onChangeText={props.onDestinationChange}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <TouchableOpacity
            style={styles.scanButton}
            onPress={props.onScan}
            accessibilityRole="button"
            accessibilityLabel="Scan payment QR code"
          >
            <Ionicons name="qr-code-outline" size={18} color="#ffb000" />
            <Text style={styles.scanText}>Scan</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.label}>
          {isHedera ? 'Amount in HBAR' : 'Amount (optional for fixed invoices)'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={isHedera ? '0.00000001 HBAR minimum' : props.currency === 'SAT' ? 'Satoshis' : 'Euro'}
          placeholderTextColor="#666"
          value={props.amountInput}
          onChangeText={props.onAmountChange}
          keyboardType="decimal-pad"
        />
        {!isHedera && (
          <View style={styles.row}>
            {CURRENCIES.map(item => (
              <TouchableOpacity
                key={item}
                style={[styles.selector, props.currency === item && styles.selectorActive]}
                onPress={() => props.onCurrencyChange(item)}
                accessibilityRole="radio"
                accessibilityState={{ checked: props.currency === item }}
              >
                <Text style={[styles.selectorText, props.currency === item && styles.selectorTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={styles.label}>Pay from</Text>
        <View style={styles.assetGrid}>
          {sources.map(item => {
            const presentation = getWalletAssetPresentation(item.asset, appConfig.isMainnet);
            const selected = props.source === item.source;
            return (
              <TouchableOpacity
                key={item.source}
                style={[styles.assetSelector, selected && styles.assetSelectorActive]}
                onPress={() => props.onSourceChange(item.source)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${presentation.name}, ${presentation.networkLabel}, balance ${item.balance}`}
              >
                <View style={styles.assetSelectorHeader}>
                  <AssetIcon asset={item.asset} size={34} />
                  {selected && <Ionicons name="checkmark-circle" size={20} color="#ffb000" />}
                </View>
                <Text style={[styles.assetSelectorTitle, selected && styles.selectorTextActive]}>
                  {presentation.name}
                </Text>
                <Text style={styles.assetSelectorBalance}>{item.balance}</Text>
                <Text style={styles.assetSelectorMeta}>{presentation.networkBadge}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={styles.button}
          onPress={props.onReview}
          disabled={props.loading || !props.walletReady}
          accessibilityRole="button"
        >
          {props.loading ? (
            <ActivityIndicator color="#111" />
          ) : (
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>Review payment</Text>
              <Ionicons name="arrow-forward" size={19} color="#111" />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
