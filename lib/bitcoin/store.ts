import { sats } from './amount';
import type { BitcoinNetwork } from './destination';

export const BITCOIN_STORE_KEY = 'opago.bitcoin.operations.v1';
export type BitcoinOperationState = 'prepared' | 'checking' | 'pending' | 'broadcast' | 'confirmed' | 'action_required';
export interface BitcoinOperation {
  id: string;
  scope: string;
  network: BitcoinNetwork;
  kind: 'withdrawal' | 'deposit';
  address: string;
  amountSats: number;
  feeSats: number | null;
  state: BitcoinOperationState;
  createdAt: string;
  quoteId?: string;
  requestId?: string;
  txid?: string;
  vout?: number;
  transferId?: string;
}
interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createBitcoinStore(storage: Storage) {
  let queue: Promise<unknown> = Promise.resolve();
  let generation = 0;
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work, work);
    queue = result.catch(() => undefined);
    return result;
  }
  async function read(): Promise<BitcoinOperation[]> {
    const raw = await storage.getItem(BITCOIN_STORE_KEY);
    if (raw === null) return [];
    const document = JSON.parse(raw);
    if (document.version !== 1 || !Array.isArray(document.records)) throw new Error('Bitcoin payment storage is unavailable.');
    for (const record of document.records) {
      if (!record.id || !record.scope || !['MAINNET', 'REGTEST'].includes(record.network) ||
          !['withdrawal', 'deposit'].includes(record.kind) ||
          !['prepared', 'checking', 'pending', 'broadcast', 'confirmed', 'action_required'].includes(record.state) ||
          typeof record.address !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) {
        throw new Error('Bitcoin payment storage is unavailable.');
      }
      sats(record.amountSats);
      if (record.feeSats !== null) sats(record.feeSats);
    }
    return document.records;
  }
  async function write(records: BitcoinOperation[]) {
    // Never evict unresolved or historical operations to make a retry appear safe.
    if (records.length > 10_000) throw new Error('Bitcoin payment storage is full.');
    await storage.setItem(BITCOIN_STORE_KEY, JSON.stringify({ version: 1, records }));
  }
  return {
    list(scope: string) { return exclusive(async () => (await read()).filter(row => row.scope === scope)); },
    async begin(operation: BitcoinOperation, assertCurrent: () => void) {
      const expected = generation;
      return exclusive(async () => {
        assertCurrent();
        if (expected !== generation) throw new Error('Wallet changed.');
        const records = await read();
        assertCurrent();
        if (records.some(row => row.scope === operation.scope && (row.id === operation.id ||
            (operation.kind === 'withdrawal' && row.kind === 'withdrawal' && row.state !== 'confirmed')))) {
          throw new Error('A Bitcoin payment is still being checked. Do not send it again.');
        }
        await write([...records, operation]);
      });
    },
    update(scope: string, id: string, transform: (previous: BitcoinOperation | undefined) => BitcoinOperation, assertCurrent: () => void) {
      const expected = generation;
      return exclusive(async () => {
        assertCurrent();
        if (expected !== generation) throw new Error('Wallet changed.');
        const records = await read();
        assertCurrent();
        const index = records.findIndex(row => row.scope === scope && row.id === id);
        const previous = records[index];
        const next = transform(previous);
        if (next.scope !== scope || next.id !== id) throw new Error('Invalid Bitcoin payment record.');
        if (previous?.state === 'confirmed' && next.state !== 'confirmed') return previous;
        if (index < 0) records.push(next); else records[index] = next;
        await write(records);
        return next;
      });
    },
    clear() {
      generation += 1;
      return exclusive(() => storage.removeItem(BITCOIN_STORE_KEY));
    },
  };
}
export type BitcoinStore = ReturnType<typeof createBitcoinStore>;
