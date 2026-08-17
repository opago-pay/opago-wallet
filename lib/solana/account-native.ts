import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PublicKey } from '@solana/web3.js';
import {
  loadSolanaAccount,
  type SolanaAccountSnapshot,
} from './account';
import { createSolanaAccountCache, type CachedSolanaAccountSnapshot } from './account-cache';

const MEMORY_CACHE_TTL_MS = 10_000;
const persistentCache = createSolanaAccountCache(AsyncStorage);
const inFlight = new Map<string, Promise<SolanaAccountSnapshot>>();
const memoryCache = new Map<string, { snapshot: SolanaAccountSnapshot; cachedAt: number }>();

function warning(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Solana RPC request failed.';
}

function fromPersistent(
  cached: CachedSolanaAccountSnapshot,
  networkWarning?: string,
): SolanaAccountSnapshot {
  return {
    address: cached.address,
    balanceLamports: cached.balanceLamports,
    usdcBaseUnits: cached.usdcBaseUnits,
    availability: {
      SOL: cached.solUpdatedAt ? 'stale' : 'unavailable',
      USDC: cached.usdcUpdatedAt ? 'stale' : 'unavailable',
    },
    warnings: networkWarning ? [networkWarning] : [],
  };
}

function mergeWithPersistent(
  fresh: SolanaAccountSnapshot,
  cached: CachedSolanaAccountSnapshot | null,
): SolanaAccountSnapshot {
  const solUsesCache = fresh.availability.SOL !== 'fresh' && Boolean(cached?.solUpdatedAt);
  const usdcUsesCache = fresh.availability.USDC !== 'fresh' && Boolean(cached?.usdcUpdatedAt);
  return {
    ...fresh,
    balanceLamports: fresh.availability.SOL === 'fresh'
      ? fresh.balanceLamports
      : cached?.balanceLamports || 0n,
    usdcBaseUnits: fresh.availability.USDC === 'fresh'
      ? fresh.usdcBaseUnits
      : cached?.usdcBaseUnits || 0n,
    availability: {
      SOL: solUsesCache ? 'stale' : fresh.availability.SOL,
      USDC: usdcUsesCache ? 'stale' : fresh.availability.USDC,
    },
  };
}

export async function loadResilientSolanaAccount(
  address: PublicKey,
  options: { forceRefresh?: boolean } = {},
): Promise<SolanaAccountSnapshot> {
  const key = address.toBase58();
  const memory = memoryCache.get(key);
  if (!options.forceRefresh && memory && Date.now() - memory.cachedAt < MEMORY_CACHE_TTL_MS) {
    return memory.snapshot;
  }
  const running = inFlight.get(key);
  if (running) return running;

  const operation = (async () => {
    let cached: CachedSolanaAccountSnapshot | null = null;
    try {
      cached = await persistentCache.load(key);
    } catch {
      // AsyncStorage is only a performance cache; live RPC data remains authoritative.
    }
    try {
      const fresh = await loadSolanaAccount(address);
      const merged = mergeWithPersistent(fresh, cached);
      try {
        await persistentCache.mergeFresh(fresh);
      } catch {
        // A cache write failure must not turn a successful balance refresh into an error.
      }
      memoryCache.set(key, { snapshot: merged, cachedAt: Date.now() });
      return merged;
    } catch (cause) {
      if (!cached) throw cause;
      const fallback = fromPersistent(cached, 'Showing the last known Solana balances. ' + warning(cause));
      memoryCache.set(key, { snapshot: fallback, cachedAt: Date.now() });
      return fallback;
    }
  })();
  inFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    if (inFlight.get(key) === operation) inFlight.delete(key);
  }
}
