import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/http';

const CACHE_EXPIRY = 60_000;
const FALLBACK_RATES = { btcToEur: 0, solToEur: 0 };
let cachedRates = FALLBACK_RATES;
let lastFetch = 0;

interface CoinGeckoResponse {
  bitcoin?: { eur?: number };
  solana?: { eur?: number };
}

export function useExchangeRates() {
  const [rates, setRates] = useState(cachedRates);

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      if (Date.now() - lastFetch < CACHE_EXPIRY && cachedRates.btcToEur > 0) {
        setRates(cachedRates);
        return;
      }
      try {
        const data = await fetchJson<CoinGeckoResponse>(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=eur',
          {},
          { purpose: 'Exchange-rate service', timeoutMs: 8_000 },
        );
        const btcToEur = Number(data.bitcoin?.eur);
        const solToEur = Number(data.solana?.eur);
        if (btcToEur > 0 && solToEur > 0) {
          cachedRates = { btcToEur, solToEur };
          lastFetch = Date.now();
          if (!cancelled) setRates(cachedRates);
        }
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
