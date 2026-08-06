import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { PublicKey } from '@solana/web3.js';
import { getSolanaBalances } from '@/lib/solana';
import type { WalletBalances } from '@/components/send/types';

interface SparkBalanceReader {
  getBalance(): Promise<{ balance?: unknown; satsBalance?: { incoming?: unknown } }>;
}

const EMPTY_BALANCES: WalletBalances = { spark: 0, sol: 0, usdc: 0 };
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'Balance refresh failed.';

export function useWalletBalances(params: {
  walletReady: boolean;
  sparkWallet: SparkBalanceReader | null;
  solanaPublicKey: PublicKey | null;
}) {
  const [balances, setBalances] = useState<WalletBalances>(EMPTY_BALANCES);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const refreshBalances = useCallback(async () => {
    if (!params.walletReady) {
      setBalances(EMPTY_BALANCES);
      setBalanceError(null);
      return;
    }

    const [sparkResult, solanaResult] = await Promise.allSettled([
      params.sparkWallet ? params.sparkWallet.getBalance() : Promise.resolve(null),
      params.solanaPublicKey ? getSolanaBalances(params.solanaPublicKey) : Promise.resolve(null),
    ]);
    const errors: string[] = [];

    setBalances(current => {
      const next = { ...current };
      if (sparkResult.status === 'fulfilled' && sparkResult.value) {
        next.spark =
          (Number(sparkResult.value.balance) || 0) +
          (Number(sparkResult.value.satsBalance?.incoming) || 0);
      } else if (sparkResult.status === 'rejected') {
        errors.push('Lightning: ' + errorMessage(sparkResult.reason));
      }
      if (solanaResult.status === 'fulfilled' && solanaResult.value) {
        next.sol = solanaResult.value.sol;
        next.usdc = solanaResult.value.usdc;
      } else if (solanaResult.status === 'rejected') {
        errors.push('Solana: ' + errorMessage(solanaResult.reason));
      }
      return next;
    });
    setBalanceError(errors.length ? errors.join(' ') : null);
  }, [params.solanaPublicKey, params.sparkWallet, params.walletReady]);

  useFocusEffect(useCallback(() => {
    void refreshBalances();
  }, [refreshBalances]));

  return { balances, balanceError, refreshBalances };
}
