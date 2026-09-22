import { withTimeout } from './promise-timeout';

export interface SparkBalanceResult {
  balance?: unknown;
  satsBalance?: { available?: unknown; owned?: unknown; incoming?: unknown };
}

export interface SparkBalanceReader {
  getBalance(): Promise<SparkBalanceResult>;
  getCachedBalance?(): Promise<SparkBalanceResult>;
}

const synchronizedAt = new WeakMap<SparkBalanceReader, number>();
const pending = new WeakMap<SparkBalanceReader, Promise<SparkBalanceResult>>();

export function markSparkWalletSynchronized(wallet: SparkBalanceReader) {
  synchronizedAt.set(wallet, Date.now());
}

/** Display only. Payment authorization must always call getBalance directly. */
export async function loadDisplaySparkBalance(wallet: SparkBalanceReader): Promise<SparkBalanceResult> {
  const existing = pending.get(wallet);
  if (existing) return existing;
  const synchronized = synchronizedAt.get(wallet);
  synchronizedAt.delete(wallet);
  const operation = withTimeout((async () => {
    // initialize() has already synchronized leaves and token outputs. Reuse that
    // result once, rather than immediately repeating both network round trips.
    if (synchronized !== undefined && Date.now() - synchronized < 5_000 && wallet.getCachedBalance) {
      try { return await wallet.getCachedBalance(); }
      catch { /* Fall back to a fresh read if the SDK cache cannot be read. */ }
    }
    return wallet.getBalance();
  })(), 8_000, 'Lightning balance refresh timed out.');
  pending.set(wallet, operation);
  try { return await operation; }
  finally { if (pending.get(wallet) === operation) pending.delete(wallet); }
}
