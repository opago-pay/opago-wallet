import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { PublicKey } from '@solana/web3.js';
import { loadResilientSolanaAccount } from '@/lib/solana/account-native';
import type { HederaAccountSnapshot } from '@/lib/hedera/account';
import type { WalletBalances } from '@/components/send/types';

interface SparkBalanceReader {
  getBalance(): Promise<{ balance?: unknown; satsBalance?: { incoming?: unknown } }>;
}

const emptyBalances = (): WalletBalances => ({
  spark: 0,
  solLamports: 0n,
  usdcBaseUnits: 0n,
  hbarTinybars: 0n,
  solAvailability: 'loading',
  usdcAvailability: 'loading',
});
const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Balance refresh failed.';

export function useWalletBalances(params: {
  walletReady: boolean;
  sparkWallet: SparkBalanceReader | null;
  solanaPublicKey: PublicKey | null;
  refreshHederaAccount(): Promise<HederaAccountSnapshot | null>;
}) {
  const [balances, setBalances] = useState<WalletBalances>(emptyBalances);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refreshBalances = useCallback(async (forceRefresh = false) => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const operation = (async () => {
      if (!params.walletReady) {
        setBalances(emptyBalances());
        setBalanceError(null);
        return;
      }

      const [sparkResult, solanaResult, hederaResult] = await Promise.allSettled([
        params.sparkWallet ? params.sparkWallet.getBalance() : Promise.resolve(null),
        params.solanaPublicKey
          ? loadResilientSolanaAccount(params.solanaPublicKey, { forceRefresh })
          : Promise.resolve(null),
        params.refreshHederaAccount(),
      ]);
      const errors: string[] = [];
      if (sparkResult.status === 'rejected') {
        errors.push('Lightning: ' + errorMessage(sparkResult.reason));
      }
      if (solanaResult.status === 'fulfilled' && solanaResult.value) {
        errors.push(...solanaResult.value.warnings);
      } else if (solanaResult.status === 'rejected') {
        errors.push('Solana: ' + errorMessage(solanaResult.reason));
      }
      if (hederaResult.status === 'rejected') {
        errors.push('Hedera: ' + errorMessage(hederaResult.reason));
      }

      setBalances(current => {
        const next = { ...current };
        if (sparkResult.status === 'fulfilled' && sparkResult.value) {
          next.spark =
            (Number(sparkResult.value.balance) || 0) +
            (Number(sparkResult.value.satsBalance?.incoming) || 0);
        }
        if (solanaResult.status === 'fulfilled' && solanaResult.value) {
          next.solAvailability = solanaResult.value.availability.SOL;
          next.usdcAvailability = solanaResult.value.availability.USDC;
          if (solanaResult.value.availability.SOL !== 'unavailable') {
            next.solLamports = solanaResult.value.balanceLamports;
          }
          if (solanaResult.value.availability.USDC !== 'unavailable') {
            next.usdcBaseUnits = solanaResult.value.usdcBaseUnits;
          }
        } else if (solanaResult.status === 'rejected') {
          if (next.solAvailability === 'loading') next.solAvailability = 'unavailable';
          if (next.usdcAvailability === 'loading') next.usdcAvailability = 'unavailable';
        }
        if (hederaResult.status === 'fulfilled') {
          next.hbarTinybars = hederaResult.value?.balanceTinybars || 0n;
        }
        return next;
      });
      setBalanceError(errors.length ? errors.join(' ') : null);
    })();
    refreshInFlight.current = operation;
    try {
      await operation;
    } finally {
      if (refreshInFlight.current === operation) refreshInFlight.current = null;
    }
  }, [
    params.refreshHederaAccount,
    params.solanaPublicKey,
    params.sparkWallet,
    params.walletReady,
  ]);

  useFocusEffect(useCallback(() => {
    void refreshBalances();
  }, [refreshBalances]));

  return { balances, balanceError, refreshBalances };
}
