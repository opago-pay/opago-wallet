interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
const KEY = 'opago.bitcoin.deposit-watch.v1';
/** Remember that an address was shared, even before the first UTXO exists. */
export function createDepositWatch(storage: Storage) {
  let queue: Promise<unknown> = Promise.resolve();
  let generation = 0;
  function serialize<T>(work: () => Promise<T>) { const result = queue.then(work, work); queue = result.catch(() => undefined); return result; }
  async function read(): Promise<string[]> {
    const raw = await storage.getItem(KEY);
    const scopes = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(scopes) || scopes.some(item => typeof item !== 'string')) throw new Error('Bitcoin deposit tracking is unavailable.');
    return scopes;
  }
  return {
    has: (scope: string) => serialize(async () => (await read()).includes(scope)),
    enable(scope: string, assertCurrent: () => void) {
      const epoch = generation;
      return serialize(async () => {
        const scopes = await read(); assertCurrent();
        if (epoch !== generation) throw new Error('Wallet changed.');
        if (!scopes.includes(scope)) await storage.setItem(KEY, JSON.stringify([...scopes, scope]));
      });
    },
    clear() { generation += 1; return serialize(() => storage.removeItem(KEY)); },
  };
}
