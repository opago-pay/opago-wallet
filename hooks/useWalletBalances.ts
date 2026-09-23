import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import type { HederaAccountSnapshot } from '@/lib/hedera/account';
import { failedBalance, loadedBalance, readSparkBalance, refreshingBalance, unknownBalance } from '@/lib/balance-state';
import { withTimeout } from '@/lib/promise-timeout';
import { loadDisplaySparkBalance, type SparkBalanceReader } from '@/lib/display-spark-balance';
import { recordWalletStartupStage } from '@/lib/startup-timing';
import { yieldToUi } from '@/lib/ui-ready';
import { readBitcoinBalance } from '@/lib/bitcoin/amount';
import { measurePerformance } from '@/lib/performance-trace';

const SPARK_STARTUP_PRIORITY_MS = 20_000;

export function useWalletBalances(params: {
  walletReady: boolean;
  sparkWallet: SparkBalanceReader | null;
  initializationError?: string | null;
  enableSpark?: boolean;
  enableHedera?: boolean;
  prioritizeSpark?: boolean;
  refreshHederaAccount(): Promise<HederaAccountSnapshot | null>;
}) {
  const { walletReady, sparkWallet, initializationError, refreshHederaAccount, enableSpark = true, enableHedera = true, prioritizeSpark = false } = params;
  const isFocused = useIsFocused();
  const [sparkSnapshot, setSparkSnapshot] = useState(() => ({ wallet: sparkWallet, state: unknownBalance<number>() }));
  const [incomingSnapshot, setIncomingSnapshot] = useState<{ wallet: SparkBalanceReader | null; value: number | null }>({ wallet: sparkWallet, value: null });
  const spark = sparkSnapshot.wallet === sparkWallet ? sparkSnapshot.state : unknownBalance<number>();
  const [hedera, setHedera] = useState(unknownBalance<bigint>);
  const sparkGeneration = useRef(0);
  const hasFocusedSpark = useRef(false);
  const lastFocusedSparkWallet = useRef<SparkBalanceReader | null>(null);
  const hederaGeneration = useRef(0);
  const hederaPending = useRef<Promise<void> | null>(null);
  const hederaLoaded = useRef(false);
  const hederaEnabled = useRef(enableHedera);
  hederaEnabled.current = enableHedera;
  const focused = useRef(false);
  const [priorityExpired, setPriorityExpired] = useState(false);
  // A refresh of a known balance must not reset already-released optional reads.
  const sparkSettled = walletReady && (!enableSpark || (
    !!(sparkWallet || initializationError) && (spark.status !== 'loading' || spark.value !== null)
  ));
  const secondaryDataReady = walletReady && (!prioritizeSpark || sparkSettled || priorityExpired);

  useEffect(() => {
    if (!walletReady || sparkSettled) setPriorityExpired(false);
    if (!walletReady || !prioritizeSpark || !isFocused || sparkSettled || priorityExpired) return;
    // A stalled SDK must not block access to HBAR or activity indefinitely.
    // This releases optional reads without claiming Bitcoin is ready.
    const timer = setTimeout(() => {
      setPriorityExpired(true);
      recordWalletStartupStage('spark_priority_timeout');
    }, SPARK_STARTUP_PRIORITY_MS);
    return () => clearTimeout(timer);
  }, [walletReady, prioritizeSpark, isFocused, sparkSettled, priorityExpired]);

  const refreshSparkBalance = useCallback(async () => {
    if (!enableSpark) return { current: focused.current, settled: true };
    const request = ++sparkGeneration.current;
    const active = () => focused.current && request === sparkGeneration.current;
    setSparkSnapshot(current => ({
      wallet: sparkWallet,
      state: refreshingBalance(current.wallet === sparkWallet ? current.state : unknownBalance<number>()),
    }));
    if (!walletReady || !sparkWallet) {
      if (initializationError && active()) setSparkSnapshot(current => ({
        wallet: sparkWallet, state: failedBalance(current.state, new Error(initializationError)),
      }));
      return { current: active(), settled: walletReady && !!initializationError };
    }
    recordWalletStartupStage('lightning_balance_started');
    try {
      const result = await measurePerformance('balance.spark', () =>
        withTimeout(loadDisplaySparkBalance(sparkWallet), 8_000, 'Lightning balance refresh timed out.'));
      const value = readSparkBalance(result);
      if (active()) {
        setIncomingSnapshot({ wallet: sparkWallet, value: readBitcoinBalance(result).incoming });
        setSparkSnapshot({ wallet: sparkWallet, state: loadedBalance(value) });
        recordWalletStartupStage('lightning_balance');
      }
    } catch (cause) {
      if (active()) setSparkSnapshot(current => ({ wallet: sparkWallet, state: failedBalance(current.state, cause) }));
    }
    return { current: active(), settled: true };
  }, [walletReady, sparkWallet, initializationError, enableSpark]);

  const refreshHederaBalance = useCallback((force = true): Promise<void> => {
    if (!walletReady || !focused.current) return Promise.resolve();
    if (hederaPending.current) return hederaPending.current;
    if (!force && hederaLoaded.current) return Promise.resolve();
    const request = ++hederaGeneration.current;
    const active = () => focused.current && request === hederaGeneration.current;
    setHedera(current => refreshingBalance(current));
    const operation = (async () => {
      await yieldToUi();
      if (!active() || (!force && !hederaEnabled.current)) return;
      recordWalletStartupStage('hbar_refresh_started');
      try {
        const account = await measurePerformance('balance.hedera', () =>
          withTimeout(refreshHederaAccount(), 8_000, 'HBAR balance refresh timed out.'));
        if (active()) {
          hederaLoaded.current = true;
          setHedera(loadedBalance(account?.balanceTinybars ?? 0n));
          recordWalletStartupStage('hbar_balance');
        }
      } catch (cause) {
        if (active()) {
          hederaLoaded.current = false;
          setHedera(current => failedBalance(current, cause));
        }
      }
    })().finally(() => {
      if (hederaPending.current === operation) hederaPending.current = null;
    });
    hederaPending.current = operation;
    return operation;
  }, [walletReady, refreshHederaAccount]);

  // Asset disclosure changes must never restart Bitcoin's balance request.
  useFocusEffect(useCallback(() => {
    focused.current = true;
    let cancelled = false;
    const deferRefresh = hasFocusedSpark.current && lastFocusedSparkWallet.current === sparkWallet;
    hasFocusedSpark.current = true;
    lastFocusedSparkWallet.current = sparkWallet;
    if (deferRefresh) {
      // A return from Security should paint Home before starting SDK work again.
      void yieldToUi().then(() => {
        if (!cancelled) void refreshSparkBalance();
      });
    } else {
      void refreshSparkBalance();
    }
    return () => {
      cancelled = true;
      focused.current = false;
      sparkGeneration.current += 1;
    };
  }, [refreshSparkBalance]));

  // Leaving Home invalidates late results. Closing a disclosure only hides its
  // data: keep an in-flight read and reuse successful data for this Home visit.
  useEffect(() => () => {
    hederaGeneration.current += 1;
    hederaPending.current = null;
    hederaLoaded.current = false;
  }, [isFocused, sparkWallet, refreshHederaBalance]);

  useEffect(() => {
    if (isFocused && enableHedera && secondaryDataReady) void refreshHederaBalance(false);
  }, [isFocused, sparkWallet, enableHedera, secondaryDataReady, refreshHederaBalance]);

  const refreshBalances = useCallback(async () => {
    const result = await refreshSparkBalance();
    if (result.current && hederaEnabled.current && (!prioritizeSpark || result.settled || priorityExpired)) await refreshHederaBalance();
  }, [refreshSparkBalance, refreshHederaBalance, prioritizeSpark, priorityExpired]);

  return {
    balances: { spark: spark.value, hbarTinybars: hedera.value },
    bitcoinIncoming: incomingSnapshot.wallet === sparkWallet ? incomingSnapshot.value : null,
    balanceStates: { spark, hedera },
    balanceError: [spark.error, enableHedera ? hedera.error : null].filter(Boolean).join(' ') || null,
    secondaryDataReady,
    sparkPriorityTimedOut: prioritizeSpark && priorityExpired && !sparkSettled,
    refreshBalances,
  };
}
