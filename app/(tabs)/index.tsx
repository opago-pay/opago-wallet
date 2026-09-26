import { adaptColor, adaptiveStyles } from '@/lib/theme-styles';
import { appLocale, t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useColorMode } from '@/hooks/useColorMode';
import { useWalletMotion } from '@/hooks/useWalletMotion';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable, TouchableOpacity } from '@/components/ui/wallet-interaction';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdvancedOptions } from '@/components/ui/advanced-options';
import { AssetIcon } from '@/components/ui/asset-icon';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useWalletBalances } from '@/hooks/useWalletBalances';
import { useHomeBalancePreview } from '@/hooks/useHomeBalancePreview';
import { usePendingLightningPayments } from '@/hooks/usePendingLightningPayments';
import { useBitcoinOperations } from '@/hooks/useBitcoinOperations';
import { BitcoinConnectionStatus } from '@/components/bitcoin/connection-status';
import { PaymentDetailsScreen } from '@/components/history/payment-details';
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
import { normalizeHederaTransactionIdForMirror } from '@/lib/hedera/mirror';
import { hederaPaymentJournalFor } from '@/lib/hedera/payment-journal-native';
import { lightningPaymentJournalFor } from '@/lib/lightning/payment-journal-native';
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
import { bitcoinOperationHistoryItem, lightningHashFromPayment, type PaymentHistoryItem } from '@/lib/payment-details';
import {
  getWalletAssetPresentation,
  walletAssetKeyFromSymbol,
  type WalletAssetKey,
} from '@/lib/wallet-assets';
import {
  bitcoinOperationNotice,
  compactWalletIdentifier,
  formatEurValue,
  paymentHistoryStatus,
  paymentHistoryTitle,
} from '@/lib/wallet-display';

const OPTIONAL_ASSET_REFRESH_TIMEOUT_MS = 8_000;

type DisplayTransaction = PaymentHistoryItem;

