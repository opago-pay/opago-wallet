import type { ExchangeRates } from '@/hooks/useExchangeRates';

export interface PortfolioBalances {
  sparkSats: number | null;
  hbarTinybars: bigint | null;
}

const SATS_PER_BTC = 100_000_000;
const TINYBARS_PER_HBAR = 100_000_000;

export function calculateBitcoinEur(sats: number | null, btcToEur: number): number | null {
  if (sats === null || !Number.isSafeInteger(sats) || sats < 0) return null;
  if (sats === 0) return 0;
  if (!Number.isFinite(btcToEur) || btcToEur <= 0) return null;
  const total = sats / SATS_PER_BTC * btcToEur;
  return Number.isFinite(total) ? total : null;
}

export function calculateHederaEur(tinybars: bigint | null, hbarToEur: number): number | null {
  if (tinybars === null || tinybars < 0n) return null;
  if (tinybars === 0n) return 0;
  if (!Number.isFinite(hbarToEur) || hbarToEur <= 0) return null;
  const total = Number(tinybars) / TINYBARS_PER_HBAR * hbarToEur;
  return Number.isFinite(total) ? total : null;
}

// Sum the values of the same asset cards shown on Home. A missing value must
// never turn the displayed total into an unlabeled partial portfolio.
export function sumAssetValuesEur(values: readonly (number | null)[]): number | null {
  if (!values.length) return null;
  let total = 0;
  for (const value of values) {
    if (value === null || !Number.isFinite(value) || value < 0) return null;
    total += value;
  }
  return Number.isFinite(total) ? total : null;
}

export function calculatePortfolioEur(
  balances: PortfolioBalances,
  rates: ExchangeRates,
): number | null {
  return sumAssetValuesEur([
    calculateBitcoinEur(balances.sparkSats, rates.btcToEur),
    calculateHederaEur(balances.hbarTinybars, rates.hbarToEur),
  ]);
}
