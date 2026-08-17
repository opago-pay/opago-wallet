import type { SolanaAccountSnapshot } from './account';

export const SOLANA_ACCOUNT_CACHE_PREFIX = 'opago.solana.account-snapshot.v1:';

interface StorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface CachedSolanaAccountSnapshot {
  address: string;
  balanceLamports: bigint;
  usdcBaseUnits: bigint;
  solUpdatedAt: string | null;
  usdcUpdatedAt: string | null;
}

interface StoredSolanaAccountSnapshot {
  version: 1;
  address: string;
  balanceLamports: string;
  usdcBaseUnits: string;
  solUpdatedAt: string | null;
  usdcUpdatedAt: string | null;
}

function storageKey(address: string): string {
  return SOLANA_ACCOUNT_CACHE_PREFIX + address;
}

function parseTimestamp(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error('Cached Solana account timestamp is invalid.');
  }
  return value;
}

function parseAtomicAmount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error('Cached Solana account amount is invalid.');
  }
  return BigInt(value);
}

function parseSnapshot(raw: string, expectedAddress: string): CachedSolanaAccountSnapshot {
  if (raw.length > 4_096) throw new Error('Cached Solana account is too large.');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Cached Solana account is invalid.');
  const document = value as Partial<StoredSolanaAccountSnapshot>;
  if (document.version !== 1 || document.address !== expectedAddress) {
    throw new Error('Cached Solana account does not match this wallet.');
  }
  return {
    address: expectedAddress,
    balanceLamports: parseAtomicAmount(document.balanceLamports),
    usdcBaseUnits: parseAtomicAmount(document.usdcBaseUnits),
    solUpdatedAt: parseTimestamp(document.solUpdatedAt),
    usdcUpdatedAt: parseTimestamp(document.usdcUpdatedAt),
  };
}

export function createSolanaAccountCache(
  storage: StorageLike,
  now: () => Date = () => new Date(),
) {
  async function load(address: string): Promise<CachedSolanaAccountSnapshot | null> {
    const key = storageKey(address);
    const raw = await storage.getItem(key);
    if (raw === null) return null;
    try {
      return parseSnapshot(raw, address);
    } catch {
      try {
        await storage.removeItem(key);
      } catch {
        // A broken non-sensitive display cache must never block live wallet data.
      }
      return null;
    }
  }

  async function mergeFresh(snapshot: SolanaAccountSnapshot): Promise<CachedSolanaAccountSnapshot | null> {
    const previous = await load(snapshot.address);
    const timestamp = now().toISOString();
    const solIsFresh = snapshot.availability.SOL === 'fresh';
    const usdcIsFresh = snapshot.availability.USDC === 'fresh';
    if (!previous && !solIsFresh && !usdcIsFresh) return null;

    const merged: CachedSolanaAccountSnapshot = {
      address: snapshot.address,
      balanceLamports: solIsFresh ? snapshot.balanceLamports : previous?.balanceLamports || 0n,
      usdcBaseUnits: usdcIsFresh ? snapshot.usdcBaseUnits : previous?.usdcBaseUnits || 0n,
      solUpdatedAt: solIsFresh ? timestamp : previous?.solUpdatedAt || null,
      usdcUpdatedAt: usdcIsFresh ? timestamp : previous?.usdcUpdatedAt || null,
    };
    const stored: StoredSolanaAccountSnapshot = {
      version: 1,
      address: merged.address,
      balanceLamports: merged.balanceLamports.toString(),
      usdcBaseUnits: merged.usdcBaseUnits.toString(),
      solUpdatedAt: merged.solUpdatedAt,
      usdcUpdatedAt: merged.usdcUpdatedAt,
    };
    await storage.setItem(storageKey(snapshot.address), JSON.stringify(stored));
    return merged;
  }

  return { load, mergeFresh };
}
