import { sats } from './amount';
import type { BitcoinNetwork } from './destination';

export const BITCOIN_STORE_KEY = 'opago.bitcoin.operations.v1';
export type BitcoinOperationState = 'prepared' | 'checking' | 'pending' | 'broadcast' | 'confirmed' | 'failed' | 'aborted' | 'action_required';
export interface BitcoinOperation {
  id: string;
  scope: string;
  network: BitcoinNetwork;
  kind: 'withdrawal' | 'deposit';
  address: string;
  amountSats: number;
  feeSats: number | null;
  /** Verified provider charge after a completed withdrawal; feeSats remains the approved ceiling. */
  actualFeeSats?: number;
  state: BitcoinOperationState;
  createdAt: string;
  quoteId?: string;
  requestId?: string;
  txid?: string;
  vout?: number;
  transferId?: string;
  /** Provider history after a seed restore may not expose the original
   * recipient and amount. Such records block duplicate sends without
   * inventing payment details. */
  recoveredFromProvider?: true;
}
export interface ProviderWithdrawalMerge {
  requestId: string;
  quoteId?: string;
  transform(previous: BitcoinOperation | undefined): BitcoinOperation;
}
interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function parseBitcoinStoreDocument(raw: string | null): BitcoinOperation[] {
  if (raw === null) return [];
  let document: { version?: unknown; records?: unknown };
  try { document = JSON.parse(raw); }
  catch { throw new Error('Bitcoin payment storage is unavailable.'); }
  if (document?.version !== 1 || !Array.isArray(document.records)) throw new Error('Bitcoin payment storage is unavailable.');
  document.records.forEach(assertBitcoinOperation);
  return document.records;
}

