import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { AssetIcon } from '@/components/ui/asset-icon';
import { appConfig } from '@/lib/config';
import { formatTinybars } from '@/lib/hedera/payments';
import { HEDERA_NETWORK, HEDERA_NETWORK_BADGE } from '@/lib/hedera/config';
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
  sourceSelected: boolean;
  balances: WalletBalances;
  balanceError: string | null;
  loading: boolean;
  walletReady: boolean;
  onDestinationChange(value: string): void;
  onAmountChange(value: string): void;
  onCurrencyChange(value: PaymentCurrency): void;
  onSourceChange(value: PaymentSource): void;
  onChangeSource(): void;
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
  const selectedSource = sources.find(item => item.source === props.source)!;
  const selectedPresentation = getWalletAssetPresentation(
    selectedSource.asset,
    appConfig.isMainnet,
    appConfig.hederaNetwork,
  );

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Send money</Text>
          <Text style={styles.screenSubtitle}>Choose how you want to pay.</Text>
        </View>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} />
      </View>
      {props.sourceSelected && !appConfig.isMainnet && !isHedera && !isNativeSolana && (
        <View style={styles.modeNotice}>
          <View style={styles.modeNoticeIcon}>
            <Ionicons name="flask-outline" size={18} color="#b7a8ff" />
          </View>
          <View style={styles.modeNoticeCopy}>
            <Text style={styles.modeNoticeTitle}>Bitcoin demo mode</Text>
            <Text style={styles.modeNoticeText}>Test payments only — no real Bitcoin.</Text>
          </View>
        </View>
      )}
      {props.sourceSelected && isHedera && (
        <View style={styles.modeNotice}>
          <View style={[styles.modeNoticeIcon, HEDERA_NETWORK === 'mainnet' && styles.modeNoticeIconLive]}>
            <Ionicons
              name={HEDERA_NETWORK === 'mainnet' ? 'shield-checkmark' : 'flask-outline'}
              size={18}
              color={HEDERA_NETWORK === 'mainnet' ? '#49d17d' : '#b7a8ff'}
            />
          </View>
          <View style={styles.modeNoticeCopy}>
            <Text style={styles.modeNoticeTitle}>
              HBAR · {HEDERA_NETWORK_BADGE}
            </Text>
            <Text style={styles.modeNoticeText}>
            {HEDERA_NETWORK === 'mainnet'
              ? 'Real payments are active.'
              : 'Test payments only — no real value.'}
            </Text>
          </View>
        </View>
      )}
      {props.balanceError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Some balances may be out of date. Please try again.</Text>
        </View>
      )}
      {props.sourceSelected && isNativeSolana && !appConfig.isMainnet && (
        <View style={styles.modeNotice}>
          <View style={styles.modeNoticeIcon}>
            <Ionicons name="flask-outline" size={18} color="#b7a8ff" />
          </View>
          <View style={styles.modeNoticeCopy}>
            <Text style={styles.modeNoticeTitle}>
              {props.source === 'usdc' ? 'USDC' : 'Solana'} · DEVNET
            </Text>
            <Text style={styles.modeNoticeText}>Test payments only — no real value.</Text>
          </View>
        </View>
      )}
      <View style={styles.card}>
        {!props.sourceSelected ? (
          <>
            <TouchableOpacity
              style={[styles.button, styles.primaryChoiceButton]}
              onPress={props.onScan}
              accessibilityRole="button"
              accessibilityLabel="Scan a payment QR code"
            >
              <View style={styles.buttonContent}>
                <Ionicons name="qr-code-outline" size={22} color="#111" />
                <Text style={styles.buttonText}>Scan to pay</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.choiceDivider}>
              <View style={styles.choiceDividerLine} />
              <Text style={styles.choiceDividerText}>or choose what to send</Text>
              <View style={styles.choiceDividerLine} />
            </View>
            <View style={styles.assetGrid}>
              {sources.map(item => {
                const presentation = getWalletAssetPresentation(
                  item.asset,
                  appConfig.isMainnet,
                  appConfig.hederaNetwork,
                );
                return (
                  <TouchableOpacity
                    key={item.source}
                    style={styles.assetSelector}
                    onPress={() => props.onSourceChange(item.source)}
                    accessibilityRole="button"
                    accessibilityLabel={`${presentation.name}, ${presentation.networkLabel}, balance ${item.balance}`}
                  >
                    <View style={styles.assetSelectorHeader}>
                      <AssetIcon asset={item.asset} size={34} />
                      <Ionicons name="chevron-forward" size={18} color="#696974" />
                    </View>
                    <Text style={styles.assetSelectorTitle}>{presentation.name}</Text>
                    <Text style={styles.assetSelectorBalance}>{item.balance}</Text>
                    <Text style={styles.assetSelectorMeta}>{presentation.networkBadge}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <View style={styles.selectedAssetRow}>
              <AssetIcon asset={selectedSource.asset} size={38} />
              <View style={styles.selectedAssetCopy}>
                <Text style={styles.selectedAssetTitle}>{selectedPresentation.name}</Text>
                <Text style={styles.selectedAssetMeta}>
                  {selectedSource.balance} · {selectedPresentation.networkBadge}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.changeAssetButton}
                onPress={props.onChangeSource}
                accessibilityRole="button"
              >
                <Text style={styles.changeAssetText}>Change</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Who are you paying?</Text>
            <View style={[styles.row, { alignItems: 'center' }]}>
              <TextInput
                style={[styles.input, styles.destinationInput, { flex: 1 }]}
                placeholder={
                  isHedera
                    ? 'Scan a payment code or enter an account'
                    : isNativeSolana
                      ? 'Scan a payment code or enter an address'
                      : 'Scan or paste a Lightning request'
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
                <Text style={styles.scanText}>Scan QR</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              placeholder={
                isHedera
                  ? 'HBAR'
                  : props.source === 'solana'
                    ? 'SOL'
                    : props.source === 'usdc'
                      ? 'USDC'
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
            <TouchableOpacity
              style={[styles.button, (props.loading || !props.walletReady) && styles.buttonDisabled]}
              onPress={props.onReview}
              disabled={props.loading || !props.walletReady}
              accessibilityRole="button"
            >
              {props.loading ? (
                <ActivityIndicator color="#111" />
              ) : (
                <View style={styles.buttonContent}>
                  <Text style={styles.buttonText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={19} color="#111" />
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}
