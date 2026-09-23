import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { appLocale, t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useColorMode } from '@/hooks/useColorMode';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable, TouchableOpacity } from '@/components/ui/wallet-interaction';
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
import { usePendingLightningPayments } from '@/hooks/usePendingLightningPayments';
import { useBitcoinOperations } from '@/hooks/useBitcoinOperations';
import { bitcoinScope } from '@/lib/bitcoin/onchain';
import { bitcoinStore } from '@/lib/bitcoin/store-native';
import { consumeMoonPayReturnNotice } from '@/lib/moonpay-return-native';
import { recordWalletStartupStage } from '@/lib/startup-timing';
import { markNavigationReady, markNavigationStart, measurePerformance } from '@/lib/performance-trace';
import { BackupReminder } from '@/components/security/backup-prompt';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { getTransactionPage } from '@/lib/database';
import { loadHederaHistoryPage, loadHederaTransactionStatus } from '@/lib/hedera/account';
import {
  getHederaTransactionExplorerUrl,
} from '@/lib/hedera/explorer';
import { openHederaExplorerUrl } from '@/lib/hedera/explorer-native';
import { normalizeHederaTransactionIdForMirror } from '@/lib/hedera/mirror';
import { hederaPaymentJournal } from '@/lib/hedera/payment-journal-native';
import { lightningPaymentJournal } from '@/lib/lightning/payment-journal-native';
import {
  loadSparkTransferPage,
  sparkUserRequestPaymentHash,
} from '@/lib/lightning/spark-history';
import { formatTinybars } from '@/lib/hedera/payments';
import { appConfig } from '@/lib/config';
import { calculateBitcoinEur } from '@/lib/portfolio-valuation';
import { withTimeout } from '@/lib/promise-timeout';
import { HistoryPager } from '@/lib/history-pagination';
import { operationalHealth } from '@/lib/operational-health-native';
import { yieldToUi } from '@/lib/ui-ready';
import { walletSession } from '@/lib/wallet-session';
import {
  getWalletAssetPresentation,
  walletAssetKeyFromSymbol,
  type WalletAssetKey,
} from '@/lib/wallet-assets';
import {
  compactWalletIdentifier,
  formatEurValue,
  paymentHistoryStatus,
  paymentHistoryTitle,
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
  route?: 'lightning' | 'onchain';
  explorerLabel?: 'HashScan';
}

function mapHederaJournal(records: Awaited<ReturnType<typeof hederaPaymentJournal.list>>): DisplayTransaction[] {
  return records.map(item => ({
    key: 'hedera:' + normalizeHederaTransactionIdForMirror(item.transactionId),
    txId: item.transactionId, type: 'outgoing', amountDisplay: formatTinybars(BigInt(item.amountTinybars)),
    asset: 'HBAR', status: item.state, timestamp: item.createdAt,
    explorerUrl: getHederaTransactionExplorerUrl(item.transactionId), explorerLabel: 'HashScan',
  }));
}