function mapHederaJournal(records: Awaited<ReturnType<ReturnType<typeof hederaPaymentJournalFor>['list']>>): DisplayTransaction[] {
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
    sparkStatus,
    sparkError,
    retrySparkConnection,
    hederaPublicKey,
    loadOrGenerateWallet,
    refreshHederaAccount,
    error: walletError,
  } = useWalletAuth();
  const hederaPaymentJournal = hederaPublicKey ? hederaPaymentJournalFor(appConfig.hederaNetwork, hederaPublicKey) : null;
  const lightningPaymentJournal = hederaPublicKey ? lightningPaymentJournalFor(appConfig.sparkNetwork, hederaPublicKey) : null;
  const lightningScope = useMemo(() => hederaPublicKey ?
    { network: appConfig.sparkNetwork, publicKey: hederaPublicKey } : null, [hederaPublicKey]);
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
  const [selectedTransaction, setSelectedTransaction] = useState<DisplayTransaction | null>(null);
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
      reference: item.reference,
      route: item.asset === 'SAT' && /^ln:[a-f0-9]{64}$/.test(item.txId ?? '') ? 'lightning' : undefined,
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
            status: item.status, timestamp: item.timestamp, reference: item.reference,
            route: item.asset === 'SAT' && /^ln:[a-f0-9]{64}$/.test(item.txId ?? '') ? 'lightning' as const : undefined,
          })) };
        } },
        { id: 'hedera-journal', label: 'HBAR', load: async () => {
          if (!hederaPaymentJournal) return { items: [], next: null };
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
            priority: item.nonce === 0 ? 1 : 0,
          })) };
        } },
        { id: 'lightning-journal', label: 'Bitcoin', load: async () => {
          if (!lightningPaymentJournal) return { items: [], next: null };
          const records = await lightningPaymentJournal.list();
          return { next: null, items: records.map(item => ({
            key: 'ln:' + item.paymentHash, txId: 'ln:' + item.paymentHash,
            type: 'outgoing' as const, amountDisplay: item.amountSats.toLocaleString(appLocale()),
            asset: 'SAT', status: item.state, timestamp: item.createdAt,
            route: 'lightning' as const, requestId: item.requestId,
          })) };
        } },
        { id: 'onchain', label: 'Bitcoin', load: async (cursor, limit) => {
          if (!sparkWallet) return { items: [], next: null };
          const scope = await bitcoinScope(sparkWallet, appConfig.sparkNetwork);
          const page = await bitcoinStore.listHistoryPage(scope, limit, cursor === undefined ? undefined : String(cursor));
          return { next: page.next, through: page.through,
            items: page.items.map(item => bitcoinOperationHistoryItem(item, appLocale())) };
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
      if (hederaPaymentJournal && hederaHistoryPending.current && !hederaRecovery.current) {
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
  }, [historyOpen, secondaryDataReady, loadOrGenerateWallet, refreshHederaAccount, sparkWallet, walletReady, hederaPaymentJournal, lightningPaymentJournal]);

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
  const { pendingCount: pendingLightningCount, hiddenPaymentKeys } = usePendingLightningPayments(sparkWallet,
    lightningScope, secondaryDataReady, refreshSettledPayment, visibilityRevision);
  hiddenHistoryKeys.current = hiddenPaymentKeys;
  const { operations: bitcoinOperations } = useBitcoinOperations(sparkWallet, secondaryDataReady, false, refreshSettledPayment);
  const selectedKey = selectedTransaction?.key;
  const selectedStatus = selectedTransaction?.status;
  useEffect(() => setSelectedTransaction(null), [hederaPublicKey]);
  useEffect(() => {
    if (!selectedKey || !hederaPublicKey) return;
    let cancelled = false;
    let assertSession: () => void;
    try { assertSession = walletSession.captureRuntime(); } catch { return; }
    async function updateDetails() {
      try {
        if (selectedKey!.startsWith('withdraw:') || selectedKey!.startsWith('deposit:')) {
          if (!sparkWallet) return;
          const scope = await bitcoinScope(sparkWallet, appConfig.sparkNetwork);
          const operation = (await bitcoinStore.list(scope)).find(item => item.id === selectedKey);
          assertSession();
          if (!cancelled && operation) setSelectedTransaction(current => {
            if (!current || current.key !== selectedKey) return current;
            return current.status !== operation.state || current.operation?.txid !== operation.txid ||
              current.operation?.actualFeeSats !== operation.actualFeeSats || !current.operation
              ? bitcoinOperationHistoryItem(operation, appLocale()) : current;
          });
        } else if (lightningPaymentJournal && /^ln:[a-f0-9]{64}$/.test(selectedKey!)) {
          const record = await lightningPaymentJournal.get(selectedKey!.slice(3));
          assertSession();
          if (!cancelled && record) setSelectedTransaction(current => {
            if (!current || current.key !== selectedKey) return current;
            return current.status !== record.state || current.requestId !== record.requestId
              ? { ...current, status: record.state, requestId: record.requestId, route: 'lightning' } : current;
          });
        }
      } catch { /* Existing reconciliation retains an unresolved status on read failures. */ }
    }
    void updateDetails();
    const settled = ['confirmed', 'success', 'completed', 'failed', 'aborted'].includes(selectedStatus ?? '');
    const timer = settled ? null : setInterval(() => void updateDetails(), 4_000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [selectedKey, selectedStatus, sparkWallet, lightningPaymentJournal, hederaPublicKey]);

  const openPendingLightningNotice = useCallback(async () => {
    if (!lightningPaymentJournal) { setHistoryOpen(true); return; }
    try {
      const assertSession = walletSession.captureRuntime();
      const records = await lightningPaymentJournal.list();
      assertSession();
      const record = records.filter(item => item.state === 'pending' && !item.hiddenAt)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      if (!record) { setHistoryOpen(true); return; }
      setSelectedTransaction({ key: 'ln:' + record.paymentHash, txId: 'ln:' + record.paymentHash,
        type: 'outgoing', amountDisplay: record.amountSats.toLocaleString(appLocale()), asset: 'SAT',
        status: record.state, timestamp: record.createdAt, route: 'lightning', requestId: record.requestId });
    } catch { setHistoryOpen(true); }
  }, [lightningPaymentJournal]);

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
    if (!historyOpen || selectedTransaction) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setHistoryOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [historyOpen, selectedTransaction]);

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
      if (!lightningPaymentJournal) throw new Error('Wallet identity is unavailable.');
      const assertSession = walletSession.capture();
      assertSession();
      await lightningPaymentJournal.setHidden(paymentHash, hidden);
      assertSession();
      setVisibilityRevision(value => value + 1);
      return true;
    } catch {
      Alert.alert(t('Payment details'), t('The entry could not be updated. Please try again.'));
      return false;
    }
  }, [lightningPaymentJournal]);

  const openTransaction = useCallback((transaction: DisplayTransaction) => {
    setSelectedTransaction(transaction);
  }, []);

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
  const hederaPriceText = Number.isFinite(displayRates.hbarToEur) && displayRates.hbarToEur > 0
    ? t(!(rates.hbarToEur > 0) || !(rates.updatedAt > 0) || Date.now() - rates.updatedAt > 300_000
      ? '1 HBAR = {price} · last known' : '1 HBAR = {price}', { price: formatEurValue(displayRates.hbarToEur) })
    : t(rates.isLoading ? 'Loading HBAR price…' : 'HBAR price unavailable');
  const bitcoinNotice = bitcoinOperationNotice(bitcoinOperations);

  const localVisible = recentLocal && (recentLocal.status !== 'pending' || !hiddenPaymentKeys.includes(recentLocal.key))
    ? recentLocal : null;
  const loadedLatest = visibleTransactions[0] ?? null;
  const latestTransaction = localVisible && !visibleTransactions.some(item => item.key === localVisible.key)
    && (!loadedLatest || Date.parse(localVisible.timestamp) > Date.parse(loadedLatest.timestamp))
      ? localVisible : loadedLatest;

  if (!startupComplete && !initialBalanceReady && !startupTimedOut && !balanceError) {
    return <StartupLoadingScreen />;
  }

  if (selectedTransaction) {
    const hash = lightningHashFromPayment(selectedTransaction);
    return <PaymentDetailsScreen payment={selectedTransaction} onClose={() => setSelectedTransaction(null)}
      onHide={hash && selectedTransaction.type === 'outgoing' && selectedTransaction.status === 'pending'
        ? () => { void changePaymentVisibility(hash, true).then(changed => {
          if (changed) setSelectedTransaction(null);
        }); } : undefined}
      onReviewDeposit={selectedTransaction.operation?.kind === 'deposit' && selectedTransaction.status === 'action_required'
        ? () => { setSelectedTransaction(null); router.push('/bitcoin-deposits' as Href); } : undefined}
    />;
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
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={adaptColor('#ffb000', 'color')} />
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
          onPress={() => { markNavigationStart('settings'); router.push({ pathname: '/(tabs)/settings', params: { section: 'overview' } }); }}
          hitSlop={10}
          android_ripple={{ color: 'rgba(255,176,0,0.18)' }}
          accessibilityRole="button"
          accessibilityLabel={t('Settings')}
        >
          <View pointerEvents="none">
            <Ionicons name="settings-outline" size={28} color={mode === 'light' ? '#18181d' : '#fff'} />
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

      {walletReady && <BitcoinConnectionStatus status={sparkStatus} error={sparkError} onRetry={retrySparkConnection} />}
      <View style={styles.quickActions}>
        <QuickAction
          icon="qr-code-outline"
          label={t('Receive')}
          onPress={() => { markNavigationStart('receive'); router.push('/(tabs)/receive'); }}
        />
        <QuickAction icon="scan-outline" label={t('Send')} isSend onPress={() => { markNavigationStart('send'); router.push('/(tabs)/send'); }} />
        <QuickAction icon="card-outline" label={t('Buy')} onPress={() => { markNavigationStart('buy'); router.push('../buy'); }} />
      </View>

      {moonPayReturn && <View accessibilityRole="alert" style={{ backgroundColor: adaptColor('#242018', 'backgroundColor'), borderRadius: 16, padding: 16, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: adaptColor('#f4d38a', 'color'), flex: 1, lineHeight: 20 }}>{t('Closing MoonPay does not confirm a purchase. Check its order status there. If Bitcoin arrives, Opago will show the deposit and any claim needed.')}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Close')} onPress={() => setMoonPayReturn(false)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={20} color={adaptColor('#f4d38a', 'color')} />
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
        <Ionicons name="arrow-forward-outline" size={19} color={adaptColor('#a3a3ad', 'color')} />
      </Pressable>
      {pendingLightningCount > 0 && (
         <TouchableOpacity style={styles.pendingPaymentNotice} accessibilityRole="button" onPress={() => void openPendingLightningNotice()}>
          <Text style={styles.pendingPaymentTitle}>{t('Payment status unknown')}</Text>
          <Text style={styles.pendingPaymentText} accessibilityLiveRegion="polite">
            {t('We cannot yet confirm whether this payment completed. Do not send it again. We will keep checking automatically.')}
          </Text>
        </TouchableOpacity>
      )}
      {(bitcoinIncoming ?? 0) > 0 && <TouchableOpacity style={styles.paymentNotice} accessibilityRole="button" onPress={() => {
        const operation = bitcoinOperations.filter(item => item.kind === 'deposit')
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        if (operation) setSelectedTransaction(bitcoinOperationHistoryItem(operation, appLocale()));
        else router.push('/bitcoin-deposits' as Href);
      }}><Text style={styles.balanceLabel}>{t('{amount} SAT incoming', { amount: bitcoinIncoming! })}</Text><Text style={styles.balanceSubtitle}>{t('Not included in your available balance yet.')}</Text></TouchableOpacity>}
      {bitcoinNotice && <TouchableOpacity style={styles.paymentNotice} accessibilityRole="button" onPress={() => {
        const kind = bitcoinNotice.destination === 'deposits' ? 'deposit' : 'withdrawal';
        const applicableStates = bitcoinNotice.title === 'Payment status unknown' ? ['checking', 'pending']
          : bitcoinNotice.title === 'Broadcast to the Bitcoin network' ? ['broadcast']
            : bitcoinNotice.title === 'Bitcoin deposit needs your approval' ? ['action_required']
              : ['prepared', 'checking', 'pending', 'broadcast'];
        const operation = bitcoinOperations.filter(item => item.kind === kind && applicableStates.includes(item.state))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        if (operation) setSelectedTransaction(bitcoinOperationHistoryItem(operation, appLocale()));
        else if (kind === 'deposit') router.push('/bitcoin-deposits' as Href);
        else setHistoryOpen(true);
      }}>
        <Text style={styles.balanceLabel}>{t(bitcoinNotice.title)}</Text><Text style={styles.balanceSubtitle}>{t(bitcoinNotice.description)}</Text>
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
          <Ionicons name="cloud-offline-outline" size={18} color={adaptColor('#f2b45d', 'color')} />
          <Text style={styles.error}>{t("Some balances could not be refreshed. Pull down to try again.")}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function StartupLoadingScreen() {
  useLanguage();
  const motionAllowed = useWalletMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pulse.setValue(0);
    if (!motionAllowed) return;
    const animation = Animated.loop(Animated.timing(pulse, {
      toValue: 1, duration: 1600, easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [motionAllowed, pulse]);
  return <View style={styles.startupScreen} accessibilityLiveRegion="polite">
    <Animated.View style={[styles.startupLogo, motionAllowed && {
      transform: [
        { translateY: pulse.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -6, -10, -6, 0] }) },
        { scale: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.06, 1] }) },
        { rotate: pulse.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: ['0deg', '-4deg', '4deg', '0deg'] }) },
      ],
    }]}>
      <Image source={require('@/assets/images/logo_new.svg')} style={styles.startupLogoImage} contentFit="contain" accessibilityLabel="Opago" />
    </Animated.View>
    <Text style={styles.startupTitle}>{t('Your wallet is getting ready')}</Text>
    <View style={styles.startupTrack} accessibilityRole="progressbar" accessibilityLabel={t('Loading Bitcoin balance…')}>
      <Animated.View style={[styles.startupPulse, {
        transform: [{ translateX: motionAllowed ? pulse.interpolate({ inputRange: [0, 1], outputRange: [-48, 144] }) : 48 }],
      }]} />
    </View>
  </View>;
}

