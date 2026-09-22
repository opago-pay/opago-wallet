import { DefaultSparkSigner, KeyDerivationType, type KeyDerivation } from '@buildonspark/spark-sdk';

type Cache = { users: number; open: boolean; privateKeys: Map<string, Uint8Array>; publicKeys: Map<string, Uint8Array> };
const MAX_KEYS = 128;

function cacheKey(derivation: KeyDerivation): string | null {
  switch (derivation.type) {
    case KeyDerivationType.LEAF: return 'leaf:' + derivation.path;
    case KeyDerivationType.STATIC_DEPOSIT: return 'static:' + derivation.path;
    case KeyDerivationType.ECIES:
      return 'ecies:' + Array.from(derivation.path, byte => byte.toString(16).padStart(2, '0')).join('');
    // Deposit is already held by the SDK. Random keys MUST remain fresh.
    default: return null;
  }
}

/** Reuse deterministic derivations only while an authorized SDK send is in flight. */
export class PaymentScopedSparkSigner extends DefaultSparkSigner {
  private sendCache: Cache | null = null;

  async withSendKeyCache<T>(operation: () => Promise<T>): Promise<T> {
    const cache = this.sendCache ?? { users: 0, open: true, privateKeys: new Map(), publicKeys: new Map() };
    this.sendCache = cache;
    cache.users++;
    try { return await operation(); }
    finally {
      if (--cache.users === 0) this.eraseCache(cache);
    }
  }

  clearSendKeyCache(): void {
    if (this.sendCache) this.eraseCache(this.sendCache);
  }

  private eraseCache(cache: Cache): void {
    cache.open = false;
    if (this.sendCache === cache) this.sendCache = null;
    for (const key of cache.privateKeys.values()) key.fill(0);
    cache.privateKeys.clear();
    cache.publicKeys.clear();
  }

  override async createSparkWalletFromSeed(seed: Uint8Array | string, accountNumber?: number): Promise<string> {
    this.clearSendKeyCache();
    return super.createSparkWalletFromSeed(seed, accountNumber);
  }

  protected override async getSigningPrivateKeyFromDerivation(derivation: KeyDerivation): Promise<Uint8Array> {
    const cache = this.sendCache;
    const id = cache?.open ? cacheKey(derivation) : null;
    const existing = id ? cache?.privateKeys.get(id) : undefined;
    // Never hand out cache-owned memory: cleanup/lock must not mutate an
    // already running native signing call or a concurrent SDK operation.
    if (existing) return new Uint8Array(existing);
    const key = await super.getSigningPrivateKeyFromDerivation(derivation);
    if (cache?.open && id && cache.privateKeys.size < MAX_KEYS && !cache.privateKeys.has(id)) {
      cache.privateKeys.set(id, new Uint8Array(key));
    }
    return key;
  }

  protected async reusePublicKey(derivation: KeyDerivation, derive: () => Promise<Uint8Array>): Promise<Uint8Array> {
    const cache = this.sendCache;
    const id = cache?.open ? cacheKey(derivation) : null;
    const existing = id ? cache?.publicKeys.get(id) : undefined;
    if (existing) return new Uint8Array(existing);
    const key = await derive();
    if (cache?.open && id && cache.publicKeys.size < MAX_KEYS) cache.publicKeys.set(id, new Uint8Array(key));
    return key;
  }

  override async getPublicKeyFromDerivation(derivation: KeyDerivation): Promise<Uint8Array> {
    return this.reusePublicKey(derivation, () => super.getPublicKeyFromDerivation(derivation));
  }
}
