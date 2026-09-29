export const BITCOIN_REQUEST_CURSOR_KEY = 'opago.bitcoin.request-cursors.v1';

type RequestKind = 'withdrawal' | 'withdrawal-head' | 'withdrawal-lookup' | 'deposit';
interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
interface CursorDocument { version: 1; cursors: Record<string, string> }

export interface WithdrawalScanState {
  phase: 'history' | 'head' | 'ready';
  // Only an ID reached by a complete scan is a safe overlap. Persisting a
  // newly observed page never turns it into a verified anchor.
  verifiedHead?: string | null;
  historyHead?: string | null;
  historyAfter?: string;
  headFirst?: string | null;
  headAfter?: string;
}
interface RecoveryDocument extends CursorDocument {
  withdrawalScans?: Record<string, WithdrawalScanState>;
}

/** A page is committed only after its matching operations have been written.
 * Repeating the last page after process death is safe; skipping it is not. */
export function createBitcoinRequestCursor(storage: Storage) {
  let queue: Promise<unknown> = Promise.resolve();
  let generation = 0;
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work, work);
    queue = result.catch(() => undefined);
    return result;
  }
  async function read(): Promise<RecoveryDocument> {
    const raw = await storage.getItem(BITCOIN_REQUEST_CURSOR_KEY);
    if (!raw) return { version: 1, cursors: {} };
    const value = JSON.parse(raw) as Partial<RecoveryDocument>;
    if (value.version !== 1 || !value.cursors || typeof value.cursors !== 'object' ||
        Array.isArray(value.cursors) || Object.values(value.cursors).some(cursor => typeof cursor !== 'string' || !cursor)) {
      throw new Error('Bitcoin provider recovery cursor is invalid.');
    }
    if (value.withdrawalScans !== undefined &&
        (!value.withdrawalScans || typeof value.withdrawalScans !== 'object' ||
          Array.isArray(value.withdrawalScans) ||
          Object.values(value.withdrawalScans).some(state =>
            !state || !['history', 'head', 'ready'].includes(state.phase) ||
            (state.phase !== 'history' && state.verifiedHead === undefined) ||
            (state.historyAfter !== undefined && state.historyHead === undefined) ||
            (state.headAfter !== undefined && state.headFirst === undefined) ||
            ['verifiedHead', 'historyHead', 'headFirst'].some(key => {
              const field = state[key as keyof WithdrawalScanState];
              return field !== undefined && field !== null && (typeof field !== 'string' || !field);
            }) ||
            ['historyAfter', 'headAfter'].some(key => {
              const field = state[key as keyof WithdrawalScanState];
              return field !== undefined && (typeof field !== 'string' || !field);
            })))) {
      throw new Error('Bitcoin provider recovery state is invalid.');
    }
    return value as RecoveryDocument;
  }
  function assertScope(scope: string) {
    if (!/^(MAINNET|REGTEST):[0-9a-f]{66}$/.test(scope)) throw new Error('Bitcoin wallet scope is invalid.');
  }
  return {
    run<T>(scope: string, kind: RequestKind,
      work: (after: string | undefined, advance: (next: string | null) => Promise<void>) => Promise<T>): Promise<T> {
      const epoch = generation;
      return exclusive(async () => {
        assertScope(scope);
        const key = `${kind}:${scope}`;
        const document = await read();
        const advance = async (next: string | null) => {
          if (generation !== epoch) throw new Error('Wallet changed.');
          if (next !== null && (!next || next === document.cursors[key])) {
            throw new Error('Bitcoin provider history cursor did not advance.');
          }
          if (next === null) delete document.cursors[key];
          else document.cursors[key] = next;
          await storage.setItem(BITCOIN_REQUEST_CURSOR_KEY, JSON.stringify(document));
        };
        return work(document.cursors[key], advance);
      });
    },
    runWithdrawalRecovery<T>(scope: string,
      work: (state: WithdrawalScanState, checkpoint: () => Promise<void>) => Promise<T>): Promise<T> {
      const epoch = generation;
      return exclusive(async () => {
        assertScope(scope);
        const document = await read();
        document.withdrawalScans ??= {};
        const state = document.withdrawalScans[scope] ?? { phase: 'history' };
        document.withdrawalScans[scope] = state;
        const checkpoint = async () => {
          if (generation !== epoch) throw new Error('Wallet changed.');
          if (state.phase === 'ready') {
            delete document.cursors[`withdrawal:${scope}`];
            delete document.cursors[`withdrawal-head:${scope}`];
          }
          await storage.setItem(BITCOIN_REQUEST_CURSOR_KEY, JSON.stringify(document));
        };
        return work(state, checkpoint);
      });
    },
    hasPending(scope: string, kind: RequestKind): Promise<boolean> {
      return exclusive(async () => {
        const document = await read();
        const scan = document.withdrawalScans?.[scope];
        if (kind === 'withdrawal' && scan && scan.phase !== 'ready') return true;
        if (kind === 'withdrawal-head' && scan?.phase === 'head') return true;
        return Boolean(document.cursors[`${kind}:${scope}`]);
      });
    },
    clear(): Promise<void> {
      generation += 1;
      return exclusive(() => storage.removeItem(BITCOIN_REQUEST_CURSOR_KEY));
    },
  };
}
export type BitcoinRequestCursor = ReturnType<typeof createBitcoinRequestCursor>;
