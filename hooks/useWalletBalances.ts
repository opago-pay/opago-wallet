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

const SPARK_STARTUP_PRIORITY_MS = 20_000;

export function useWalletBalances(params: {
  walletReady: boolean;
  sparkWallet: SparkBalanceReader | null;
  initializationError?: string | null;
  enableHedera?: boolean;
  prioritizeSpark?: boolean;
  refreshHederaAccount(): Promise<HederaAccountSnapshot | null>;
}) {
  const { walletReady, sparkWallet, initializationError, refreshHederaAccount, enableHedera = true, prioritizeSpark = false } = params;
  const isFocused = useIsFocused();
  const [sparkSnapshot, setSparkSnapshot] = useState(() => ({ wallet: sparkWallet, state: unknownBalance<number>() }));
  const [incomingSnapshot, setIncomingSnapshot] = useState<{ wallet: SparkBalanceReader | null; value: number | null }>({ wallet: sparkWallet, value: null });
  const spark = sparkSnapshot.wallet === sparkWallet ? sparkSnapshot.state : unknownBalance<number>();
  const [hedera, setHedera] = useState(unknownBalance<bigint>);
  const sparkGeneration = useRef(0);
  const hederaGeneration = useRef(0);
  const hederaPending = useRef<Promise<void> | null>(null);
  const focused = useRef(false);
  const [priorityExpired, setPriorityExpired] = useState(false);
  const sparkSettled = walletReady && !!(sparkWallet || initializationError) && spark.status !== 'loading';
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
      const result = await withTimeout(loadDisplaySparkBalance(sparkWallet), 8_000, 'Lightning balance refresh timed out.');
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
  }, [walletReady, sparkWallet, initializationError]);

  const refreshHederaBalance = useCallback((): Promise<void> => {
    if (!walletReady || !focused.current) return Promise.resolve();
    if (hederaPending.current) return hederaPending.current;
    const request = ++hederaGeneration.current;
    const active = () => focused.current && request === hederaGeneration.current;
    setHedera(current => refreshingBalance(current));
    const operation = (async () => {
      await yieldToUi();
      if (!active()) return;
      recordWalletStartupStage('hbar_refresh_started');
      try {
        const account = await withTimeout(refreshHederaAccount(), 8_000, 'HBAR balance refresh timed out.');
        if (active()) { setHedera(loadedBalance(account?.balanceTinybars ?? 0n)); recordWalletStartupStage('hbar_balance'); }
      } catch (cause) {
        if (active()) setHedera(current => failedBalance(current, cause));
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
    void refreshSparkBalance();
    return () => {
      focused.current = false;
      sparkGeneration.current += 1;
    };
  }, [refreshSparkBalance]));

  useEffect(() => {
    if (isFocused && enableHedera && secondaryDataReady) void refreshHederaBalance();
    return () => { hederaGeneration.current += 1; hederaPending.current = null; };
  }, [isFocused, enableHedera, secondaryDataReady, refreshHederaBalance]);

  const refreshBalances = useCallback(async () => {
    const result = await refreshSparkBalance();
    if (result.current && enableHedera && (!prioritizeSpark || result.settled || priorityExpired)) await refreshHederaBalance();
  }, [refreshSparkBalance, refreshHederaBalance, enableHedera, prioritizeSpark, priorityExpired]);

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
