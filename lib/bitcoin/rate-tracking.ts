import type { createBitcoinSqliteStore } from './store-sqlite';
import type { BitcoinOperation } from './store';

/** Observe committed metadata only; a failed rate write cannot affect funds. */
export function withBitcoinRateTracking(store: ReturnType<typeof createBitcoinSqliteStore>,
  observe: (operation: BitcoinOperation, assertCurrent: () => void) => void) {
  const notify = (record: BitcoinOperation, assertCurrent: () => void) => { try { observe(record, assertCurrent); } catch { /* Optional valuation. */ } };
  return {
    ...store,
    async begin(...args: Parameters<typeof store.begin>) {
      await store.begin(...args); notify(args[0], args[1]);
    },
    async update(...args: Parameters<typeof store.update>) {
      const record = await store.update(...args); notify(record, args[3]); return record;
    },
    async upsertDiscoveredDeposits(...args: Parameters<typeof store.upsertDiscoveredDeposits>) {
      await store.upsertDiscoveredDeposits(...args); args[1].forEach(record => notify(record, args[2]));
    },
    async mergeProviderWithdrawals(...args: Parameters<typeof store.mergeProviderWithdrawals>) {
      const seen: BitcoinOperation[] = [];
      await store.mergeProviderWithdrawals(args[0], args[1].map(update => ({ ...update,
        transform: previous => { const next = update.transform(previous); seen.push(next); return next; },
      })), args[2]);
      seen.forEach(record => notify(record, args[2]));
    },
  };
}
