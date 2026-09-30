import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { fetchJson } from '@/lib/http';
import { measurePerformance } from '@/lib/performance-trace';
import { rememberBitcoinRate } from '@/lib/exchange-rate-snapshot';

// Reopening Send/Receive within a few minutes must not compete with Spark
// requests just to refresh a display-only fiat estimate.
const CACHE_EXPIRY = 5 * 60_000;
const PARTIAL_CACHE_EXPIRY = 30_000;
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

function hasHederaRate(rates: ExchangeRates): boolean {
  return Number.isFinite(rates.hbarToEur) && rates.hbarToEur > 0;
}

function hasAnyRate(rates: ExchangeRates): boolean {
  return hasBitcoinRate(rates) || hasHederaRate(rates);
}

function hasFreshCache(): boolean {
  const expiry = hasBitcoinRate(cachedRates) && hasHederaRate(cachedRates)
    ? CACHE_EXPIRY : PARTIAL_CACHE_EXPIRY;
  return hasAnyRate(cachedRates) && Date.now() - lastFetch < expiry;
}

function validRate(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 && rate <= 1e12 ? rate : 0;
}

function krakenRate(ticker: KrakenTickerResponse, pairNames: string[]): number {
  for (const name of pairNames) {
    const rate = validRate(ticker.result?.[name]?.c?.[0]);
    if (rate > 0) return rate;
  }
  return 0;
}

async function requestRates(): Promise<ExchangeRates> {
  if (ratesRequest) return ratesRequest;
  ratesRequest = (async () => {
    const nextRates = await measurePerformance('rates.fetch', async () => {
      const fetchedRates: ExchangeRates = { ...FALLBACK_RATES };
      try {
        const data = await fetchJson<CoinGeckoResponse>(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hedera-hashgraph&vs_currencies=eur',
          {},
          { purpose: 'Exchange-rate service', timeoutMs: 5_000, maxResponseChars: 16_384, trustedFixedOrigin: true },
        );
        fetchedRates.btcToEur = validRate(data?.bitcoin?.eur);
        fetchedRates.hbarToEur = validRate(data?.['hedera-hashgraph']?.eur);
      } catch {
        // CoinGecko can be unavailable or rate-limited. Resolve each asset below.
      }
      const missingPairs: string[] = [];
      if (!hasBitcoinRate(fetchedRates)) missingPairs.push('XBTEUR');
      if (!hasHederaRate(fetchedRates)) missingPairs.push('HBAREUR');
      if (missingPairs.length) {
        try {
          const ticker = await fetchJson<KrakenTickerResponse>(
            `https://api.kraken.com/0/public/Ticker?pair=${missingPairs.join(',')}&assetVersion=1`,
            {},
            { purpose: 'Exchange-rate fallback', timeoutMs: 5_000, maxResponseChars: 16_384, trustedFixedOrigin: true },
          );
          if (!ticker?.error?.length) {
            if (!hasBitcoinRate(fetchedRates)) fetchedRates.btcToEur = krakenRate(ticker, ['BTC/EUR', 'XXBTZEUR', 'XBTEUR']);
            if (!hasHederaRate(fetchedRates)) fetchedRates.hbarToEur = krakenRate(ticker, ['HBAR/EUR', 'HBAREUR']);
          }
        } catch {
          // Keep a valid price from either provider when the other is unavailable.
        }
      }
      return fetchedRates;
    });
    if (!hasAnyRate(nextRates)) {
      throw new Error('Exchange-rate service returned invalid rates.');
    }
    cachedRates = nextRates;
    lastFetch = Date.now();
    if (hasBitcoinRate(nextRates)) rememberBitcoinRate(nextRates.btcToEur, lastFetch);
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
  const [isLoading, setIsLoading] = useState(() => !hasFreshCache());

  const loadRates = useCallback(async (force = false) => {
      if (!force && hasFreshCache()) {
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
      if (AppState.currentState === 'active' && !hasFreshCache()) {
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