export default function HomeScreen() {
  useLanguage();
  useEffect(() => { recordWalletStartupStage('home_mounted'); }, []);
  const { mode } = useColorMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    walletReady,
    sparkWallet,
    hederaPublicKey,
    loadOrGenerateWallet,
    refreshHederaAccount,
    error: walletError,
  } = useWalletAuth();
  const rates = useExchangeRates();
  const [moonPayReturn, setMoonPayReturn] = useState(false);
  useEffect(() => setMoonPayReturn(false), [hederaPublicKey]);
  useFocusEffect(useCallback(() => {
    if (!hederaPublicKey) return;
    let cancelled = false;
    void consumeMoonPayReturnNotice(hederaPublicKey).then(found => {
      if (found && !cancelled) setMoonPayReturn(true);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [hederaPublicKey]));
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [startupComplete, setStartupComplete] = useState(false);
  const [startupTimedOut, setStartupTimedOut] = useState(false);
  const { balances, balanceStates, bitcoinIncoming, secondaryDataReady, sparkPriorityTimedOut, refreshBalances } = useWalletBalances({
    walletReady, sparkWallet, refreshHederaAccount, initializationError: walletError, enableHedera: advancedExpanded, prioritizeSpark: true,
  });
  const preview = useHomeBalancePreview({
    publicKey: hederaPublicKey, spark: balances.spark, hedera: balances.hbarTinybars,
    sparkAt: balanceStates.spark.updatedAt, hederaAt: balanceStates.hedera.updatedAt,
    btcToEur: rates.btcToEur, hbarToEur: rates.hbarToEur, ratesAt: rates.updatedAt,
  });
  const [visibilityRevision, setVisibilityRevision] = useState(0);
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
  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;
  const hiddenHistoryKeys = useRef<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recentLocal, setRecentLocal] = useState<DisplayTransaction | null>(null);
  const historyLoadedRef = useRef(false);
  const historyPagerRef = useRef<HistoryPager<DisplayTransaction> | null>(null);
  const hederaHistoryPending = useRef(false);
  const hederaRecovery = useRef<Promise<void> | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyErrors, setHistoryErrors] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const refreshGenerationRef = useRef(0);
  const refreshInProgressRef = useRef<Promise<void> | null>(null);
  const loadLatestLocal = useCallback(async () => {
    // A small local page also skips hidden unresolved payments without
    // starting Spark/Hedera history just to find one visible row.
    const records = await getTransactionPage(10);
    const item = records.find(record => record.status !== 'pending' ||
      !hiddenHistoryKeys.current.includes(record.txId || 'local:' + record.id));
    return item ? {
      key: item.txId || 'local:' + item.id, txId: item.txId,
      type: item.type, amountDisplay: item.amount.toLocaleString(appLocale()),
      asset: item.asset, status: item.status, timestamp: item.timestamp,
    } satisfies DisplayTransaction : null;
  }, []);

  const refresh = useCallback(async (force = false, mode: 'initial' | 'more' | 'retry' = 'initial') => {
    // Home needs only the locally saved latest payment. Remote pages start
    // when the user opens Activity, never during balance startup or a pull.
    if (!historyOpen) return;
    if (!walletReady) {
      try { await loadOrGenerateWallet(); }
      catch (cause) { setLoadError(cause instanceof Error ? cause.message : t('Wallet initialization failed.')); }
      return;
    }
    // The first history page starts only after the Bitcoin balance is ready.
    // The latest saved payment is shown independently while this runs.
    if (force) historyLoadedRef.current = false;
    if (!secondaryDataReady) {
      if (force) historyPagerRef.current = null;
      return;
    }
    if (refreshInProgressRef.current) return refreshInProgressRef.current;
    if (mode === 'initial' && !force && historyLoadedRef.current) return;
    if (force) historyPagerRef.current = null;
    const generation = ++refreshGenerationRef.current;
    setLoading(true);
    setLoadingMore(mode !== 'initial');
    setLoadError(null);
    const operation = yieldToUi().then(async () => {
      if (generation !== refreshGenerationRef.current) return;
      recordWalletStartupStage('history_refresh_started');
      if (!historyPagerRef.current) {
        let account: ReturnType<typeof refreshHederaAccount> | undefined;
        historyPagerRef.current = new HistoryPager<DisplayTransaction>([
        { id: 'local', label: 'Saved payments', load: async (cursor, limit) => {
          const records = await measurePerformance('history.local', () =>
            getTransactionPage(limit + 1, cursor === undefined ? undefined : Number(cursor)));
          const page = records.slice(0, limit);
          return { next: records.length > limit ? page.at(-1)!.id : null,
            through: page.length ? Date.parse(page.at(-1)!.timestamp) : undefined,
            items: page.map(item => ({
            key: item.txId || 'local:' + item.id, txId: item.txId, type: item.type,
            amountDisplay: item.amount.toLocaleString(appLocale()), asset: item.asset,
            status: item.status, timestamp: item.timestamp,
          })) };
        } },
        { id: 'hedera-journal', label: 'HBAR', load: async () => {
          const records = await hederaPaymentJournal.list();
          hederaHistoryPending.current = records.some(item => item.state === 'pending');
          return { items: mapHederaJournal(records), next: null };
        } },
        { id: 'hedera', label: 'HBAR', load: async (cursor, limit) => {
          account ??= refreshHederaAccount().catch(cause => { account = undefined; throw cause; });
          const current = await account;
          if (!current) return { items: [], next: null };
          const page = await measurePerformance('history.hedera', () =>
            loadHederaHistoryPage(current.accountId, limit, cursor === undefined ? undefined : String(cursor)));
          return { ...page, items: page.items.map(item => ({
            key: 'hedera:' + normalizeHederaTransactionIdForMirror(item.transactionId),
            txId: item.transactionId,
            type: item.direction === 'received' ? 'incoming' as const : 'outgoing' as const,
            amountDisplay: item.amountHbar, asset: 'HBAR', status: item.result.toLowerCase(),
            timestamp: item.occurredAt, explorerUrl: item.hashscanUrl, explorerLabel: 'HashScan' as const,
          })) };
        } },
        { id: 'lightning-journal', label: 'Bitcoin', load: async () => {
          const records = await lightningPaymentJournal.list();
          return { next: null, items: records.map(item => ({
            key: 'ln:' + item.paymentHash, txId: 'ln:' + item.paymentHash,
            type: 'outgoing' as const, amountDisplay: item.amountSats.toLocaleString(appLocale()),
            asset: 'SAT', status: item.state, timestamp: item.createdAt,
          })) };
        } },
        { id: 'onchain', label: 'Bitcoin', load: async () => {
          if (!sparkWallet) return { items: [], next: null };
          const scope = await bitcoinScope(sparkWallet, appConfig.sparkNetwork);
          return { next: null, items: (await bitcoinStore.list(scope)).map(item => ({
            key: item.id, txId: item.txid ?? item.requestId ?? item.id, type: item.kind === 'deposit' ? 'incoming' as const : 'outgoing' as const,
            amountDisplay: item.amountSats ? item.amountSats.toLocaleString(appLocale()) : '—', asset: 'SAT', status: item.state, timestamp: item.createdAt,
            route: 'onchain' as const,
          })) };
        } },
        { id: 'spark', label: 'Bitcoin', load: async (cursor, limit) => {
          if (!sparkWallet) return { items: [], next: null };
          try {
            const page = await measurePerformance('history.spark', () =>
              loadSparkTransferPage(sparkWallet, limit, Number(cursor ?? 0)));
            void operationalHealth.recordSuccess('lightning').catch(() => undefined);
            const timestamps = page.transfers.map(item => new Date(item.createdTime ?? 0).getTime()).filter(Number.isFinite);
            return { next: page.next, through: timestamps.length ? Math.min(...timestamps) : undefined,
              items: page.transfers.flatMap(transfer => {
              if (['CoopExitRequest', 'ClaimStaticDeposit', 'LeavesSwapRequest'].includes(String(transfer.userRequest?.typename))) return [];
              if (!String(transfer.status || '').toUpperCase().includes('COMPLETED')) return [];
              const amount = Math.abs(Number(transfer.totalValue) || 0);
              if (amount <= 0) return [];
              const hash = sparkUserRequestPaymentHash(transfer.userRequest);
              const key = hash ? 'ln:' + hash : 'spark:' + String(transfer.id || 'unknown');
              return [{
                key, txId: key,
                type: String(transfer.transferDirection).toUpperCase() === 'INCOMING' ? 'incoming' as const : 'outgoing' as const,
                amountDisplay: amount.toLocaleString(appLocale()), asset: 'SAT', status: 'confirmed', route: hash ? 'lightning' as const : undefined,
                timestamp: transfer.createdTime ? new Date(transfer.createdTime).toISOString() : new Date().toISOString(),
              }];
            }) };
          } catch (cause) {
            void operationalHealth.recordFailure('lightning', cause).catch(() => undefined);
            throw cause;
          }
        } },
      ], OPTIONAL_ASSET_REFRESH_TIMEOUT_MS, transactionsRef.current,
        item => item.status !== 'pending' || !hiddenHistoryKeys.current.includes(item.key), 20);
      }
      const pager = historyPagerRef.current;
      const publish = () => {
        if (generation !== refreshGenerationRef.current) return;
        const snapshot = pager.snapshot();
        setTransactions(snapshot.items);
        setHistoryHasMore(snapshot.hasMore);
        setHistoryErrors(snapshot.errors);
      };
      await measurePerformance('history.page', () => pager.load(mode, publish));
      if (generation !== refreshGenerationRef.current) return;
      publish();
      historyLoadedRef.current = true;
      // Status recovery is independent of loading a display page. It must not
      // leave a spinner/error on a history page that has already loaded.
      if (hederaHistoryPending.current && !hederaRecovery.current) {
        const recovery = (async () => {
          const assertSession = walletSession.captureRuntime();
          const records = await hederaPaymentJournal.reconcile(async id => {
            const status = await withTimeout(loadHederaTransactionStatus(id), OPTIONAL_ASSET_REFRESH_TIMEOUT_MS, 'HBAR status timed out.');
            assertSession();
            return status;
          });
          if (generation !== refreshGenerationRef.current) return;
          hederaHistoryPending.current = records.some(item => item.state === 'pending');
          pager.replace('hedera-journal', mapHederaJournal(records));
          publish();
        })().catch(() => undefined).finally(() => { if (hederaRecovery.current === recovery) hederaRecovery.current = null; });
        hederaRecovery.current = recovery;
      }
    }).finally(() => {
      if (generation !== refreshGenerationRef.current) return;
      refreshInProgressRef.current = null;
      setLoading(false);
      setLoadingMore(false);
    });
    refreshInProgressRef.current = operation;
    return operation;
  }, [historyOpen, secondaryDataReady, loadOrGenerateWallet, refreshHederaAccount, sparkWallet, walletReady]);

  const refreshSettledPayment = useCallback(async () => {
    const generation = refreshGenerationRef.current;
    historyLoadedRef.current = false;
    const balance = refreshBalances();
    const latest = loadLatestLocal().then(item => {
      if (generation === refreshGenerationRef.current) setRecentLocal(item);
    });
    await Promise.all([balance, latest]);
    if (!historyOpen || generation !== refreshGenerationRef.current) return;
    await refreshInProgressRef.current;
    if (generation === refreshGenerationRef.current) await refresh(true);
  }, [historyOpen, loadLatestLocal, refreshBalances, refresh]);
  const { pendingCount: pendingLightningCount, hiddenPaymentKeys } = usePendingLightningPayments(sparkWallet, secondaryDataReady, refreshSettledPayment, visibilityRevision);
  hiddenHistoryKeys.current = hiddenPaymentKeys;
  const { operations: bitcoinOperations } = useBitcoinOperations(sparkWallet, secondaryDataReady, false, refreshSettledPayment);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    // The wallet must start on Home even while remote history remains lazy.
    // Otherwise a fresh unlock waits until Send, Receive or Security is opened.
    if (!walletReady && !walletError) void loadOrGenerateWallet().catch(() => undefined);
    if (walletReady) void loadLatestLocal().then(item => {
      if (cancelled) return;
      setRecentLocal(item);
    }).catch(() => undefined);
    void refresh();
    return () => {
      cancelled = true;
      refreshGenerationRef.current += 1;
      refreshInProgressRef.current = null;
      historyLoadedRef.current = false;
      historyPagerRef.current = null;
    };
  }, [refresh, loadLatestLocal, loadOrGenerateWallet, walletReady, walletError]));

  useEffect(() => setRecentLocal(null), [hederaPublicKey]);
  useEffect(() => {
    if (!historyOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setHistoryOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [historyOpen]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Refresh must remain available if haptics are unavailable on a device.
      }
      await refreshBalances();
      const latest = await loadLatestLocal();
      setRecentLocal(latest);
      if (historyOpen) await refresh(true);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Wallet data could not be loaded.');
    } finally {
      setRefreshing(false);
    }
  }

  const changePaymentVisibility = useCallback(async (paymentHash: string, hidden: boolean) => {
    try {
      const assertSession = walletSession.capture();
      assertSession();
      await lightningPaymentJournal.setHidden(paymentHash, hidden);
      assertSession();
      setVisibilityRevision(value => value + 1);
    } catch {
      Alert.alert(t('Payment details'), t('The entry could not be updated. Please try again.'));
    }
  }, []);

  const openTransaction = useCallback(async (transaction: DisplayTransaction) => {
    if (transaction.type === 'outgoing' && transaction.asset === 'SAT' && transaction.status === 'pending' && /^ln:[0-9a-f]{64}$/.test(transaction.key)) {
      let record;
      try { record = await lightningPaymentJournal.get(transaction.key.slice(3)); }
      catch {
        Alert.alert(t('Payment details'), t('The entry could not be updated. Please try again.'));
        return;
      }
      if (record?.state === 'pending') {
        Alert.alert(t('Payment details'),
          `${transaction.amountDisplay} SAT · ${new Date(transaction.timestamp).toLocaleString(appLocale())}\n\n${t('Hiding this entry removes it from your usual history and dismisses its notice. Its outcome remains unknown. Status checks and protection against sending it again stay active.')}`,
          [
            { text: t('Close'), style: 'cancel' },
            { text: record.hiddenAt ? t('Show entry again') : t('Hide entry'), onPress: () => { void changePaymentVisibility(record.paymentHash, !record.hiddenAt); } },
          ],
        );
        return;
      }
    }
    if (!transaction.explorerUrl) {
      Alert.alert(t('Payment details'), `${transaction.amountDisplay} ${transaction.asset}\n${t(paymentHistoryStatus(transaction.type, transaction.asset, transaction.status))}\n${transaction.route === 'onchain' ? t('Bitcoin network') : transaction.asset === 'SAT' ? 'Lightning / Spark' : 'Hedera'}\n${transaction.txId ?? ''}`);
      return;
    }
    try {
      await openHederaExplorerUrl(transaction.explorerUrl);
    } catch (cause) {
      Alert.alert(
        t('Could not open explorer'),
        t(cause instanceof Error ? cause.message : t('The explorer link is invalid.')),
      );
    }
  }, [changePaymentVisibility]);

  const visibleTransactions = useMemo(() => transactions.filter(
    item => item.status !== 'pending' || !hiddenPaymentKeys.includes(item.key),
  ), [transactions, hiddenPaymentKeys]);

  const totalEur = calculateBitcoinEur(displayBalances.spark, displayRates.btcToEur);
  const balanceError = balanceStates.spark.error;
  const initialBalanceReady = walletReady && displayBalances.spark !== null
    && (displayRates.btcToEur > 0 || !rates.isLoading);
  useEffect(() => {
    if (initialBalanceReady || startupTimedOut || balanceError) setStartupComplete(true);
  }, [initialBalanceReady, startupTimedOut, balanceError]);
  useFocusEffect(useCallback(() => {
    if (!startupComplete) return;
    const frame = requestAnimationFrame(() => markNavigationReady('home'));
    return () => cancelAnimationFrame(frame);
  }, [startupComplete]));
  useEffect(() => {
    if (startupComplete || initialBalanceReady || balanceError) return;
    const timer = setTimeout(() => setStartupTimedOut(true), 5_000);
    return () => clearTimeout(timer);
  }, [startupComplete, initialBalanceReady, balanceError]);
  useEffect(() => {
    if (totalEur !== null) recordWalletStartupStage('home_value_rendered');
  }, [totalEur]);
  useEffect(() => {
    if (balanceStates.spark.status === 'ready' && balances.spark !== null) recordWalletStartupStage('home_live_balance_rendered');
  }, [balanceStates.spark.status, balances.spark]);
  const balanceCaveat = balanceError
    ? (displayBalances.spark === null ? t('Bitcoin balance unavailable') : t('Last known balance · refresh unavailable'))
    : sparkPriorityTimedOut && displayBalances.spark === null ? t('Bitcoin balance unavailable')
      : previewRates && !rates.isLoading ? t('Last known exchange rates')
        : totalEur === null && !rates.isLoading ? t('EUR estimate unavailable') : null;
  const buyPrimary = displayBalances.spark === 0 || (totalEur !== null && totalEur < 0.005);
  const hederaPriceText = Number.isFinite(displayRates.hbarToEur) && displayRates.hbarToEur > 0
    ? t(!(rates.hbarToEur > 0) || !(rates.updatedAt > 0) || Date.now() - rates.updatedAt > 300_000
      ? '1 HBAR = {price} · last known' : '1 HBAR = {price}', { price: formatEurValue(displayRates.hbarToEur) })
    : t(rates.isLoading ? 'Loading HBAR price…' : 'HBAR price unavailable');

  const localVisible = recentLocal && (recentLocal.status !== 'pending' || !hiddenPaymentKeys.includes(recentLocal.key))
    ? recentLocal : null;
  const loadedLatest = visibleTransactions[0] ?? null;
  const latestTransaction = localVisible && !visibleTransactions.some(item => item.key === localVisible.key)
    && (!loadedLatest || Date.parse(localVisible.timestamp) > Date.parse(loadedLatest.timestamp))
      ? localVisible : loadedLatest;

  if (!startupComplete && !initialBalanceReady && !startupTimedOut && !balanceError) {
    return <StartupLoadingScreen />;
  }

  if (historyOpen) return <HistoryPage
    insets={insets}
    transactions={visibleTransactions}
    loading={!walletReady || loading || !historyLoadedRef.current}
    waitingForSpark={!secondaryDataReady}
    hasMore={historyHasMore}
    loadingMore={loadingMore}
    historyErrors={historyErrors}
    loadError={loadError}
    onClose={() => setHistoryOpen(false)}
    onRefresh={() => void onRefresh()}
    refreshing={refreshing}
    onLoadMore={() => void refresh(false, 'more')}
    onRetry={() => void refresh(false, 'retry')}
    openTransaction={openTransaction}
  />;

  return (
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]}
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
        <Pressable
          style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
          onPress={() => { markNavigationStart('settings'); router.push('/(tabs)/settings'); }}
          hitSlop={10}
          android_ripple={{ color: 'rgba(255,176,0,0.18)' }}
          accessibilityRole="button"
          accessibilityLabel={t('Security')}
        >
          <View pointerEvents="none">
            <Ionicons name="menu-outline" size={32} color={mode === 'light' ? '#18181d' : '#fff'} />
          </View>
        </Pressable>
      </View>

      <View style={styles.totalCard}>
        <View style={styles.totalAmountRow}>
          <Text
            style={styles.total}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            accessibilityLabel={totalEur === null ? t('Bitcoin balance unavailable')
              : t('Estimated Bitcoin balance: {amount}', { amount: formatEurValue(totalEur) })}
          >
            {totalEur === null ? '—' : <><Text style={styles.approximation}>≈ </Text>{formatEurValue(totalEur)}</>}
          </Text>
        </View>
        <View style={styles.satBalanceRow} accessibilityLiveRegion="polite">
          <Text style={styles.satBalance} accessibilityLabel={t('Bitcoin balance: {amount}', { amount: displayBalances.spark === null ? '—' : t('{amount} Sats', { amount: displayBalances.spark.toLocaleString(appLocale()) }) })}>
            {displayBalances.spark === null ? '— Sats' : t('{amount} Sats', { amount: displayBalances.spark.toLocaleString(appLocale()) })}
          </Text>
        </View>
        <View style={styles.balanceStatusRow} accessibilityLiveRegion="polite">
          <Text style={styles.totalLabel}>{t('Bitcoin balance')}</Text>
        </View>
        {!!balanceCaveat && <Text style={styles.balanceCaveat}>{balanceCaveat}</Text>}
      </View>

      <View style={styles.quickActions}>
        {buyPrimary ? <>
          <QuickAction icon="scan-outline" label={t('Send')} isSend onPress={() => { markNavigationStart('send'); router.push('/(tabs)/send'); }} />
          <QuickAction icon="card-outline" label={t('Buy')} primary onPress={() => { markNavigationStart('buy'); setMoonPayReturn(false); router.push('../buy'); }} />
        </> : <>
          <QuickAction icon="card-outline" label={t('Buy')} onPress={() => { markNavigationStart('buy'); setMoonPayReturn(false); router.push('../buy'); }} />
          <QuickAction icon="scan-outline" label={t('Send')} isSend onPress={() => { markNavigationStart('send'); router.push('/(tabs)/send'); }} />
        </>}
        <QuickAction
          icon="qr-code-outline"
          label={t('Receive')}
          onPress={() => { markNavigationStart('receive'); router.push('/(tabs)/receive'); }}
        />
      </View>

      {moonPayReturn && <View accessibilityRole="alert" style={{ backgroundColor: adaptColor('#242018', 'backgroundColor'), borderRadius: 16, padding: 16, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: adaptColor('#f4d38a', 'color'), flex: 1, lineHeight: 20 }}>{t('Check your purchase with MoonPay. Your wallet balance will update after the deposit is confirmed.')}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Close')} onPress={() => setMoonPayReturn(false)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={20} color="#f4d38a" />
        </TouchableOpacity>
      </View>}

      <BackupReminder />
      {(latestTransaction || historyLoadedRef.current) && <>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('Latest activity')}</Text>
        </View>
        {latestTransaction ? <TransactionRow transaction={latestTransaction} openTransaction={openTransaction} />
          : <View style={styles.emptyLatest}>
            <Text style={styles.emptyLatestText}>{historyErrors.length || loadError
              ? t('Payments are temporarily unavailable') : t('No payments yet')}</Text>
          </View>}
      </>}
      <Pressable
        style={({ pressed }) => [styles.historyButton, pressed && styles.historyButtonPressed]}
        onPress={() => setHistoryOpen(true)}
        android_ripple={{ color: 'rgba(255,176,0,0.16)' }}
        accessibilityRole="button"
        accessibilityLabel={t('Show all activity')}
      >
        <Text style={styles.historyButtonText}>{t('Show all activity')}</Text>
        <Ionicons name="arrow-forward-outline" size={19} color="#a3a3ad" />
      </Pressable>
      {pendingLightningCount > 0 && (
        <TouchableOpacity style={styles.pendingPaymentNotice} accessibilityRole="button" onPress={() => setHistoryOpen(true)}>
          <Text style={styles.pendingPaymentTitle}>{t('Payment status unknown')}</Text>
          <Text style={styles.pendingPaymentText} accessibilityLiveRegion="polite">
            {t('We cannot yet confirm whether this payment completed. Do not send it again. We will keep checking automatically.')}
          </Text>
        </TouchableOpacity>
      )}
      {(bitcoinIncoming ?? 0) > 0 && <View style={styles.paymentNotice}><Text style={styles.balanceLabel}>{t('{amount} SAT incoming', { amount: bitcoinIncoming! })}</Text><Text style={styles.balanceSubtitle}>{t('Not included in your available balance yet.')}</Text></View>}
      {bitcoinOperations.some(item => item.state !== 'confirmed') && <TouchableOpacity style={styles.paymentNotice} accessibilityRole="button" onPress={() => router.push('/(tabs)/receive')}>
        <Text style={styles.balanceLabel}>{t('Bitcoin is on its way')}</Text><Text style={styles.balanceSubtitle}>{t('Open Receive to review deposits. Pending withdrawals are checked automatically.')}</Text>
      </TouchableOpacity>}

      <AdvancedOptions expanded={advancedExpanded} onChange={setAdvancedExpanded} label={t('More coins')}>
        {!secondaryDataReady && <Text style={styles.waitingText} accessibilityLiveRegion="polite">{t('Loading Bitcoin balance first…')}</Text>}
        <BalanceCard
          asset="hedera"
          subtitle={hederaPriceText}
          value={displayBalances.hbarTinybars === null ? '—' : formatTinybars(displayBalances.hbarTinybars) + ' HBAR'}
          loading={balanceStates.hedera.status === 'loading'}
          statusText={
            balanceStates.hedera.status === 'error'
              ? displayBalances.hbarTinybars === null ? t('Balance unavailable') : t('Last known balance')
              : balanceStates.hedera.status === 'loading'
                ? (displayBalances.hbarTinybars === null ? t('Loading balance…') : t('Last known balance · updating…'))
                : undefined
          }
        />
      </AdvancedOptions>
      {!!balanceError && (
        <View style={styles.errorNotice}>
          <Ionicons name="cloud-offline-outline" size={18} color="#f2b45d" />
          <Text style={styles.error}>{t("Some balances could not be refreshed. Pull down to try again.")}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function StartupLoadingScreen() {
  useLanguage();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  return <View style={styles.startupScreen} accessibilityLiveRegion="polite">
    <Image source={require('@/assets/images/logo_new.svg')} style={styles.startupLogo} contentFit="contain" accessibilityLabel="Opago" />
    <Text style={styles.startupTitle}>{t('Your wallet is getting ready')}</Text>
    <View style={styles.startupTrack} accessibilityRole="progressbar" accessibilityLabel={t('Loading Bitcoin balance…')}>
      <Animated.View style={[styles.startupPulse, {
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
        transform: [{ scaleX: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.24, 1] }) }],
      }]} />
    </View>
  </View>;
}