function TransactionRow({ transaction, openTransaction }: {
  transaction: DisplayTransaction;
  openTransaction(transaction: DisplayTransaction): void;
}) {
  useLanguage();
  const friendlyStatus = paymentHistoryStatus(transaction.type, transaction.asset, transaction.status, transaction.route);
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
    onPress={() => openTransaction(transaction)}
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
      {transaction.explorerUrl && <Ionicons name="chevron-forward" size={16} color={adaptColor('#5f5f6b', 'color')} />}
    </View>
  </TouchableOpacity>;
}

function HistoryPage({ insets, transactions, loading, waitingForSpark, loadError, openTransaction,
  hasMore, loadingMore, historyErrors, onLoadMore, onRetry, onClose, onRefresh, refreshing }: {
  insets: { top: number; bottom: number };
  transactions: DisplayTransaction[]; loading: boolean; waitingForSpark: boolean; loadError: string | null;
   openTransaction(transaction: DisplayTransaction): void;
  hasMore: boolean; loadingMore: boolean; historyErrors: string[]; onLoadMore(): void; onRetry(): void;
  onClose(): void; onRefresh(): void; refreshing: boolean;
}) {
  useLanguage();
  return <FlatList
    style={styles.container}
    contentContainerStyle={[styles.historyContent, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 28 }]}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adaptColor('#ffb000', 'color')} />}
    data={transactions}
    keyExtractor={(transaction) => transaction.key}
    renderItem={({ item }) => <TransactionRow transaction={item} openTransaction={openTransaction} />}
    initialNumToRender={12}
    maxToRenderPerBatch={12}
    windowSize={7}
    ListHeaderComponent={<>
    <View style={styles.historyHeader}>
      <Text style={styles.historyTitle}>{t('Activity')}</Text>
      <Pressable onPress={onClose} style={styles.historyClose} accessibilityRole="button" accessibilityLabel={t('Close')}>
        <Ionicons name="close" size={27} color={adaptColor('#fff', 'color')} />
      </Pressable>
    </View>
    {waitingForSpark && transactions.length === 0 && <Text style={styles.waitingText}>{t('Loading Bitcoin balance first…')}</Text>}
    {loading && transactions.length === 0 && !waitingForSpark && <View style={styles.historyLoading}><ActivityIndicator color={adaptColor('#ffb000', 'color')} /><Text style={styles.waitingText}>{t('Loading…')}</Text></View>}
    {!loading && !waitingForSpark && transactions.length === 0 && !hasMore && !historyErrors.length && !loadError &&
      <View style={styles.empty}>
        <Ionicons name="receipt-outline" size={28} color={adaptColor('#5f5f6b', 'color')} />
        <Text style={styles.emptyTitle}>{t('No payments yet')}</Text>
        <Text style={styles.emptyText}>{t('Payments you send or receive will appear here.')}</Text>
      </View>}
    </>}
    ListFooterComponent={<>
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
      {loadingMore ? <ActivityIndicator color={adaptColor('#ffb000', 'color')} size="small" /> : <Ionicons name="chevron-down" size={20} color={adaptColor('#ffb000', 'color')} />}
    </TouchableOpacity>}
    </>}
  />;
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
        {props.loading && <ActivityIndicator color={adaptColor('#ffb000', 'color')} size="small" />}
        <Text style={styles.balanceValue}>{props.value}</Text>
        {props.fiatValue && <Text style={styles.balanceSubtitle}>{props.fiatValue}</Text>}
        {props.onCopy && <Ionicons name="copy-outline" size={16} color={adaptColor('#8f8f9d', 'color')} />}
      </View>
    </TouchableOpacity>
  );
}

