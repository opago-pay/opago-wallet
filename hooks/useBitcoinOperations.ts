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
      item.feeSats === other.feeSats && item.state === other.state && item.createdAt === other.createdAt &&
      item.quoteId === other.quoteId && item.requestId === other.requestId && item.txid === other.txid &&
      item.vout === other.vout && item.transferId === other.transferId;
  }));
}

export function useBitcoinOperations(wallet: OnchainWallet | null, enabled: boolean, discover = false, onSettled?: () => Promise<unknown>) {
  const focused = useIsFocused();
  const [snapshot, setSnapshot] = useState<{ wallet: OnchainWallet | null; records: BitcoinOperation[] }>({ wallet, records: [] });
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
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
        const previous = await measurePerformance('bitcoin.store', () => bitcoinStore.list(scope));
        assertCurrent();
        publishRecords(wallet!, previous);
        let records = previous;
        if (previous.some(item => item.kind === 'withdrawal' && item.state !== 'confirmed')) {
          records = await measurePerformance('bitcoin.withdrawals', () =>
            reconcileBitcoinWithdrawals(wallet!, bitcoinStore, scope, assertCurrent));
        }
        const watchDeposits = discover || previous.some(item => item.kind === 'deposit' && item.state !== 'confirmed') ||
          await bitcoinDepositWatch.has(scope);
        if (watchDeposits) {
          records = await measurePerformance('bitcoin.deposits', () =>
            discoverBitcoinDeposits(wallet!, bitcoinStore, appConfig.sparkNetwork, assertCurrent));
        }
        assertCurrent();
        publishRecords(wallet!, records);
        setError(false);
        nextPollMs = discover || needsFastReconciliation(records) ? ACTIVE_POLL_MS : IDLE_POLL_MS;
        await yieldToUi();
        assertCurrent();
        const received = await measurePerformance('bitcoin.receipts', () =>
          reconcileArchivedBitcoinRequests(wallet!, scope, assertCurrent));
        assertCurrent();
        if (received || records.some(item => item.state === 'confirmed' && previous.find(old => old.id === item.id)?.state !== 'confirmed')) {
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
