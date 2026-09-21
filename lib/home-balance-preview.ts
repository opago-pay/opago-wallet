// These values are display hints only, never input to a payment or key lookup.
export interface HomeBalancePreview {
  version: 1;
  scope: string;
  spark?: { value: number; at: number };
  hedera?: { value: string; at: number };
  rates?: { btcToEur: number; hbarToEur: number; at: number };
}

export interface PreviewStorage {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export function parseHomeBalancePreview(raw: string | null, scope: string, now = Date.now()): HomeBalancePreview | null {
  if (!raw || raw.length > 2_048) return null;
  try {
    const data = JSON.parse(raw) as HomeBalancePreview;
    if (data?.version !== 1 || data.scope !== scope) return null;
    const recent = (at: number) => Number.isSafeInteger(at) && at > 0 && at <= now && now - at <= MAX_AGE_MS;
    const preview: HomeBalancePreview = { version: 1, scope };
    if (data.spark && recent(data.spark.at) && Number.isSafeInteger(data.spark.value) && data.spark.value >= 0) {
      preview.spark = { value: data.spark.value, at: data.spark.at };
    }
    if (data.hedera && recent(data.hedera.at) && typeof data.hedera.value === 'string' && /^\d{1,19}$/.test(data.hedera.value) && BigInt(data.hedera.value) <= 9_223_372_036_854_775_807n) {
      preview.hedera = { value: data.hedera.value, at: data.hedera.at };
    }
    if (data.rates && recent(data.rates.at) && data.rates.btcToEur > 0 && [data.rates.btcToEur, data.rates.hbarToEur].every(rate => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0)) {
      preview.rates = { btcToEur: data.rates.btcToEur, hbarToEur: data.rates.hbarToEur, at: data.rates.at };
    }
    return preview;
  } catch { return null; }
}

export class HomeBalancePreviewStore {
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: PreviewStorage) {}

  async read(scope: string): Promise<HomeBalancePreview | null> {
    const generation = this.generation;
    const value = await this.storage.get();
    return generation === this.generation ? parseHomeBalancePreview(value, scope) : null;
  }

  update(next: HomeBalancePreview, assertCurrent: () => void): Promise<void> {
    const generation = this.generation;
    const operation = this.queue.catch(() => undefined).then(async () => {
      if (generation !== this.generation) return;
      assertCurrent();
      const previous = await this.read(next.scope);
      if (generation !== this.generation) return;
      assertCurrent();
      const valid = parseHomeBalancePreview(JSON.stringify(next), next.scope);
      if (valid) await this.storage.set(JSON.stringify({ ...previous, ...valid }));
    });
    this.queue = operation;
    return operation;
  }

  clear(): Promise<void> {
    this.generation += 1;
    // Wait out a storage write already in progress, then remove it. Queued
    // updates from the removed wallet must never recreate this record.
    const operation = this.queue.catch(() => undefined).then(() => this.storage.remove());
    this.queue = operation;
    return operation;
  }
}