function TransactionRow({ transaction, openTransaction }: {
  transaction: DisplayTransaction;
  openTransaction(transaction: DisplayTransaction): Promise<void>;
}) {
  useLanguage();
  const friendlyStatus = paymentHistoryStatus(transaction.type, transaction.asset, transaction.status);
  const title = friendlyStatus === 'Completed'
    ? transaction.asset === 'SAT'
      ? t(transaction.type === 'incoming' ? 'Bitcoin received' : 'Bitcoin sent')
      : transaction.asset === 'HBAR'
        ? t(transaction.type === 'incoming' ? 'HBAR received' : 'HBAR sent')
        : paymentHistoryTitle(transaction.type, transaction.status)
    : paymentHistoryTitle(transaction.type, transaction.status);
  const timestamp = new Date(transaction.timestamp);
  const dateLabel = Number.isNaN(timestamp.getTime()) ? '—' : timestamp.toLocaleString(appLocale(), {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return <TouchableOpacity
    style={styles.transaction}
    onPress={() => void openTransaction(transaction)}
    accessibilityRole="button"
    accessibilityLabel={`${title} ${transaction.amountDisplay} ${transaction.asset}, ${t(friendlyStatus)}`}
  >
    <AssetIcon asset={walletAssetKeyFromSymbol(transaction.asset)} size={40} />
    <View style={styles.transactionBody}>
      <Text style={styles.transactionTitle}>{title}</Text>
      <View style={styles.transactionMetaRow}>
        <Text style={styles.transactionMeta}>{dateLabel}</Text>
        <View style={[styles.statusPill, friendlyStatus === 'Completed'
          ? styles.statusPillSuccess : friendlyStatus === 'Needs attention'
            ? styles.statusPillError : styles.statusPillPending]}>
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
  </TouchableOpacity>;
}

function HistoryPage({ insets, transactions, loading, waitingForSpark, loadError, openTransaction,
  hasMore, loadingMore, historyErrors, onLoadMore, onRetry, onClose, onRefresh, refreshing }: {
  insets: { top: number; bottom: number };
  transactions: DisplayTransaction[]; loading: boolean; waitingForSpark: boolean; loadError: string | null;
  openTransaction(transaction: DisplayTransaction): Promise<void>;
  hasMore: boolean; loadingMore: boolean; historyErrors: string[]; onLoadMore(): void; onRetry(): void;
  onClose(): void; onRefresh(): void; refreshing: boolean;
}) {
  useLanguage();
  return <ScrollView
    style={styles.container}
    contentContainerStyle={[styles.historyContent, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 28 }]}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffb000" />}
  >
    <View style={styles.historyHeader}>
      <Text style={styles.historyTitle}>{t('Activity')}</Text>
      <Pressable onPress={onClose} style={styles.historyClose} accessibilityRole="button" accessibilityLabel={t('Close')}>
        <Ionicons name="close" size={27} color={adaptColor('#fff', 'color')} />
      </Pressable>
    </View>
    {waitingForSpark && transactions.length === 0 && <Text style={styles.waitingText}>{t('Loading Bitcoin balance first…')}</Text>}
    {loading && transactions.length === 0 && !waitingForSpark && <View style={styles.historyLoading}><ActivityIndicator color="#ffb000" /><Text style={styles.waitingText}>{t('Loading…')}</Text></View>}
    {!loading && !waitingForSpark && transactions.length === 0 && !hasMore && !historyErrors.length && !loadError &&
      <View style={styles.empty}>
        <Ionicons name="receipt-outline" size={28} color="#5f5f6b" />
        <Text style={styles.emptyTitle}>{t('No payments yet')}</Text>
        <Text style={styles.emptyText}>{t('Payments you send or receive will appear here.')}</Text>
      </View>}
    {transactions.map(transaction => <TransactionRow key={transaction.key} transaction={transaction} openTransaction={openTransaction} />)}
    {!!loadError && <Text style={styles.error}>{t('Transaction history could not be fully loaded. Pull down to retry.')}</Text>}
    {historyErrors.length > 0 && <View style={styles.historyRetry}>
      <Text style={styles.waitingText}>{t('Could not load {sources} history.', { sources: historyErrors.map(label => t(label)).join(', ') })}</Text>
      <TouchableOpacity onPress={onRetry} disabled={loading} accessibilityRole="button" style={styles.historyRetryButton}>
        <Text style={styles.loadEarlierText}>{t(loading ? 'Loading…' : 'Try again')}</Text>
      </TouchableOpacity>
    </View>}
    {hasMore && <TouchableOpacity
      style={styles.loadEarlier} onPress={onLoadMore} disabled={loading} accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loadingMore }} accessibilityLabel={t('Load earlier payments')}
    >
      <Text style={styles.loadEarlierText}>{t(loadingMore ? 'Loading…' : 'Load earlier')}</Text>
      {loadingMore ? <ActivityIndicator color="#ffb000" size="small" /> : <Ionicons name="chevron-down" size={20} color="#ffb000" />}
    </TouchableOpacity>}
  </ScrollView>;
}

