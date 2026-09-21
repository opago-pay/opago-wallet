export interface BalanceState<T> {
  value: T | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  updatedAt: number;
}

export const unknownBalance = <T>(): BalanceState<T> => ({ value: null, status: 'loading', error: null, updatedAt: 0 });
export const refreshingBalance = <T>(previous: BalanceState<T>): BalanceState<T> => ({ ...previous, status: 'loading', error: null });
export const loadedBalance = <T>(value: T): BalanceState<T> => ({ value, status: 'ready', error: null, updatedAt: Date.now() });
export const failedBalance = <T>(previous: BalanceState<T>, cause: unknown): BalanceState<T> => ({
  value: previous.value,
  updatedAt: previous.updatedAt,
  status: 'error',
  error: cause instanceof Error ? cause.message : 'Balance unavailable. Please try again.',
});

export function readSparkBalance(result: { balance?: unknown; satsBalance?: { incoming?: unknown } }): number {
  function sats(value: unknown): number {
    if (typeof value !== 'number' && typeof value !== 'bigint' && !(typeof value === 'string' && /^\d+$/.test(value))) {
      throw new Error('Lightning returned an invalid balance.');
    }
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Lightning returned an invalid balance.');
    return amount;
  }
  const total = sats(result.balance) + sats(result.satsBalance?.incoming ?? 0);
  if (!Number.isSafeInteger(total)) throw new Error('Lightning returned an invalid balance.');
  return total;
}
