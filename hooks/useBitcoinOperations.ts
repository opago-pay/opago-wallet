import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { appConfig } from '@/lib/config';
import { walletSession } from '@/lib/wallet-session';
import { bitcoinScope, reconcileBitcoinWithdrawals, recoverBitcoinProviderWithdrawals, type OnchainWallet } from '@/lib/bitcoin/onchain';
import { discoverBitcoinDeposits } from '@/lib/bitcoin/deposits';
import { bitcoinStore, bitcoinDepositWatch, bitcoinRequestCursor, bitcoinDepositCursor } from '@/lib/bitcoin/store-native';
import type { BitcoinOperation } from '@/lib/bitcoin/store';
import { yieldToUi } from '@/lib/ui-ready';
import { reconcileArchivedBitcoinRequests } from '@/lib/bitcoin/receive-archive';
import { measurePerformance } from '@/lib/performance-trace';

const ACTIVE_POLL_MS = 15_000;
const IDLE_POLL_MS = 45_000;
const needsFastReconciliation = (records: BitcoinOperation[]) => records.some(item =>
  item.state === 'prepared' || item.state === 'checking' || item.state === 'pending' || item.state === 'broadcast');

function sameOperations(left: BitcoinOperation[], right: BitcoinOperation[]) {
  return left === right || (left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return item.id === other.id && item.scope === other.scope && item.network === other.network &&
      item.kind === other.kind && item.address === other.address && item.amountSats === other.amountSats &&
      item.feeSats === other.feeSats && item.actualFeeSats === other.actualFeeSats && item.state === other.state && item.createdAt === other.createdAt &&
      item.quoteId === other.quoteId && item.requestId === other.requestId && item.txid === other.txid &&
      item.vout === other.vout && item.transferId === other.transferId &&
      item.recoveredFromProvider === other.recoveredFromProvider;
  }));
}

export function useBitcoinOperations(wallet: OnchainWallet | null, enabled: boolean, discover = false, onSettled?: () => Promise<unknown>) {
  const focused = useIsFocused();
  const [snapshot, setSnapshot] = useState<{ wallet: OnchainWallet | null; records: BitcoinOperation[] }>({ wallet, records: [] });
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const initialDiscovery = useRef(new WeakSet<object>());
  const initialProviderRecovery = useRef(new WeakSet<object>());
  const settledCallback = useRef(onSettled);
  settledCallback.current = onSettled;
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const publishRecords = useCallback((currentWallet: OnchainWallet, records: BitcoinOperation[]) => {
    setSnapshot(current => current.wallet === currentWallet && sameOperations(current.records, records)
      ? current : { wallet: currentWallet, records });
  }, []);
  useEffect(() => {
    if (!wallet || !enabled || !focused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nextPollMs = IDLE_POLL_MS;
    let session: () => void;
    try { session = walletSession.captureRuntime(); } catch { return; }
    const assertCurrent = () => { session(); if (cancelled) throw new Error('Wallet changed.'); };
    async function run() {
      try {
        await yieldToUi();
        assertCurrent();
        const scope = await bitcoinScope(wallet!, appConfig.sparkNetwork);
        const previous = await measurePerformance('bitcoin.store', () => bitcoinStore.listActive(scope));
        assertCurrent();
        publishRecords(wallet!, previous);
        let records = previous;
        if (!initialProviderRecovery.current.has(wallet!) || await bitcoinRequestCursor.hasPending(scope, 'withdrawal')) {
          const complete = await measurePerformance('bitcoin.provider-restore', () =>
            recoverBitcoinProviderWithdrawals(wallet!, bitcoinStore, scope, bitcoinRequestCursor, assertCurrent));
          if (complete) initialProviderRecovery.current.add(wallet!);
          records = await bitcoinStore.listActive(scope);
          assertCurrent();
          publishRecords(wallet!, records);
        }
        if (records.some(item => item.kind === 'withdrawal' &&
          !['confirmed', 'failed', 'aborted'].includes(item.state))) {
          records = await measurePerformance('bitcoin.withdrawals', () =>
            reconcileBitcoinWithdrawals(wallet!, bitcoinStore, scope, assertCurrent, bitcoinRequestCursor));
        }
        // A seed restore has no local watch flag. Scan once per wallet session
        // after the balance is visible so old static deposits are rediscovered.
        const watchDeposits = discover || !initialDiscovery.current.has(wallet!) ||
          previous.some(item => item.kind === 'deposit' && item.state !== 'confirmed') ||
          await bitcoinDepositCursor.hasPending(scope) ||
          await bitcoinDepositWatch.has(scope);
        if (watchDeposits) {
          records = await measurePerformance('bitcoin.deposits', () =>
            discoverBitcoinDeposits(wallet!, bitcoinStore, appConfig.sparkNetwork, assertCurrent, bitcoinRequestCursor, bitcoinDepositCursor));
          initialDiscovery.current.add(wallet!);
        }
        assertCurrent();
        publishRecords(wallet!, records);
        setError(false);
        nextPollMs = discover || needsFastReconciliation(records) ||
          await bitcoinRequestCursor.hasPending(scope, 'withdrawal') ||
          await bitcoinRequestCursor.hasPending(scope, 'withdrawal-lookup') ||
          await bitcoinDepositCursor.hasPending(scope)
          ? ACTIVE_POLL_MS : IDLE_POLL_MS;
        await yieldToUi();
        assertCurrent();
        const received = await measurePerformance('bitcoin.receipts', () =>
          reconcileArchivedBitcoinRequests(wallet!, scope, assertCurrent));
        assertCurrent();
        if (received || previous.some(item => !records.find(current => current.id === item.id))) {
          void settledCallback.current?.().catch(() => undefined);
        }
      } catch { if (!cancelled) setError(true); }
      if (!cancelled) timer = setTimeout(() => void run(), nextPollMs);
    }
    void run();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [wallet, enabled, focused, discover, revision, publishRecords]);
  return { operations: snapshot.wallet === wallet ? snapshot.records : [], error, refresh };
}
