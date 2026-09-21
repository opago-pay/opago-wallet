import { appLocale, t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdvancedOptions } from '@/components/ui/advanced-options';
import { AssetIcon } from '@/components/ui/asset-icon';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useWalletBalances } from '@/hooks/useWalletBalances';
import { useHomeBalancePreview } from '@/hooks/useHomeBalancePreview';
import { recordWalletStartupStage } from '@/lib/startup-timing';
import { BackupReminder } from '@/components/security/backup-prompt';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { getTransactions, Transaction as LocalTransaction } from '@/lib/database';
import { loadHederaHistory, loadHederaTransactionStatus } from '@/lib/hedera/account';
import {
  getHederaTransactionExplorerUrl,
} from '@/lib/hedera/explorer';
import { openHederaExplorerUrl } from '@/lib/hedera/explorer-native';
import { normalizeHederaTransactionIdForMirror } from '@/lib/hedera/mirror';
import { hederaPaymentJournal } from '@/lib/hedera/payment-journal-native';
import { lightningPaymentJournal } from '@/lib/lightning/payment-journal-native';
import { reconcileLightningPayments } from '@/lib/lightning/reconcile-native';
import {
  loadSparkTransfersPaginated,
  sparkUserRequestPaymentHash,
  type SparkTransferLike,
} from '@/lib/lightning/spark-history';
import { formatTinybars } from '@/lib/hedera/payments';
import { appConfig } from '@/lib/config';
import { calculateBitcoinEur, calculateHederaEur } from '@/lib/portfolio-valuation';
import { withTimeout } from '@/lib/promise-timeout';
import { refreshProgressively } from '@/lib/progressive-refresh';
import { operationalHealth } from '@/lib/operational-health-native';
import { yieldToUi } from '@/lib/ui-ready';
import {
  getWalletAssetPresentation,
  walletAssetKeyFromSymbol,
  type WalletAssetKey,
} from '@/lib/wallet-assets';
import {
  compactWalletIdentifier,
  formatEurValue,
  friendlyPaymentStatus,
} from '@/lib/wallet-display';

const OPTIONAL_ASSET_REFRESH_TIMEOUT_MS = 8_000;

interface DisplayTransaction {
  key: string;
  type: 'incoming' | 'outgoing';
  amountDisplay: string;
  asset: string;
  status: string;
  timestamp: string;
  txId: string | null;
  explorerUrl?: string;
  explorerLabel?: 'HashScan';
}