function QuickAction(props: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
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
        <View style={[styles.quickActionIcon, props.isSend && styles.quickActionIconEmphasized]}>
          <Ionicons name={props.icon} size={props.isSend ? 34 : 28} color={mode === 'light' ? '#18181d' : '#fff'} />
        </View>
      </View>
      <Text style={[styles.quickActionText, props.isSend && styles.quickActionTextEmphasized]}>{props.label}</Text>
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
  startupLogoImage: { width: '100%', height: '100%' },
  startupTitle: { color: '#fff', fontSize: 22, lineHeight: 29, fontWeight: '600', textAlign: 'center' },
  startupTrack: { width: 144, height: 4, borderRadius: 2, backgroundColor: '#27231a', overflow: 'hidden', marginTop: 30 },
  startupPulse: { width: 48, height: 4, borderRadius: 2, backgroundColor: '#ffb000' },
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
  paymentNotice: { backgroundColor: '#141416', borderRadius: 16, padding: 16, gap: 6, marginTop: 12 },
  pendingPaymentNotice: { backgroundColor: '#211b0f', borderColor: '#66501d', borderWidth: 1, borderRadius: 16, padding: 16, gap: 6, marginTop: 12 },
  pendingPaymentTitle: { color: '#ffb000', fontSize: 15, fontWeight: '700' },
  pendingPaymentText: { color: '#e6ddc8', fontSize: 13, lineHeight: 20 },
  quickActionText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  quickActionTextEmphasized: { fontSize: 15, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: { color: '#fff', fontSize: 19, lineHeight: 25, fontWeight: '600' },
  emptyLatest: { minHeight: 76, borderRadius: 16, backgroundColor: '#121216', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  emptyLatestText: { color: '#9b9ba5', fontSize: 14 },
  historyButton: { minHeight: 48, marginTop: 2, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' },
  historyButtonPressed: { opacity: 0.55 },
  historyButtonText: { color: '#a3a3ad', fontSize: 14, fontWeight: '600' },
  historyContent: { paddingHorizontal: 20, flexGrow: 1 },
  historyHeader: { minHeight: 58, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyTitle: { color: '#fff', fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.5 },
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
  balanceLabel: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '600' },
  balanceSubtitle: { color: '#a3a3ad', fontSize: 12, marginTop: 4 },
  balanceTrailing: { alignItems: 'flex-end', gap: 5, maxWidth: '44%' },
  balanceValue: { color: '#fff', fontWeight: '600', fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'], textAlign: 'right' },
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
  transactionTitle: { color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  transactionMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 5 },
  transactionMeta: { color: '#a3a3ad', fontSize: 12, lineHeight: 17 },
  transactionTrailing: { alignItems: 'flex-end', gap: 7, maxWidth: '40%' },
  transactionAmount: { color: '#fff', fontWeight: '600', fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'], marginLeft: 6 },
  incoming: { color: '#49d17d' },
  statusPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  statusPillSuccess: { backgroundColor: 'rgba(73,209,125,0.12)' },
  statusPillPending: { backgroundColor: 'rgba(255,176,0,0.12)' },
  statusPillError: { backgroundColor: 'rgba(255,102,102,0.14)' },
  statusPillText: { color: '#b8b8c2', fontSize: 11, lineHeight: 15, fontWeight: '600' },
  empty: {
    backgroundColor: '#121216',
    borderRadius: 16,
    paddingVertical: 26,
    alignItems: 'center',
  },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 10 },
  emptyText: { color: '#a3a3ad', fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },
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
