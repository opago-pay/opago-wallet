import { readBitcoinBalance, type SparkBalanceResponse } from './bitcoin/amount';

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

export function readSparkBalance(result: SparkBalanceResponse): number {
  return readBitcoinBalance(result).available;
}
