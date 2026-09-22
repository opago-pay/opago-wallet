import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { appConfig } from '@/lib/config';
import { walletSession } from '@/lib/wallet-session';
import { bitcoinScope, reconcileBitcoinWithdrawals, type OnchainWallet } from '@/lib/bitcoin/onchain';
import { discoverBitcoinDeposits } from '@/lib/bitcoin/deposits';
import { bitcoinStore, bitcoinDepositWatch } from '@/lib/bitcoin/store-native';
import type { BitcoinOperation } from '@/lib/bitcoin/store';
import { yieldToUi } from '@/lib/ui-ready';
import { reconcileArchivedBitcoinRequests } from '@/lib/bitcoin/receive-archive';

export function useBitcoinOperations(wallet: OnchainWallet | null, enabled: boolean, discover = false, onSettled?: () => Promise<unknown>) {
  const focused = useIsFocused();
  const [snapshot, setSnapshot] = useState<{ wallet: OnchainWallet | null; records: BitcoinOperation[] }>({ wallet, records: [] });
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const settledCallback = useRef(onSettled);
  settledCallback.current = onSettled;
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!wallet || !enabled || !focused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let session: () => void;
    try { session = walletSession.captureRuntime(); } catch { return; }
    const assertCurrent = () => { session(); if (cancelled) throw new Error('Wallet changed.'); };
    async function run() {
      try {
        await yieldToUi();
        assertCurrent();
        const scope = await bitcoinScope(wallet!, appConfig.sparkNetwork);
        const previous = await bitcoinStore.list(scope);
        assertCurrent();
        setSnapshot({ wallet, records: previous });
        let records = previous;
        if (previous.some(item => item.kind === 'withdrawal' && item.state !== 'confirmed')) {
          records = await reconcileBitcoinWithdrawals(wallet!, bitcoinStore, scope, assertCurrent);
        }
        if (discover || previous.some(item => item.kind === 'deposit' && item.state !== 'confirmed') || await bitcoinDepositWatch.has(scope)) {
          records = await discoverBitcoinDeposits(wallet!, bitcoinStore, appConfig.sparkNetwork, assertCurrent);
        }
        assertCurrent();
        setSnapshot({ wallet, records });
        setError(false);
        const received = await reconcileArchivedBitcoinRequests(wallet!, scope, assertCurrent);
        assertCurrent();
        if (received || records.some(item => item.state === 'confirmed' && previous.find(old => old.id === item.id)?.state !== 'confirmed')) {
          void settledCallback.current?.().catch(() => undefined);
        }
      } catch { if (!cancelled) setError(true); }
      if (!cancelled) timer = setTimeout(() => void run(), 15_000);
    }
    void run();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [wallet, enabled, focused, discover, revision]);
  return { operations: snapshot.wallet === wallet ? snapshot.records : [], error, refresh };
}
