import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { fetchJson } from '@/lib/http';
import { measurePerformance } from '@/lib/performance-trace';
import { rememberBitcoinRate } from '@/lib/exchange-rate-snapshot';
import { exchangeRateCacheStorage } from '@/lib/exchange-rates-cache-native';
import {
  exchangeRateCacheView, mergeExchangeRateCache, parseExchangeRateCache,
  EXCHANGE_RATE_FRESH_MS, type ExchangeRateCache, type ExchangeRates,
} from '@/lib/exchange-rates-cache';
import { withTimeout } from '@/lib/promise-timeout';

export type { ExchangeRates } from '@/lib/exchange-rates-cache';

// Reopening Send/Receive within a few minutes must not compete with Spark
// requests just to refresh a display-only fiat estimate.
const PARTIAL_CACHE_EXPIRY = 30_000;

const FALLBACK_RATES: ExchangeRates = {
  btcToEur: 0,
  hbarToEur: 0,
};
let cachedQuotes: ExchangeRateCache = { version: 1 };
let lastAttempt = 0;
let restoreRequest: Promise<void> | null = null;
type ExchangeRateView = ReturnType<typeof exchangeRateCacheView>;
let ratesRequest: Promise<ExchangeRateView> | null = null;
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
  const now = Date.now();
  const cached = exchangeRateCacheView(cachedQuotes, now);
  return (hasBitcoinRate(cached) && hasHederaRate(cached) &&
    now - cached.btcUpdatedAt < EXCHANGE_RATE_FRESH_MS && now - cached.hbarUpdatedAt < EXCHANGE_RATE_FRESH_MS) ||
    (lastAttempt > 0 && now >= lastAttempt && now - lastAttempt < PARTIAL_CACHE_EXPIRY);
}

function publishRates(): void {
  const cached = exchangeRateCacheView(cachedQuotes);
  if (hasBitcoinRate(cached)) rememberBitcoinRate(cached.btcToEur, cached.btcUpdatedAt);
  subscribers.forEach(notify => notify());
}

function restoreRates(): Promise<void> {
  if (!restoreRequest) restoreRequest = (async () => {
    try {
      const raw = await withTimeout(exchangeRateCacheStorage.read(), 2_000, 'Exchange-rate cache');
      cachedQuotes = mergeExchangeRateCache(cachedQuotes, parseExchangeRateCache(raw));
      publishRates();
    } catch { /* Storage failure never prevents live quotes or wallet use. */ }
  })();
  return restoreRequest;
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

async function requestRates(): Promise<ExchangeRateView> {
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
    const at = Date.now();
    cachedQuotes = mergeExchangeRateCache(cachedQuotes, {
      version: 1,
      btc: hasBitcoinRate(nextRates) ? { eur: nextRates.btcToEur, at } : undefined,
      hbar: hasHederaRate(nextRates) ? { eur: nextRates.hbarToEur, at } : undefined,
    }, at);
    publishRates();
    // Display immediately; a failed disk write must not turn a good quote into
    // a wallet error. The storage adapter serializes writes in observation order.
    void exchangeRateCacheStorage.write(JSON.stringify(cachedQuotes)).catch(() => undefined);
    return exchangeRateCacheView(cachedQuotes);
  })();
  try {
    return await ratesRequest;
  } finally {
    lastAttempt = Date.now();
    ratesRequest = null;
  }
}

export function useExchangeRates() {
  const [rates, setRates] = useState(() => exchangeRateCacheView(cachedQuotes));
  const [isLoading, setIsLoading] = useState(() => !hasFreshCache());

  const loadRates = useCallback(async (force = false) => {
      await restoreRates();
      if (!force && hasFreshCache()) {
        setRates(exchangeRateCacheView(cachedQuotes));
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const nextRates = await requestRates();
        setRates(nextRates);
      } catch {
        setRates(exchangeRateCacheView(cachedQuotes));
      } finally {
        setIsLoading(false);
      }
  }, []);
  const refresh = useCallback(() => loadRates(true), [loadRates]);

  useEffect(() => {
    let active = true;
    const notify = () => {
      if (!active) return;
      setRates(exchangeRateCacheView(cachedQuotes));
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

  return useMemo(() => ({ ...rates, isLoading, refresh }), [rates, isLoading, refresh]);
}
