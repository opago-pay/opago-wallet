export const BITCOIN_ONLY_STORAGE_KEY = 'opago_bitcoin_only';
export interface BitcoinOnlyStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** Global display/payment preference. Existing funds and history are never deleted. */
export class BitcoinOnlyPreference {
  private snapshot = { bitcoinOnly: true, ready: false };
  private listeners = new Set<() => void>();
  private storage: BitcoinOnlyStorage | null = null;
  private initialization: Promise<void> | null = null;
  private saving: Promise<void> = Promise.resolve();
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(bitcoinOnly: boolean) {
    this.snapshot = { bitcoinOnly, ready: true };
    this.listeners.forEach(listener => listener());
  }
  initialize(storage: BitcoinOnlyStorage): Promise<void> {
    if (this.initialization) return this.initialization;
    this.storage = storage;
    this.initialization = (async () => {
      let bitcoinOnly = true;
      try { bitcoinOnly = (await storage.getItem(BITCOIN_ONLY_STORAGE_KEY)) !== 'false'; }
      catch { /* Default to Bitcoin Only when preferences cannot be read. */ }
      this.publish(bitcoinOnly);
    })();
    return this.initialization;
  }
  setBitcoinOnly = (enabled: boolean): Promise<void> => {
    const save = this.saving.catch(() => undefined).then(async () => {
      await this.initialization;
      if (!this.storage || typeof enabled !== 'boolean') throw new Error('Bitcoin Only preferences are not ready.');
      await this.storage.setItem(BITCOIN_ONLY_STORAGE_KEY, String(enabled));
      this.publish(enabled);
    });
    this.saving = save;
    return save;
  };
}
export const bitcoinOnlyPreference = new BitcoinOnlyPreference();
export function isBitcoinAsset(asset: string): boolean {
  return ['BTC', 'SAT', 'SATS', 'BITCOIN', 'LIGHTNING'].includes(asset.toUpperCase());
}