export default function HomeScreen() {
  useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    walletReady,
    sparkWallet,
    hederaAccount,
    hederaPublicKey,
    loadOrGenerateWallet,
    refreshHederaAccount,
    error: walletError,
  } = useWalletAuth();
  const rates = useExchangeRates();
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const { balances, balanceStates, secondaryDataReady, sparkPriorityTimedOut, refreshBalances } = useWalletBalances({
    walletReady, sparkWallet, refreshHederaAccount, initializationError: walletError, enableHedera: advancedExpanded, prioritizeSpark: true,
  });
  const preview = useHomeBalancePreview({
    publicKey: hederaPublicKey, spark: balances.spark, hedera: balances.hbarTinybars,
    sparkAt: balanceStates.spark.updatedAt, hederaAt: balanceStates.hedera.updatedAt,
    btcToEur: rates.btcToEur, hbarToEur: rates.hbarToEur, ratesAt: rates.updatedAt,
  });
  const displayBalances = {
    spark: balances.spark ?? preview?.spark?.value ?? null,
    hbarTinybars: balances.hbarTinybars ?? (preview?.hedera ? BigInt(preview.hedera.value) : null),
  };
  const previewRates = !(rates.btcToEur > 0) && !!preview?.rates;
  const displayRates = {
    btcToEur: rates.btcToEur > 0 ? rates.btcToEur : preview?.rates?.btcToEur ?? 0,
    hbarToEur: rates.hbarToEur > 0 ? rates.hbarToEur : preview?.rates?.hbarToEur ?? 0,
  };
  const [transactions, setTransactions] = useState<DisplayTransaction[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const refreshGenerationRef = useRef(0);
  const refreshInProgressRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!walletReady) {
      try { await loadOrGenerateWallet(); }
      catch (cause) { setLoadError(cause instanceof Error ? cause.message : t('Wallet initialization failed.')); }
      return;
    }
    // History is opt-in. Startup and pull-to-refresh of a collapsed Home load
    // balances only; no database, journal or remote history reads start here.
    if (!activityExpanded || !secondaryDataReady) return;
    if (refreshInProgressRef.current) return refreshInProgressRef.current;
    const generation = ++refreshGenerationRef.current;
    setLoading(true);
    setLoadError(null);
    let lightningHistory: Promise<SparkTransferLike[]> | null = null;
    const getLightningHistory = () => lightningHistory ||= sparkWallet
      ? loadSparkTransfersPaginated(sparkWallet, 500, 50)
      : Promise.resolve([]);

    const operation = yieldToUi().then(() => {
      if (generation !== refreshGenerationRef.current) return;
      recordWalletStartupStage('history_refresh_started');
      return refreshProgressively<DisplayTransaction>([
        { label: 'Local activity', load: async () => (await getTransactions())
          .filter(item => item.asset === 'SAT' || item.asset === 'HBAR')
          .map((item: LocalTransaction) => ({
            key: item.txId || 'local:' + item.id, txId: item.txId, type: item.type,
            amountDisplay: item.amount.toLocaleString(appLocale()), asset: item.asset,
            status: item.status, timestamp: item.timestamp,
          })) },
        { label: 'Hedera journal', load: async () => {
          const records = await hederaPaymentJournal.reconcile(id => withTimeout(
            loadHederaTransactionStatus(id), OPTIONAL_ASSET_REFRESH_TIMEOUT_MS,
            'Hedera payment status timed out.',
          ));
          return records.map(item => ({
            key: 'hedera:' + normalizeHederaTransactionIdForMirror(item.transactionId),
            txId: item.transactionId, type: 'outgoing' as const,
            amountDisplay: formatTinybars(BigInt(item.amountTinybars)), asset: 'HBAR',
            status: item.state, timestamp: item.createdAt,
            explorerUrl: getHederaTransactionExplorerUrl(item.transactionId),
            explorerLabel: 'HashScan' as const,
          }));
        } },
        { label: 'Hedera history', load: async () => {
          const account = await refreshHederaAccount();
          if (!account) return [];
          return (await loadHederaHistory(account.accountId, 20)).map(item => ({
            key: 'hedera:' + normalizeHederaTransactionIdForMirror(item.transactionId),
            txId: item.transactionId,
            type: item.direction === 'received' ? 'incoming' as const : 'outgoing' as const,
            amountDisplay: item.amountHbar, asset: 'HBAR', status: item.result.toLowerCase(),
            timestamp: item.occurredAt, explorerUrl: item.hashscanUrl, explorerLabel: 'HashScan' as const,
          }));
        } },
        { label: 'Lightning journal', load: async () => {
          const records = sparkWallet
            ? await reconcileLightningPayments(sparkWallet, getLightningHistory())
            : await lightningPaymentJournal.list();
          return records.map(item => ({
            key: 'ln:' + item.paymentHash, txId: 'ln:' + item.paymentHash,
            type: 'outgoing' as const, amountDisplay: item.amountSats.toLocaleString(appLocale()),
            asset: 'SAT', status: item.state, timestamp: item.createdAt,
          }));
        } },
        { label: 'Lightning history', load: async () => {
          if (!sparkWallet) return [];
          try {
            const transfers = await withTimeout(getLightningHistory(), OPTIONAL_ASSET_REFRESH_TIMEOUT_MS, 'Lightning history refresh timed out.');
            void operationalHealth.recordSuccess('lightning').catch(() => undefined);
            return transfers.flatMap(transfer => {
              if (!String(transfer.status || '').toUpperCase().includes('COMPLETED')) return [];
              const amount = Math.abs(Number(transfer.totalValue) || 0);
              if (amount <= 0) return [];
              const hash = sparkUserRequestPaymentHash(transfer.userRequest);
              const key = hash ? 'ln:' + hash : 'spark:' + String(transfer.id || 'unknown');
              return [{
                key, txId: key,
                type: String(transfer.transferDirection).toUpperCase() === 'INCOMING' ? 'incoming' as const : 'outgoing' as const,
                amountDisplay: amount.toLocaleString(appLocale()), asset: 'SAT', status: 'confirmed',
                timestamp: transfer.createdTime ? new Date(transfer.createdTime).toISOString() : new Date().toISOString(),
              }];
            });
          } catch (cause) {
            void operationalHealth.recordFailure('lightning', cause).catch(() => undefined);
            throw cause;
          }
        } },
      ], ({ batches, errors, pending }) => {
        if (generation !== refreshGenerationRef.current) return;
        setTransactions(current => {
          const byId = new Map<string, DisplayTransaction>();
          // Keep already visible activity until all sources have refreshed successfully.
          if (pending || errors.length) for (const item of current) byId.set(item.key, item);
          for (const batch of batches) for (const item of batch) {
            if (byId.get(item.key)?.status !== 'action_required') byId.set(item.key, item);
          }
          return Array.from(byId.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ).slice(0, 500);
        });
        setLoadError(errors.join(' ') || null);
      }, OPTIONAL_ASSET_REFRESH_TIMEOUT_MS);
    }).finally(() => {
      if (generation !== refreshGenerationRef.current) return;
      refreshInProgressRef.current = null;
      setLoading(false);
    });
    refreshInProgressRef.current = operation;
    return operation;
  }, [activityExpanded, secondaryDataReady, loadOrGenerateWallet, refreshHederaAccount, sparkWallet, walletReady]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {
      refreshGenerationRef.current += 1;
      refreshInProgressRef.current = null;
    };
  }, [refresh]));

  async function onRefresh() {
    setRefreshing(true);
    try {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Refresh must remain available if haptics are unavailable on a device.
      }
      await refreshBalances();
      await refresh();
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Wallet data could not be loaded.');
    } finally {
      setRefreshing(false);
    }
  }

  async function copyHederaAccountId() {
    if (!hederaAccount) return;
    await Clipboard.setStringAsync(hederaAccount.accountId);
    Alert.alert(t('Copied'), t('Hedera {network} account ID copied.', { network: appConfig.hederaNetwork }));
  }

  async function openTransaction(transaction: DisplayTransaction) {
    if (!transaction.explorerUrl) return;
    try {
      await openHederaExplorerUrl(transaction.explorerUrl);
    } catch (cause) {
      Alert.alert(
        t('Could not open explorer'),
        t(cause instanceof Error ? cause.message : t('The explorer link is invalid.')),
      );
    }
  }

  const totalEur = calculateBitcoinEur(displayBalances.spark, displayRates.btcToEur);
  const hbarEur = calculateHederaEur(displayBalances.hbarTinybars, displayRates.hbarToEur);
  const balanceError = balanceStates.spark.error;
  const balancesLoading = balanceStates.spark.status === 'loading';
  useEffect(() => {
    if (totalEur !== null) recordWalletStartupStage('home_value_rendered');
  }, [totalEur]);
  useEffect(() => {
    if (balanceStates.spark.status === 'ready' && balances.spark !== null) recordWalletStartupStage('home_live_balance_rendered');
  }, [balanceStates.spark.status, balances.spark]);
  const balanceLabel = sparkPriorityTimedOut ? t('Bitcoin is taking longer to connect…') : balancesLoading
    ? (totalEur === null ? t('Loading balances…') : t('Last known balance · updating…'))
    : balanceError
      ? (totalEur === null ? t('Balance unavailable. Pull down to retry.') : t('Last known balance · refresh unavailable'))
      : previewRates ? t('Last known exchange rates')
        : totalEur === null ? (rates.isLoading ? t('Loading exchange rates…') : t('EUR estimate unavailable')) : t('Bitcoin balance');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#ffb000" />
      }
    >
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/logo_new.svg')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="Opago"
          accessibilityRole="image"
        />
        <TouchableOpacity
          style={styles.scannerButton}
          onPress={() => router.push('/scan')}
          accessibilityRole="button"
          accessibilityLabel={t("Scan QR code")}
        >
          <Ionicons name="scan-outline" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.totalCard}>
        <Text
          style={styles.total}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          accessibilityLabel={t('Estimated Bitcoin balance: {amount}', { amount: totalEur === null ? balanceLabel : formatEurValue(totalEur) })}
        >
          {totalEur === null ? '—' : formatEurValue(totalEur)}
        </Text>
        <View style={styles.balanceStatusRow} accessibilityLiveRegion="polite">
          {(balancesLoading || (rates.isLoading && totalEur === null && !balanceError)) && <ActivityIndicator size="small" color="#ffb000" />}
          <Text style={styles.totalLabel}>{balanceLabel}</Text>
        </View>
        <Text style={styles.valuationNote}>
          {previewRates ? t('The estimate will update when current prices are available.') : appConfig.isMainnet
            ? t('Based on current market prices.')
            : t('Demo balance based on current market prices.')}
        </Text>
      </View>

      <View style={styles.quickActions}>
        <QuickAction
          icon="arrow-up-outline"
          label={t("Send")}
          onPress={() => router.push('/(tabs)/send')}
        />
        <QuickAction
          icon="swap-horizontal-outline"
          label={t("Swap")}
          accessibilityHint={t("Coming soon")}
          onPress={() => Alert.alert(t("Swap"), t("Coming soon"))}
        />
        <QuickAction
          icon="arrow-down-outline"
          label={t("Request")}
          onPress={() => router.push('/(tabs)/receive')}
        />
      </View>

      <BackupReminder />
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('Bitcoin')}</Text>
      </View>

      <View style={styles.assetList}>
        <BalanceCard
          asset="lightning"
          value={displayBalances.spark === null ? '—' : displayBalances.spark.toLocaleString(appLocale()) + ' SAT'}
          loading={balanceStates.spark.status === 'loading'}
          statusText={balanceStates.spark.status === 'error' ? (displayBalances.spark === null ? t('Balance unavailable') : t('Last known balance')) : balanceStates.spark.status === 'loading' ? (displayBalances.spark === null ? t('Loading balance…') : t('Last known balance · updating…')) : undefined}
        />

      </View>

      <AdvancedOptions expanded={advancedExpanded} onChange={setAdvancedExpanded}>
        {!secondaryDataReady && <Text style={styles.waitingText} accessibilityLiveRegion="polite">{t('Loading Bitcoin balance first…')}</Text>}
        <BalanceCard
          asset="hedera"
          value={displayBalances.hbarTinybars === null ? '—' : formatTinybars(displayBalances.hbarTinybars) + ' HBAR'}
          fiatValue={hbarEur === null ? t('EUR estimate unavailable') : formatEurValue(hbarEur)}
          loading={balanceStates.hedera.status === 'loading'}
          identifier={hederaAccount?.accountId}
          statusText={
            balanceStates.hedera.status === 'error'
              ? displayBalances.hbarTinybars === null ? t('Balance unavailable') : t('Last known balance')
              : balanceStates.hedera.status === 'loading'
                ? (displayBalances.hbarTinybars === null ? t('Loading balance…') : t('Last known balance · updating…'))
                : hederaAccount ? undefined : t('Add HBAR to get started')
          }
          onCopy={hederaAccount ? () => void copyHederaAccountId() : undefined}
        />
      </AdvancedOptions>
      <ActivitySection activityExpanded={activityExpanded}
        onToggle={() => { if (!activityExpanded) setLoading(true); setActivityExpanded(value => !value); }}
        transactions={transactions} loading={!walletReady || loading} waitingForSpark={!secondaryDataReady}
        loadError={loadError} openTransaction={openTransaction} />
      {!!balanceError && (
        <View style={styles.errorNotice}>
          <Ionicons name="cloud-offline-outline" size={18} color="#f2b45d" />
          <Text style={styles.error}>{t("Some balances could not be refreshed. Pull down to try again.")}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function ActivitySection({ activityExpanded, onToggle, transactions, loading, waitingForSpark, loadError, openTransaction }: {
  activityExpanded: boolean; onToggle(): void;
  transactions: DisplayTransaction[]; loading: boolean; waitingForSpark: boolean; loadError: string | null;
  openTransaction(transaction: DisplayTransaction): Promise<void>;
}) {
  useLanguage();
  const [activityDisplayLimit, setActivityDisplayLimit] = useState(20);
  return <>
      <TouchableOpacity
        style={styles.activityToggle}
        onPress={() => {
          onToggle();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: activityExpanded }}
        accessibilityLabel={activityExpanded ? t('Hide transaction history') : t('Show transaction history')}
      >
        <View style={styles.activityToggleText}>
          <Text style={styles.sectionTitle}>{t('Transaction history')}</Text>
          {!activityExpanded && <Text style={styles.balanceSubtitle}>{t('Tap to load your transactions')}</Text>}
        </View>
        <Ionicons name={activityExpanded ? 'chevron-up' : 'chevron-down'} size={21} color="#a3a3ad" />
      </TouchableOpacity>
      {activityExpanded && <View>
        {waitingForSpark && <Text style={styles.waitingText} accessibilityLiveRegion="polite">{t('Loading Bitcoin balance first…')}</Text>}
        {transactions.length > activityDisplayLimit && (
          <TouchableOpacity
            style={styles.loadEarlier}
            onPress={() => setActivityDisplayLimit(limit => Math.min(limit + 20, 500))}
            accessibilityRole="button"
            accessibilityLabel={t("Load earlier payments")}
          >
            <Text style={styles.sectionMeta}>{t("Load earlier")}</Text>
          </TouchableOpacity>
        )}
      {(loading || waitingForSpark) && transactions.length === 0 ? (
        <ActivityIndicator color="#ffb000" />
      ) : transactions.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={28} color="#5f5f6b" />
          <Text style={styles.emptyTitle}>{t("No payments yet")}</Text>
          <Text style={styles.emptyText}>{t("Payments you send or receive will appear here.")}</Text>
        </View>
      ) : (
        transactions.slice(0, activityDisplayLimit).map(transaction => {
          const friendlyStatus = friendlyPaymentStatus(transaction.status);
          return (
          <TouchableOpacity
            key={transaction.key}
            style={styles.transaction}
            onPress={() => void openTransaction(transaction)}
            disabled={!transaction.explorerUrl}
            accessibilityRole={transaction.explorerUrl ? 'link' : 'summary'}
            accessibilityLabel={`${transaction.type === 'incoming' ? t('Received') : t('Sent')} ${transaction.amountDisplay} ${transaction.asset}, ${t(friendlyStatus)}`}
          >
            <AssetIcon asset={walletAssetKeyFromSymbol(transaction.asset)} size={40} />
            <View style={styles.transactionBody}>
              <Text style={styles.transactionTitle}>
                {transaction.type === 'incoming' ? t('Money received') : t('Payment sent')}
              </Text>
              <View style={styles.transactionMetaRow}>
                <Text style={styles.transactionMeta}>
                  {new Date(transaction.timestamp).toLocaleDateString(appLocale(), {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <View style={[
                  styles.statusPill,
                  friendlyStatus === 'Completed'
                    ? styles.statusPillSuccess
                    : friendlyStatus === 'Needs attention'
                      ? styles.statusPillError
                      : styles.statusPillPending,
                ]}>
                  <Text style={styles.statusPillText}>{t(friendlyStatus)}</Text>
                </View>
              </View>
            </View>
            <View style={styles.transactionTrailing}>
              <Text style={[styles.transactionAmount, transaction.type === 'incoming' && styles.incoming]}>
                {transaction.type === 'incoming' ? '+' : '-'}{transaction.amountDisplay} {transaction.asset}
              </Text>
              {transaction.explorerUrl && <Ionicons name="chevron-forward" size={16} color="#5f5f6b" />}
            </View>
          </TouchableOpacity>
        );})
      )}
      {!!loadError && <Text style={styles.error}>{t('Transaction history could not be fully loaded. Pull down to retry.')}</Text>}
      </View>}
  </>;
}

function BalanceCard(props: {
  asset: WalletAssetKey;
  value: string;
  loading?: boolean;
  identifier?: string;
  fiatValue?: string;
  statusText?: string;
  onCopy?: () => void;
}) {
  useLanguage();
  const presentation = getWalletAssetPresentation(
    props.asset,
    appConfig.isMainnet,
    appConfig.hederaNetwork,
  );

  return (
    <TouchableOpacity
      style={styles.balanceCard}
      onPress={props.onCopy}
      disabled={!props.onCopy}
      activeOpacity={props.onCopy ? 0.72 : 1}
      accessibilityRole={props.onCopy ? 'button' : 'summary'}
      accessibilityLabel={`${presentation.name}, ${props.value}, ${props.statusText || ''}, ${props.identifier ? compactWalletIdentifier(props.identifier) : t(presentation.description)}${props.onCopy ? ', ' + t('Tap to copy address') : ''}`}
    >
      <AssetIcon asset={props.asset} size={44} />
      <View style={styles.balanceDetails}>
        <View style={styles.balanceTitleRow}>
          <Text style={styles.balanceLabel}>{presentation.name}</Text>
          <NetworkBadge label={presentation.networkBadge} />
        </View>
        <Text style={styles.balanceSubtitle} numberOfLines={props.statusText ? undefined : 1}>
          {props.statusText || (props.identifier
            ? compactWalletIdentifier(props.identifier)
            : t(presentation.description))}
        </Text>
      </View>
      <View style={styles.balanceTrailing}>
        {props.loading && <ActivityIndicator color="#ffb000" size="small" />}
        <Text style={styles.balanceValue}>{props.value}</Text>
        {props.fiatValue && <Text style={styles.balanceSubtitle}>{props.fiatValue}</Text>}
        {props.onCopy && <Ionicons name="copy-outline" size={16} color="#8f8f9d" />}
      </View>
    </TouchableOpacity>
  );
}

function QuickAction(props: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  accessibilityHint?: string;
  onPress(): void;
}) {
  useLanguage();
  return (
    <TouchableOpacity
      style={styles.quickAction}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.accessibilityHint}
    >
      <View style={styles.quickActionIcon}>
        <Ionicons name={props.icon} size={28} color="#fff" />
      </View>
      <Text style={styles.quickActionText}>{props.label}</Text>
    </TouchableOpacity>
  );
}

function NetworkBadge({ label }: { label: string }) {
  useLanguage();
  return (
    <View style={styles.networkBadge}>
      <Text style={styles.networkBadgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scannerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 44, height: 44 },
  totalCard: {
    alignItems: 'center',
    paddingVertical: 32,
    marginTop: 30,
  },
  balanceStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  totalLabel: { color: '#a3a3ad', fontSize: 15, fontWeight: '500', textAlign: 'center', flexShrink: 1 },
  total: { color: '#fff', fontSize: 48, fontWeight: '600', textAlign: 'center', width: '100%', fontVariant: ['tabular-nums'] },
  valuationNote: { color: '#777783', fontSize: 12, marginTop: 8, textAlign: 'center' },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 12,
    marginBottom: 8,
  },
  quickAction: { flex: 1, alignItems: 'center', minWidth: 68 },
  quickActionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#141416',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickActionText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  sectionMeta: { color: '#777783', fontSize: 12, fontWeight: '600' },
  activityToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, paddingVertical: 16, minHeight: 64 },
  activityToggleText: { flex: 1 },
  loadEarlier: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginBottom: 8 },
  waitingText: { color: '#a3a3ad', fontSize: 13, lineHeight: 20, marginBottom: 12 },
  assetList: { gap: 10 },
  balanceCard: {
    backgroundColor: '#121216',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceDetails: { flex: 1, minWidth: 0 },
  balanceTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  balanceLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  balanceSubtitle: { color: '#7f7f8b', fontSize: 12, marginTop: 4 },
  balanceTrailing: { alignItems: 'flex-end', gap: 5, maxWidth: '44%' },
  balanceValue: { color: '#fff', fontWeight: '800', fontSize: 14, textAlign: 'right' },
  networkBadge: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  networkBadgeText: { color: '#9b9ba7', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  transaction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121216',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    gap: 11,
  },
  transactionBody: { flex: 1, minWidth: 0 },
  transactionTitle: { color: '#fff', fontWeight: '700' },
  transactionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  transactionMeta: { color: '#777783', fontSize: 11 },
  transactionTrailing: { alignItems: 'flex-end', gap: 7, maxWidth: '40%' },
  transactionAmount: { color: '#fff', fontWeight: '800', fontSize: 12, marginLeft: 6 },
  incoming: { color: '#49d17d' },
  statusPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  statusPillSuccess: { backgroundColor: 'rgba(73,209,125,0.12)' },
  statusPillPending: { backgroundColor: 'rgba(255,176,0,0.12)' },
  statusPillError: { backgroundColor: 'rgba(255,102,102,0.14)' },
  statusPillText: { color: '#b8b8c2', fontSize: 9, fontWeight: '700' },
  empty: {
    backgroundColor: '#121216',
    borderRadius: 16,
    paddingVertical: 26,
    alignItems: 'center',
  },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 10 },
  emptyText: { color: '#777783', fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginTop: 12,
    backgroundColor: 'rgba(242,180,93,0.08)',
    borderRadius: 12,
  },
  error: { color: '#d3a25d', flex: 1, fontSize: 12 },
});