function BalanceCard(props: {
  asset: WalletAssetKey;
  value: string;
  loading?: boolean;
  identifier?: string;
  fiatValue?: string;
  statusText?: string;
  subtitle?: string;
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
      accessibilityLabel={`${presentation.name}, ${props.value}, ${props.statusText || ''}, ${props.subtitle ?? (props.identifier ? compactWalletIdentifier(props.identifier) : t(presentation.description))}${props.onCopy ? ', ' + t('Tap to copy address') : ''}`}
    >
      <AssetIcon asset={props.asset} size={44} />
      <View style={styles.balanceDetails}>
        <View style={styles.balanceTitleRow}>
          <Text style={styles.balanceLabel}>{presentation.name}</Text>
          <NetworkBadge label={presentation.networkBadge} />
        </View>
        <Text style={styles.balanceSubtitle} numberOfLines={props.statusText || props.subtitle ? undefined : 1}>
          {props.statusText || props.subtitle || (props.identifier
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
  primary?: boolean;
  isSend?: boolean;
  accessibilityHint?: string;
  onPress(): void;
}) {
  useLanguage();
  const { mode } = useColorMode();
  return (
    <TouchableOpacity
      style={styles.quickAction}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.accessibilityHint}
    >
      <View style={styles.quickActionIconSlot}>
        <View style={[styles.quickActionIcon, props.isSend && styles.quickActionIconEmphasized, props.primary && styles.quickActionIconPrimary]}>
          <Ionicons name={props.icon} size={props.isSend ? 34 : 28} color={props.primary ? '#111111' : mode === 'light' ? '#18181d' : '#fff'} />
        </View>
      </View>
      <Text style={[styles.quickActionText, props.isSend && styles.quickActionTextEmphasized, props.primary && styles.quickActionTextPrimary]}>{props.label}</Text>
    </TouchableOpacity>
  );
}

function NetworkBadge({ label }: { label: string }) {
  useLanguage();
  if (!label.trim() || label === 'MAINNET') return null;

  return (
    <View style={styles.networkBadge}>
      <Text style={styles.networkBadgeText}>{label}</Text>
    </View>
  );
}

const styles = adaptiveStyles(StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  startupScreen: { flex: 1, backgroundColor: '#0a0a0c', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  startupLogo: { width: 76, height: 76, marginBottom: 30 },
  startupTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  startupTrack: { width: 120, height: 3, borderRadius: 2, backgroundColor: '#27231a', overflow: 'hidden', marginTop: 30 },
  startupPulse: { width: '100%', height: 3, borderRadius: 2, backgroundColor: '#ffb000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingsButton: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonPressed: { opacity: 0.62 },
  logo: { width: 44, height: 44 },
  totalCard: {
    alignItems: 'center',
    paddingVertical: 32,
    marginTop: 30,
  },
  satBalanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  satBalance: { color: '#d5d5da', fontSize: 19, fontWeight: '600', fontVariant: ['tabular-nums'] },
  balanceStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  totalAmountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%' },
  totalLabel: { color: '#85858f', fontSize: 13, fontWeight: '500', textAlign: 'center', flexShrink: 1 },
  balanceCaveat: { color: '#a59a84', fontSize: 11, textAlign: 'center', marginTop: 5 },
  approximation: { color: '#a3a3ad', fontSize: 27, fontWeight: '400' },
  total: { color: '#fff', fontSize: 52, fontWeight: '600', textAlign: 'center', flexShrink: 1, fontVariant: ['tabular-nums'] },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 12,
    marginBottom: 8,
  },
  quickAction: { flex: 1, alignItems: 'center', minWidth: 68 },
  quickActionIconSlot: { height: 76, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickActionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#141416',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionIconEmphasized: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#242428', borderColor: '#64646b', borderWidth: 1.5 },
  quickActionIconPrimary: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#ffb000', borderColor: '#ffb000' },
  paymentNotice: { backgroundColor: '#141416', borderRadius: 16, padding: 16, gap: 6, marginTop: 12 },
  pendingPaymentNotice: { backgroundColor: '#211b0f', borderColor: '#66501d', borderWidth: 1, borderRadius: 16, padding: 16, gap: 6, marginTop: 12 },
  pendingPaymentTitle: { color: '#ffb000', fontSize: 15, fontWeight: '700' },
  pendingPaymentText: { color: '#e6ddc8', fontSize: 13, lineHeight: 20 },
  quickActionText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  quickActionTextEmphasized: { fontSize: 15, fontWeight: '700' },
  quickActionTextPrimary: { color: '#ffb000', fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  emptyLatest: { minHeight: 76, borderRadius: 16, backgroundColor: '#121216', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  emptyLatestText: { color: '#9b9ba5', fontSize: 14 },
  historyButton: { minHeight: 48, marginTop: 2, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' },
  historyButtonPressed: { opacity: 0.55 },
  historyButtonText: { color: '#a3a3ad', fontSize: 14, fontWeight: '600' },
  historyContent: { paddingHorizontal: 20, flexGrow: 1 },
  historyHeader: { minHeight: 58, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyTitle: { color: '#fff', fontSize: 28, fontWeight: '800' },
  historyClose: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  historyLoading: { alignItems: 'center', gap: 12, paddingTop: 44 },
  loadEarlier: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20, marginTop: 8, borderRadius: 18, backgroundColor: '#161619', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  loadEarlierText: { color: '#ffb000', fontSize: 16, fontWeight: '600', flexShrink: 1 },
  historyRetry: { paddingTop: 12 },
  historyRetryButton: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
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
  transactionMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 5 },
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
}));
