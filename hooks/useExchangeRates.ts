import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { fetchJson } from '@/lib/http';
import { measurePerformance } from '@/lib/performance-trace';

// Reopening Send/Receive within a few minutes must not compete with Spark
// requests just to refresh a display-only fiat estimate.
const CACHE_EXPIRY = 5 * 60_000;
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
const subscribers = new Set<() => void>();

interface CoinGeckoResponse {
  bitcoin?: { eur?: number };
  'hedera-hashgraph'?: { eur?: number };
}
interface KrakenTickerResponse {
  error?: string[];
  result?: Record<string, { c?: string[] }>;
}

function hasBitcoinRate(rates: ExchangeRates): boolean {
  return Number.isFinite(rates.btcToEur) && rates.btcToEur > 0;
}

async function requestRates(): Promise<ExchangeRates> {
  if (ratesRequest) return ratesRequest;
  ratesRequest = (async () => {
    const nextRates = await measurePerformance('rates.fetch', async () => {
      try {
        const data = await fetchJson<CoinGeckoResponse>(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hedera-hashgraph&vs_currencies=eur',
          {},
          { purpose: 'Exchange-rate service', timeoutMs: 5_000, maxResponseChars: 16_384, trustedFixedOrigin: true },
        );
        const btcToEur = Number(data.bitcoin?.eur);
        const hbarToEur = Number(data['hedera-hashgraph']?.eur);
        if (!Number.isFinite(btcToEur) || btcToEur <= 0 || btcToEur > 1e12) {
          throw new Error('Exchange-rate service returned invalid rates.');
        }
        // A missing optional-asset price must not hide the Bitcoin estimate.
        return { btcToEur, hbarToEur: Number.isFinite(hbarToEur) && hbarToEur > 0 ? hbarToEur : 0 };
      } catch {
        // The public CoinGecko endpoint can be unavailable or rate-limited.
        // Kraken's public BTC/EUR last-trade price keeps EUR receive amounts usable.
        const ticker = await fetchJson<KrakenTickerResponse>(
          'https://api.kraken.com/0/public/Ticker?pair=XBTEUR&assetVersion=1',
          {},
          { purpose: 'Exchange-rate fallback', timeoutMs: 5_000, maxResponseChars: 16_384, trustedFixedOrigin: true },
        );
        if (ticker.error?.length) throw new Error('Exchange-rate fallback returned an error.');
        const btcToEur = Number(ticker.result?.['BTC/EUR']?.c?.[0]);
        if (!Number.isFinite(btcToEur) || btcToEur <= 0 || btcToEur > 1e12) {
          throw new Error('Exchange-rate fallback returned invalid rates.');
        }
        return { btcToEur, hbarToEur: 0 };
      }
    });
    if (!hasBitcoinRate(nextRates)) {
      throw new Error('Exchange-rate service returned invalid rates.');
    }
    cachedRates = nextRates;
    lastFetch = Date.now();
    subscribers.forEach((notify) => notify());
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

  const loadRates = useCallback(async (force = false) => {
      if (!force && Date.now() - lastFetch < CACHE_EXPIRY && hasBitcoinRate(cachedRates)) {
        setRates(cachedRates);
        setUpdatedAt(lastFetch);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const nextRates = await requestRates();
        setRates(nextRates);
        setUpdatedAt(lastFetch);
      } catch {
        setRates(cachedRates);
      } finally {
        setIsLoading(false);
      }
  }, []);

  useEffect(() => {
    let active = true;
    const notify = () => {
      if (!active) return;
      setRates(cachedRates);
      setUpdatedAt(lastFetch);
    };
    subscribers.add(notify);
    void loadRates();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active' && Date.now() - lastFetch >= CACHE_EXPIRY) {
        void loadRates();
      }
    }, 30_000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadRates();
    });
    return () => {
      active = false;
      subscribers.delete(notify);
      clearInterval(interval);
      appState.remove();
    };
  }, [loadRates]);

  return useMemo(() => ({ ...rates, isLoading, updatedAt, refresh: () => loadRates(true) }), [rates, isLoading, updatedAt, loadRates]);
}
