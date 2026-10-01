export interface ExchangeRates {
  btcToEur: number;
  hbarToEur: number;
}

export interface CachedExchangeRate { eur: number; at: number }
export interface ExchangeRateCache {
  version: 1;
  btc?: CachedExchangeRate;
  hbar?: CachedExchangeRate;
}

export const EXCHANGE_RATE_FRESH_MS = 5 * 60_000;
export const EXCHANGE_RATE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

function validQuote(quote: CachedExchangeRate | undefined, now: number): CachedExchangeRate | undefined {
  if (!quote || typeof quote.eur !== 'number' || !Number.isFinite(quote.eur) || quote.eur <= 0 || quote.eur > 1e12 ||
      !Number.isSafeInteger(quote.at) || quote.at <= 0 || quote.at > now || now - quote.at > EXCHANGE_RATE_MAX_AGE_MS) return;
  return { eur: quote.eur, at: quote.at };
}

export function parseExchangeRateCache(raw: string | null, now = Date.now()): ExchangeRateCache {
  try {
    if (!raw || raw.length > 1_024) return { version: 1 };
    const cache = JSON.parse(raw) as ExchangeRateCache;
    if (cache?.version !== 1) return { version: 1 };
    return { version: 1, btc: validQuote(cache.btc, now), hbar: validQuote(cache.hbar, now) };
  } catch { return { version: 1 }; }
}

/** Missing/invalid assets never replace a known price or change its timestamp. */
export function mergeExchangeRateCache(previous: ExchangeRateCache, next: ExchangeRateCache, now = Date.now()): ExchangeRateCache {
  const merge = (oldQuote?: CachedExchangeRate, newQuote?: CachedExchangeRate) => {
    const old = validQuote(oldQuote, now);
    const fresh = validQuote(newQuote, now);
    return fresh && (!old || fresh.at >= old.at) ? fresh : old;
  };
  return { version: 1, btc: merge(previous.btc, next.btc), hbar: merge(previous.hbar, next.hbar) };
}

export function exchangeRateCacheView(cache: ExchangeRateCache, now = Date.now()) {
  const btc = validQuote(cache.btc, now);
  const hbar = validQuote(cache.hbar, now);
  return {
    btcToEur: btc?.eur ?? 0, hbarToEur: hbar?.eur ?? 0,
    btcUpdatedAt: btc?.at ?? 0, hbarUpdatedAt: hbar?.at ?? 0,
    // Existing BTC send/receive callers use updatedAt. HBAR's age is separate.
    updatedAt: btc?.at ?? hbar?.at ?? 0,
  };
}
