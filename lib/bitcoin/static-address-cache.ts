import { validateBitcoinAddress, type BitcoinNetwork } from './destination';

const KEY = 'opago.bitcoin.static-address.v1';

interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface CachedAddress {
  scope: string;
  address: string;
}

/** A public receive address is reusable, but only for its exact wallet/network scope. */
export function createStaticAddressCache(storage: Storage) {
  let cached: CachedAddress | null = null;
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  }
  function valid(record: CachedAddress, scope: string, network: BitcoinNetwork) {
    if (record.scope !== scope || !scope.startsWith(`${network}:`)) return null;
    try { return validateBitcoinAddress(record.address, network); }
    catch { return null; }
  }
  return {
    load(scope: string, network: BitcoinNetwork, assertCurrent: () => void): Promise<string | null> {
      const epoch = generation;
      return exclusive(async () => {
        assertCurrent();
        const inMemory = cached && valid(cached, scope, network);
        if (inMemory) return inMemory;
        const raw = await storage.getItem(KEY);
        assertCurrent();
        if (epoch !== generation || !raw) return null;
        try {
          const record = JSON.parse(raw) as CachedAddress;
          const address = valid(record, scope, network);
          if (address) cached = record;
          return address;
        } catch { return null; }
      });
    },
    save(scope: string, address: string, network: BitcoinNetwork, assertCurrent: () => void): Promise<void> {
      const epoch = generation;
      return exclusive(async () => {
        assertCurrent();
        if (!scope.startsWith(`${network}:`)) throw new Error('Bitcoin wallet scope is invalid.');
        const record = { scope, address: validateBitcoinAddress(address, network) };
        if (epoch !== generation) throw new Error('Wallet changed.');
        await storage.setItem(KEY, JSON.stringify(record));
        assertCurrent();
        if (epoch !== generation) throw new Error('Wallet changed.');
        cached = record;
      });
    },
    clear(): Promise<void> {
      generation += 1;
      cached = null;
      return exclusive(() => storage.removeItem(KEY));
    },
  };
}
