export const BITCOIN_DEPOSIT_CURSOR_KEY = 'opago.bitcoin.deposit-cursor.v1';

interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface DepositPosition {
  addressCount: number;
  addressIndex: number;
  offset: number;
  anchor: string;
}
interface Document { version: 1; scope: string; position: DepositPosition }

/** Resume a bounded UTXO walk after an app restart. The next offset is saved
 * only after every output on the current page is durably indexed. */
export function createBitcoinDepositCursor(storage: Storage) {
  let queue: Promise<unknown> = Promise.resolve();
  let generation = 0;
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work, work);
    queue = result.catch(() => undefined);
    return result;
  }
  async function read(): Promise<Document | null> {
    const raw = await storage.getItem(BITCOIN_DEPOSIT_CURSOR_KEY);
    if (!raw) return null;
    const document = JSON.parse(raw) as Document;
    const value = document.position;
    if (document.version !== 1 || typeof document.scope !== 'string' || !value ||
        !Number.isSafeInteger(value.addressCount) || value.addressCount < 0 ||
        !Number.isSafeInteger(value.addressIndex) || value.addressIndex < 0 ||
        !Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset % 100 !== 0 ||
        typeof value.anchor !== 'string') {
      throw new Error('Bitcoin deposit discovery cursor is invalid.');
    }
    return document;
  }
  return {
    run<T>(scope: string, addresses: string[],
      work: (start: DepositPosition, advance: (next: DepositPosition | null) => Promise<void>) => Promise<T>): Promise<T> {
      const epoch = generation;
      return exclusive(async () => {
        const saved = await read();
        const valid = saved?.scope === scope && saved.position.addressCount === addresses.length &&
          saved.position.addressIndex < addresses.length &&
          saved.position.anchor === addresses[saved.position.addressIndex];
        const start: DepositPosition = valid ? saved.position : {
          addressCount: addresses.length, addressIndex: 0, offset: 0, anchor: addresses[0] ?? '',
        };
        const advance = async (next: DepositPosition | null) => {
          if (generation !== epoch) throw new Error('Wallet changed.');
          if (next === null) await storage.removeItem(BITCOIN_DEPOSIT_CURSOR_KEY);
          else await storage.setItem(BITCOIN_DEPOSIT_CURSOR_KEY,
            JSON.stringify({ version: 1, scope, position: next } satisfies Document));
        };
        return work(start, advance);
      });
    },
    hasPending(scope: string): Promise<boolean> {
      return exclusive(async () => (await read())?.scope === scope);
    },
    clear(): Promise<void> {
      generation += 1;
      return exclusive(() => storage.removeItem(BITCOIN_DEPOSIT_CURSOR_KEY));
    },
  };
}
export type BitcoinDepositCursor = ReturnType<typeof createBitcoinDepositCursor>;