export function assertBitcoinOperation(record: BitcoinOperation): void {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id ||
      typeof record.scope !== 'string' || !record.scope ||
      !['MAINNET', 'REGTEST'].includes(record.network) ||
      !record.scope.startsWith(`${record.network}:`) || !['withdrawal', 'deposit'].includes(record.kind) ||
      !['prepared', 'checking', 'pending', 'broadcast', 'confirmed', 'failed', 'aborted', 'action_required'].includes(record.state) ||
      typeof record.address !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) {
    throw new Error('Bitcoin payment storage is unavailable.');
  }
  if (record.recoveredFromProvider !== undefined && record.recoveredFromProvider !== true) {
    throw new Error('Bitcoin payment storage is unavailable.');
  }
  sats(record.amountSats);
  if (record.feeSats !== null) sats(record.feeSats);
  if (record.actualFeeSats !== undefined) {
    sats(record.actualFeeSats);
    if (record.kind !== 'withdrawal' || record.state !== 'confirmed' || record.feeSats === null ||
      record.actualFeeSats > record.feeSats) throw new Error('Bitcoin payment storage is unavailable.');
  }
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
    return parseBitcoinStoreDocument(await storage.getItem(BITCOIN_STORE_KEY));
  }
  async function write(records: BitcoinOperation[]) {
    // Never evict unresolved or historical operations to make a retry appear safe.
    if (records.length > 10_000) throw new Error('Bitcoin payment storage is full.');
    await storage.setItem(BITCOIN_STORE_KEY, JSON.stringify({ version: 1, records }));
  }
  return {
    list(scope: string) { return exclusive(async () => (await read()).filter(row => row.scope === scope)); },
    listActive(scope: string) { return exclusive(async () => (await read()).filter(row =>
      row.scope === scope && !['confirmed', 'failed', 'aborted'].includes(row.state))); },
    listWithdrawalRequestIds(scope: string) { return exclusive(async () => (await read()).filter(row =>
      row.scope === scope && row.kind === 'withdrawal' && row.requestId).map(row => row.requestId!)); },
    existingIds(scope: string, ids: string[]) { return exclusive(async () => {
      const matches = new Set((await read()).filter(row => row.scope === scope).map(row => row.id));
      return ids.filter(id => matches.has(id));
    }); },
    listHistoryPage(scope: string, limit: number, before?: string) {
      return exclusive(async () => {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid Bitcoin history page.');
        let cursor: { time: number; id: string } | null = null;
        if (before !== undefined) {
          if (before.length > 2048) throw new Error('Invalid Bitcoin history cursor.');
          try { cursor = JSON.parse(before) as { time: number; id: string }; }
          catch { throw new Error('Invalid Bitcoin history cursor.'); }
          if (!cursor || !Number.isSafeInteger(cursor.time) || typeof cursor.id !== 'string' || !cursor.id) {
            throw new Error('Invalid Bitcoin history cursor.');
          }
        }
        const items = (await read()).filter(row => {
          if (row.scope !== scope || row.state === 'aborted') return false;
          const time = Date.parse(row.createdAt);
          return !cursor || time < cursor.time || (time === cursor.time && row.id > cursor.id);
        }).sort((left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
        const page = items.slice(0, limit);
        const last = page.at(-1);
        return { items: page, next: items.length > limit && last ?
          JSON.stringify({ time: Date.parse(last.createdAt), id: last.id }) : null,
        through: last ? Date.parse(last.createdAt) : undefined };
      });
    },
    upsertDiscoveredDeposits(scope: string, candidates: BitcoinOperation[], assertCurrent: () => void): Promise<void> {
      const expected = generation;
      return exclusive(async () => {
        assertCurrent();
        if (expected !== generation) throw new Error('Wallet changed.');
        if (!candidates.length) return;
        const records = await read();
        assertCurrent();
        const existing = new Set(records.filter(row => row.scope === scope).map(row => row.id));
        let changed = false;
        for (const candidate of candidates) {
          if (candidate.scope !== scope || !scope.startsWith(`${candidate.network}:`) ||
              candidate.kind !== 'deposit' ||
              candidate.state !== 'action_required' || candidate.amountSats !== 0 || candidate.feeSats !== null ||
              !candidate.txid || !/^[0-9a-f]{64}$/.test(candidate.txid) ||
              !Number.isSafeInteger(candidate.vout) || candidate.vout! < 0 ||
              candidate.id !== `deposit:${candidate.network}:${candidate.txid}:${candidate.vout}`) {
            throw new Error('Invalid Bitcoin deposit record.');
          }
          if (existing.has(candidate.id)) continue;
          records.push(candidate);
          existing.add(candidate.id);
          changed = true;
        }
        if (changed) await write(records);
      });
    },
    async begin(operation: BitcoinOperation, assertCurrent: () => void) {
      const expected = generation;
      return exclusive(async () => {
        assertCurrent();
        if (expected !== generation) throw new Error('Wallet changed.');
        const records = await read();
        assertCurrent();
        if (records.some(row => row.scope === operation.scope && (row.id === operation.id ||
            (operation.kind === 'withdrawal' && row.kind === 'withdrawal' &&
              !['confirmed', 'failed', 'aborted'].includes(row.state))))) {
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
        if (previous && JSON.stringify(previous) === JSON.stringify(next)) return previous;
        if (index < 0) records.push(next); else records[index] = next;
        await write(records);
        return next;
      });
    },
    mergeProviderWithdrawals(scope: string, updates: ProviderWithdrawalMerge[], assertCurrent: () => void) {
      const expected = generation;
      return exclusive(async () => {
        assertCurrent();
        if (expected !== generation) throw new Error('Wallet changed.');
        const records = await read();
        assertCurrent();
        let changed = false;
        for (const update of updates) {
          const index = records.findIndex(row => row.scope === scope && row.kind === 'withdrawal' &&
            (row.requestId === update.requestId || (update.quoteId && row.quoteId === update.quoteId)));
          const previous = records[index];
          if (previous?.requestId && previous.requestId !== update.requestId) {
            throw new Error('Bitcoin provider returned conflicting withdrawal requests.');
          }
          const next = update.transform(previous);
          if (next.scope !== scope || next.kind !== 'withdrawal' || next.requestId !== update.requestId ||
              (previous && previous.id !== next.id) || (!previous && records.some(row => row.scope === scope && row.id === next.id))) {
            throw new Error('Invalid Bitcoin provider payment record.');
          }
          if (previous?.state === 'confirmed' && next.state !== 'confirmed') continue;
          if (previous && JSON.stringify(previous) === JSON.stringify(next)) continue;
          if (index < 0) records.push(next); else records[index] = next;
          changed = true;
        }
        if (changed) await write(records);
      });
    },
    // This is only called while the caller knows the SDK submission has not begun.
    // It never creates a record, so a concurrent wallet wipe cannot resurrect one.
    abortBeforeSubmission(scope: string, id: string, expected: 'prepared' | 'checking') {
      return exclusive(async () => {
        const records = await read();
        const index = records.findIndex(row => row.scope === scope && row.id === id);
        if (index < 0 || records[index].state !== expected) return;
        const previous = records[index];
        records[index] = previous.kind === 'deposit'
          ? { ...previous, state: 'action_required', amountSats: 0, feeSats: null }
          : { ...previous, state: 'aborted' };
        await write(records);
      });
    },
    clear() {
      generation += 1;
      return exclusive(() => storage.removeItem(BITCOIN_STORE_KEY));
    },
  };
}
export type BitcoinStore = ReturnType<typeof createBitcoinStore>;
