import type { ExchangeRates } from '@/hooks/useExchangeRates';

export interface PortfolioBalances {
  sparkSats: number;
  hbarTinybars: bigint;
}

const SATS_PER_BTC = 100_000_000;
const TINYBARS_PER_HBAR = 100_000_000;

export function calculatePortfolioEur(
  balances: PortfolioBalances,
  rates: ExchangeRates,
): number | null {
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
