import type { ExchangeRates } from '@/hooks/useExchangeRates';

export interface PortfolioBalances {
  sparkSats: number;
  solLamports: bigint;
  usdcBaseUnits: bigint;
  hbarTinybars: bigint;
}

const SATS_PER_BTC = 100_000_000;
const LAMPORTS_PER_SOL = 1_000_000_000;
const USDC_BASE_UNITS = 1_000_000;
const TINYBARS_PER_HBAR = 100_000_000;

export function calculatePortfolioEur(
  balances: PortfolioBalances,
  rates: ExchangeRates,
): number | null {
  const values = [
    balances.sparkSats,
    Number(balances.solLamports),
    Number(balances.usdcBaseUnits),
    Number(balances.hbarTinybars),
    rates.btcToEur,
    rates.solToEur,
    rates.usdcToEur,
    rates.hbarToEur,
  ];
  if (values.some(value => !Number.isFinite(value) || value < 0)) return null;
  if (
    rates.btcToEur <= 0 ||
    rates.solToEur <= 0 ||
    rates.usdcToEur <= 0 ||
    rates.hbarToEur <= 0
  ) return null;

  const total =
    (balances.sparkSats / SATS_PER_BTC) * rates.btcToEur +
    (Number(balances.solLamports) / LAMPORTS_PER_SOL) * rates.solToEur +
    (Number(balances.usdcBaseUnits) / USDC_BASE_UNITS) * rates.usdcToEur +
    (Number(balances.hbarTinybars) / TINYBARS_PER_HBAR) * rates.hbarToEur;
  return Number.isFinite(total) ? total : null;
}
