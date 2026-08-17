import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { AssetIcon } from '@/components/ui/asset-icon';
import { appConfig } from '@/lib/config';
import { formatTinybars } from '@/lib/hedera/payments';
import { formatSolanaAssetAmount } from '@/lib/solana/amounts';
import { getWalletAssetPresentation, type WalletAssetKey } from '@/lib/wallet-assets';
import { sendStyles as styles } from '@/styles/send-styles';
import type { PaymentCurrency, PaymentSource, WalletBalances } from './types';

const CURRENCIES: PaymentCurrency[] = ['SAT', 'EUR'];

function solanaBalanceLabel(
  amount: bigint,
  asset: 'SOL' | 'USDC',
  availability: WalletBalances['solAvailability'],
): string {
  if (availability === 'loading') return 'Loading...';
  if (availability === 'unavailable') return 'Unavailable';
  const value = formatSolanaAssetAmount(amount, asset) + ' ' + asset;
  return availability === 'stale' ? value + ' · last known' : value;
}

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
  const isNativeSolana = props.source === 'solana' || props.source === 'usdc';
  const sources: { source: PaymentSource; asset: WalletAssetKey; balance: string }[] = [
    { source: 'spark', asset: 'lightning', balance: props.balances.spark + ' SAT' },
    {
      source: 'solana',
      asset: 'solana',
      balance: solanaBalanceLabel(
        props.balances.solLamports,
        'SOL',
        props.balances.solAvailability,
      ),
    },
    {
      source: 'usdc',
      asset: 'usdc',
      balance: solanaBalanceLabel(
        props.balances.usdcBaseUnits,
        'USDC',
        props.balances.usdcAvailability,
      ),
    },
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
      {!appConfig.isMainnet && !isHedera && !isNativeSolana && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Safe development mode: real mainnet Lightning payments are blocked.
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
      {isNativeSolana && !appConfig.isMainnet && (
        <View style={styles.testnetBanner}>
          <Text style={styles.testnetTitle}>SOLANA DEVNET</Text>
          <Text style={styles.testnetText}>Test SOL and tokens only. These funds have no real value.</Text>
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.label}>Destination</Text>
        <View style={[styles.row, { alignItems: 'center' }]}>
          <TextInput
            style={[styles.input, styles.destinationInput, { flex: 1 }]}
            placeholder={
              isHedera
                ? 'Hedera account ID (0.0.x) or payment QR'
                : isNativeSolana
                  ? 'Solana address or Solana Pay QR'
                  : 'BOLT11, Lightning Address or LNURL'
            }
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
          {isHedera
            ? 'Amount in HBAR'
            : isNativeSolana
              ? 'Amount in ' + (props.source === 'usdc' ? 'USDC' : 'SOL')
              : 'Amount (optional for fixed invoices)'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={
            isHedera
              ? '0.00000001 HBAR minimum'
              : props.source === 'solana'
                ? '0.000000001 SOL minimum'
                : props.source === 'usdc'
                  ? '0.000001 USDC minimum'
                  : props.currency === 'SAT' ? 'Satoshis' : 'Euro'
          }
          placeholderTextColor="#666"
          value={props.amountInput}
          onChangeText={props.onAmountChange}
          keyboardType="decimal-pad"
        />
        {!isHedera && !isNativeSolana && (
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
