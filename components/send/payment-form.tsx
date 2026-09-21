import { appLocale, t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { TextInput, TouchableOpacity } from '@/components/ui/wallet-interaction';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { AssetIcon } from '@/components/ui/asset-icon';
import { PaymentBackButton } from './payment-back-button';
import { AdvancedOptions } from '@/components/ui/advanced-options';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appConfig } from '@/lib/config';
import { formatTinybars } from '@/lib/hedera/payments';
import { HEDERA_NETWORK, HEDERA_NETWORK_BADGE } from '@/lib/hedera/config';
import { getWalletAssetPresentation, type WalletAssetKey } from '@/lib/wallet-assets';
import { sendStyles as styles } from '@/styles/send-styles';
import type { PaymentCurrency, PaymentSource, WalletBalances } from './types';
import type { LightningAmountRequirement } from '@/lib/lightning-destination';

const CURRENCIES: PaymentCurrency[] = ['SAT', 'EUR'];

export function PaymentForm(props: {
  destination: string;
  amountInput: string;
  amountRequirement?: LightningAmountRequirement | null;
  currency: PaymentCurrency;
  source: PaymentSource;
  sourceSelected: boolean;
  advancedExpanded: boolean;
  onAdvancedChange(expanded: boolean): void;
  balances: WalletBalances;
  balanceError: string | null;
  balanceLoading: { spark: boolean; hedera: boolean };
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
  useLanguage();
  const insets = useSafeAreaInsets();
  const amountRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const amountMissing = Boolean(props.amountRequirement && !props.amountInput.trim());
  const reviewDisabled = props.loading || !props.walletReady || amountMissing;
  useEffect(() => {
    if (props.amountRequirement && !props.loading) amountRef.current?.focus();
  }, [props.amountRequirement, props.loading]);
  const isHedera = props.source === 'hedera';
  const sources: { source: PaymentSource; asset: WalletAssetKey; balance: string }[] = [
    { source: 'spark', asset: 'lightning', balance: props.balances.spark === null ? (props.balanceLoading.spark ? t('Loading…') : t('Unavailable')) : props.balances.spark.toLocaleString(appLocale()) + ' SAT' },
    { source: 'hedera', asset: 'hedera', balance: props.balances.hbarTinybars === null ? (props.balanceLoading.hedera ? t('Loading…') : t('Unavailable')) : formatTinybars(props.balances.hbarTinybars) + ' HBAR' },
  ];
  const selectedSource = sources.find(item => item.source === props.source)!;
  const selectedPresentation = getWalletAssetPresentation(
    selectedSource.asset,
    appConfig.isMainnet,
    appConfig.hederaNetwork,
  );
  const renderSource = (item: typeof sources[number]) => {
    const presentation = getWalletAssetPresentation(item.asset, appConfig.isMainnet, appConfig.hederaNetwork);
    return (
      <TouchableOpacity key={item.source} style={styles.assetSelector}
        onPress={() => props.onSourceChange(item.source)} accessibilityRole="button"
        accessibilityLabel={t('{asset}, {network}, balance {balance}', { asset: presentation.name, network: presentation.networkLabel, balance: item.balance })}>
        <View style={styles.assetSelectorHeader}>
          <AssetIcon asset={item.asset} size={34} />
          <Ionicons name="chevron-forward" size={18} color="#696974" />
        </View>
        <Text style={styles.assetSelectorTitle}>{presentation.name}</Text>
        <Text style={styles.assetSelectorBalance}>{item.balance}</Text>
        {props.balanceLoading[item.source] && <ActivityIndicator color="#ffb000" size="small" accessibilityLabel={t('Updating balance')} />}
        <Text style={styles.assetSelectorMeta}>{presentation.networkBadge}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={[styles.formContent, { paddingTop: insets.top + 12 }]}
      keyboardShouldPersistTaps="handled"
    >
      {props.sourceSelected && <PaymentBackButton onPress={props.onChangeSource} disabled={props.loading} label={t('Back to payment methods')} />}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{t('Send {asset}', { asset: props.sourceSelected ? selectedPresentation.name : 'Bitcoin' })}</Text>
          <Text style={styles.screenSubtitle}>{props.sourceSelected ? t('Enter the recipient and amount.') : t('Scan a code or enter a Bitcoin payment request.')}</Text>
        </View>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} />
      </View>
      {props.sourceSelected && !appConfig.isMainnet && !isHedera && (
        <View style={styles.modeNotice}>
          <View style={styles.modeNoticeIcon}>
            <Ionicons name="flask-outline" size={18} color="#b7a8ff" />
          </View>
          <View style={styles.modeNoticeCopy}>
            <Text style={styles.modeNoticeTitle}>{t("Bitcoin demo mode")}</Text>
            <Text style={styles.modeNoticeText}>{t("Test payments only — no real Bitcoin.")}</Text>
          </View>
        </View>
      )}
      {props.sourceSelected && isHedera && !appConfig.isHederaMainnet && (
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
              ? t('Real payments are active.')
              : t('Test payments only — no real value.')}
            </Text>
          </View>
        </View>
      )}
      {props.balanceError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t("Some balances may be out of date. Please try again.")}</Text>
        </View>
      )}
      <View style={styles.card}>
        {!props.sourceSelected ? (
          <>
            <TouchableOpacity
              style={[styles.button, styles.primaryChoiceButton]}
              onPress={props.onScan}
              accessibilityRole="button"
              accessibilityLabel={t("Scan a payment QR code")}
            >
              <View style={styles.buttonContent}>
                <Ionicons name="qr-code-outline" size={22} color="#111" />
                <Text style={styles.buttonText}>{t("Scan to pay")}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.choiceDivider}>
              <View style={styles.choiceDividerLine} />
              <Text style={styles.choiceDividerText}>{t('or enter a payment request')}</Text>
              <View style={styles.choiceDividerLine} />
            </View>
            <View style={styles.assetGrid}>
              {sources.filter(item => item.source === 'spark').map(renderSource)}
            </View>
            <AdvancedOptions expanded={props.advancedExpanded} onChange={props.onAdvancedChange} disabled={props.loading}>
              <View style={styles.assetGrid}>{sources.filter(item => item.source !== 'spark').map(renderSource)}</View>
            </AdvancedOptions>
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
                {props.balanceLoading[props.source] && <ActivityIndicator color="#ffb000" size="small" accessibilityLabel={t("Updating balance")} />}
              </View>
            </View>

            <View style={[styles.row, { alignItems: 'center', marginBottom: 8 }]}>
              <Text style={[styles.label, { flex: 1, marginBottom: 0 }]}>{t("Recipient")}</Text>
              <TouchableOpacity
                style={styles.scanButton}
                onPress={props.onScan}
                disabled={props.loading}
                accessibilityRole="button"
                accessibilityLabel={t("Scan payment QR code")}
              >
                <Ionicons name="qr-code-outline" size={18} color="#ffb000" />
                <Text style={styles.scanText}>{t("Scan QR")}</Text>
              </TouchableOpacity>
            </View>
              <TextInput
                style={[styles.input, styles.destinationInput]}
                placeholder={
                  isHedera
                    ? t('Scan a payment code or enter an account')
                  : t('Scan or paste a Lightning request')
                }
                placeholderTextColor="#666"
                value={props.destination}
                onChangeText={props.onDestinationChange}
                editable={!props.loading}
                accessibilityLabel={t('Who are you paying?')}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
            <Text style={styles.label}>{t("Amount")}</Text>
            {props.amountRequirement && (
              <View style={styles.amountGuidance} accessibilityLiveRegion="polite">
                <Text style={styles.amountGuidanceTitle}>{t('Enter the amount you want to send.')}</Text>
                <Text style={styles.amountGuidanceText}>
                  {props.amountRequirement.maxSats === null
                    ? t('This payment request has no fixed amount.')
                    : t('The recipient accepts {min}–{max} SAT.', {
                        min: props.amountRequirement.minSats.toLocaleString(appLocale()),
                        max: props.amountRequirement.maxSats.toLocaleString(appLocale()),
                      })}
                </Text>
              </View>
            )}
            <TextInput
              ref={amountRef}
              style={styles.input}
              placeholder={
                isHedera ? 'HBAR' : props.currency === 'SAT' ? t('Satoshis') : t('Euro')
              }
              placeholderTextColor="#666"
              value={props.amountInput}
              onChangeText={props.onAmountChange}
              editable={!props.loading}
              accessibilityLabel={t('Amount')}
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
            <TouchableOpacity
              style={[styles.button, reviewDisabled && styles.buttonDisabled]}
              onPress={props.onReview}
              disabled={reviewDisabled}
              accessibilityRole="button"
            >
              {props.loading ? (
                <ActivityIndicator color="#111" />
              ) : (
                <View style={styles.buttonContent}>
                  <Text style={styles.buttonText}>{t("Continue")}</Text>
                  <Ionicons name="arrow-forward" size={19} color="#111" />
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
      {props.sourceSelected && !isHedera && <AdvancedOptions expanded={props.advancedExpanded} onChange={props.onAdvancedChange} disabled={props.loading}>
        <View style={styles.assetGrid}>{sources.filter(item => item.source !== 'spark').map(renderSource)}</View>
      </AdvancedOptions>}
    </ScrollView>
  );
}
