import type { ExchangeRates } from '@/hooks/useExchangeRates';

export interface PortfolioBalances {
  sparkSats: number | null;
  hbarTinybars: bigint | null;
}

const SATS_PER_BTC = 100_000_000;
const TINYBARS_PER_HBAR = 100_000_000;

export function calculateBitcoinEur(sats: number | null, btcToEur: number): number | null {
  if (sats === null || !Number.isSafeInteger(sats) || sats < 0 || !Number.isFinite(btcToEur) || btcToEur <= 0) return null;
  const total = sats / SATS_PER_BTC * btcToEur;
  return Number.isFinite(total) ? total : null;
}

export function calculateHederaEur(tinybars: bigint | null, hbarToEur: number): number | null {
  if (tinybars === null || tinybars < 0n || !Number.isFinite(hbarToEur) || hbarToEur <= 0) return null;
  const total = Number(tinybars) / TINYBARS_PER_HBAR * hbarToEur;
  return Number.isFinite(total) ? total : null;
}

export function calculatePortfolioEur(
  balances: PortfolioBalances,
  rates: ExchangeRates,
): number | null {
  if (balances.sparkSats === null || balances.hbarTinybars === null) return null;
  const values = [
    balances.sparkSats,
    Number(balances.hbarTinybars),
    rates.btcToEur,
    rates.hbarToEur,
  ];
  if (values.some(value => !Number.isFinite(value) || value < 0)) return null;
  if (
    rates.btcToEur <= 0 || rates.hbarToEur <= 0
  ) return null;

  const total =
    (balances.sparkSats / SATS_PER_BTC) * rates.btcToEur +
    (Number(balances.hbarTinybars) / TINYBARS_PER_HBAR) * rates.hbarToEur;
  return Number.isFinite(total) ? total : null;
}
