import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/http';

const CACHE_EXPIRY = 60_000;
export interface ExchangeRates {
  btcToEur: number;
  hbarToEur: number;
}

const FALLBACK_RATES: ExchangeRates = {
  btcToEur: 0,
  hbarToEur: 0,
};
let cachedRates = FALLBACK_RATES;
let lastFetch = 0;
let ratesRequest: Promise<ExchangeRates> | null = null;

interface CoinGeckoResponse {
  bitcoin?: { eur?: number };
  'hedera-hashgraph'?: { eur?: number };
}

function hasBitcoinRate(rates: ExchangeRates): boolean {
  return Number.isFinite(rates.btcToEur) && rates.btcToEur > 0;
}

async function requestRates(): Promise<ExchangeRates> {
  if (ratesRequest) return ratesRequest;
  ratesRequest = (async () => {
    const data = await fetchJson<CoinGeckoResponse>(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hedera-hashgraph&vs_currencies=eur',
      {},
      { purpose: 'Exchange-rate service', timeoutMs: 8_000 },
    );
    const btcToEur = Number(data.bitcoin?.eur);
    const hbarToEur = Number(data['hedera-hashgraph']?.eur);
    // A missing optional-asset price must not hide the Bitcoin estimate.
    const nextRates = { btcToEur, hbarToEur: Number.isFinite(hbarToEur) && hbarToEur > 0 ? hbarToEur : 0 };
    if (!hasBitcoinRate(nextRates)) {
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
  const [updatedAt, setUpdatedAt] = useState(lastFetch);
  const [isLoading, setIsLoading] = useState(() => Date.now() - lastFetch >= CACHE_EXPIRY || !hasBitcoinRate(cachedRates));

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      if (Date.now() - lastFetch < CACHE_EXPIRY && hasBitcoinRate(cachedRates)) {
        setRates(cachedRates);
        setUpdatedAt(lastFetch);
        setIsLoading(false);
        return;
      }
      try {
        const nextRates = await requestRates();
        if (!cancelled) { setRates(nextRates); setUpdatedAt(lastFetch); }
      } catch {
        if (!cancelled) setRates(cachedRates);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadRates();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => ({ ...rates, isLoading, updatedAt }), [rates, isLoading, updatedAt]);
}
