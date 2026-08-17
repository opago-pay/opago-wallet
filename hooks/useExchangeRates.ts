import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/http';

const CACHE_EXPIRY = 60_000;
export interface ExchangeRates {
  btcToEur: number;
  solToEur: number;
  usdcToEur: number;
  hbarToEur: number;
}

const FALLBACK_RATES: ExchangeRates = {
  btcToEur: 0,
  solToEur: 0,
  usdcToEur: 0,
  hbarToEur: 0,
};
let cachedRates = FALLBACK_RATES;
let lastFetch = 0;
let ratesRequest: Promise<ExchangeRates> | null = null;

interface CoinGeckoResponse {
  bitcoin?: { eur?: number };
  solana?: { eur?: number };
  'usd-coin'?: { eur?: number };
  'hedera-hashgraph'?: { eur?: number };
}

function hasCompleteRates(rates: ExchangeRates): boolean {
  return Object.values(rates).every(rate => Number.isFinite(rate) && rate > 0);
}

async function requestRates(): Promise<ExchangeRates> {
  if (ratesRequest) return ratesRequest;
  ratesRequest = (async () => {
    const data = await fetchJson<CoinGeckoResponse>(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana,usd-coin,hedera-hashgraph&vs_currencies=eur',
      {},
      { purpose: 'Exchange-rate service', timeoutMs: 8_000 },
    );
    const btcToEur = Number(data.bitcoin?.eur);
    const solToEur = Number(data.solana?.eur);
    const usdcToEur = Number(data['usd-coin']?.eur);
    const hbarToEur = Number(data['hedera-hashgraph']?.eur);
    const nextRates = { btcToEur, solToEur, usdcToEur, hbarToEur };
    if (!hasCompleteRates(nextRates)) {
      throw new Error('Exchange-rate service returned invalid rates.');
    }
    cachedRates = nextRates;
    lastFetch = Date.now();
    return cachedRates;
  })();
  try {
    return await ratesRequest;
  } finally {
    ratesRequest = null;
  }
}

export function useExchangeRates() {
  const [rates, setRates] = useState(cachedRates);

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      if (Date.now() - lastFetch < CACHE_EXPIRY && hasCompleteRates(cachedRates)) {
        setRates(cachedRates);
        return;
      }
      try {
        const nextRates = await requestRates();
        if (!cancelled) setRates(nextRates);
      } catch {
        if (!cancelled) setRates(cachedRates);
      }
    }

    void loadRates();
    return () => {
      cancelled = true;
    };
  }, []);

  return rates;
}
