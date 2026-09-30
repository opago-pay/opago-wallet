import { openDatabaseAsync } from 'expo-sqlite';
import { createTransactionRateStore } from './transaction-rates-sqlite';
import { loadHistoricalTransactionRate } from './historical-rates';
import { rateScope, type TransactionRateRequest } from './transaction-rates';
import type { PaymentHistoryItem } from './payment-details';
import type { BitcoinOperation } from './bitcoin/store';
import { appConfig } from './config';
import { walletSession } from './wallet-session';
import { AppState } from 'react-native';

export const transactionRateStore = createTransactionRateStore(() => openDatabaseAsync('opago-transaction-rates.db'));
const listeners = new Set<() => void>();
const running = new Map<string, Promise<void>>();

export function observeTransactionRate(request: TransactionRateRequest, assertCurrent?: () => void): void {
  try {
    const session = assertCurrent ?? walletSession.captureRuntime();
    void transactionRateStore.observe(request, session).then(() => {
      if (AppState.currentState === 'active') return transactionRates.process(request.scope, session);
    }).catch(() => undefined);
  } catch { /* Fiat diagnostics never block or change a payment. History retries indexing. */ }
}

export function observeBitcoinOperationRate(record: BitcoinOperation, assertCurrent?: () => void): void {
  if (record.state === 'aborted') return;
  observeTransactionRate({ scope: 'btc:' + record.scope, key: record.id, asset: 'BTC',
    transactionAt: record.createdAt,
    timeBasis: record.recoveredFromProvider ? 'network' : 'recorded',
    ...(record.network === 'MAINNET' && record.txid && (record.kind === 'deposit' || record.state === 'confirmed')
      ? { bitcoinTxId: record.txid } : {}),
  }, assertCurrent);
}

export function historyRateRequest(item: PaymentHistoryItem, publicKey: string): TransactionRateRequest | null {
  if (!['SAT', 'HBAR'].includes(item.asset)) return null;
  return {
    scope: item.operation ? 'btc:' + item.operation.scope : rateScope(item.asset, publicKey, appConfig),
    key: item.key, asset: item.asset === 'HBAR' ? 'HBAR' : 'BTC',
    transactionAt: item.rateTimeUnknown ? null : item.timestamp,
    timeBasis: item.rateTimeBasis ?? (item.operation?.recoveredFromProvider ? 'network' : 'recorded'),
    ...(item.operation?.network === 'MAINNET' && item.operation.txid &&
      (item.operation.kind === 'deposit' || item.operation.state === 'confirmed')
      ? { bitcoinTxId: item.operation.txid } : {}),
  };
}

export const transactionRates = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async enrich(items: PaymentHistoryItem[], publicKey: string, assertCurrent: () => void): Promise<PaymentHistoryItem[]> {
    return Promise.all(items.map(async item => {
      const request = historyRateRequest(item, publicKey);
      if (!request) return item;
      try {
        const job = await transactionRateStore.observe(request, assertCurrent);
        assertCurrent();
        return { ...item, transactionRate: job.quote, transactionRatePending: !job.quote };
      } catch { return { ...item, transactionRate: item.transactionRate ?? null, transactionRatePending: !item.transactionRate }; }
    }));
  },
  process(scope: string, assertCurrent: () => void): Promise<void> {
    const previous = running.get(scope);
    if (previous) return previous;
    const task = (async () => {
      const jobs = await transactionRateStore.due(scope, Date.now(), 2, assertCurrent);
      for (const job of jobs) {
        assertCurrent();
        let quote = null;
        try { quote = await loadHistoricalTransactionRate(job); } catch { /* Durable retry with backoff. */ }
        assertCurrent();
        await transactionRateStore.finish(job, quote, Date.now(), assertCurrent);
      }
      if (jobs.length) listeners.forEach(listener => listener());
    })().catch(() => undefined).finally(() => { if (running.get(scope) === task) running.delete(scope); });
    running.set(scope, task);
    return task;
  },
};
