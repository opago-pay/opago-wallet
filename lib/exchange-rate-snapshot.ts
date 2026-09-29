export interface BitcoinRateSnapshot {
  btcEur: number;
  fetchedAt: number;
}

let latestBitcoinRate: BitcoinRateSnapshot | null = null;

export function rememberBitcoinRate(btcEur: number, fetchedAt: number): void {
  if (Number.isFinite(btcEur) && btcEur > 0 && btcEur <= 1e12 &&
      Number.isSafeInteger(fetchedAt) && fetchedAt > 0) {
    latestBitcoinRate = { btcEur, fetchedAt };
  }
}

export function currentBitcoinRateSnapshot(now = Date.now()): BitcoinRateSnapshot | null {
  const snapshot = latestBitcoinRate;
  return snapshot && now >= snapshot.fetchedAt && now - snapshot.fetchedAt <= 5 * 60_000
    ? { ...snapshot } : null;
}
