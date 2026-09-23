import { withTimeout } from './promise-timeout';

export const HISTORY_PAGE_SIZE = 10;
export type HistoryCursor = string | number;
export interface HistoryEntry { key: string; timestamp: string; status: string }
export interface HistoryPage<T> {
  items: T[];
  next: HistoryCursor | null;
  /** Oldest raw record inspected, including records filtered out of the UI. */
  through?: number;
}
export interface HistorySource<T> {
  id: string;
  label: string;
  load(cursor: HistoryCursor | undefined, limit: number): Promise<HistoryPage<T>>;
}

/** Each explicit request reads at most one small page per necessary source.
 * Continuations never run by themselves, including after errors/timeouts. */
export class HistoryPager<T extends HistoryEntry> {
  private sources;
  private limit;
  private pending: Promise<void> | null = null;

  constructor(sources: HistorySource<T>[], private timeoutMs = 8_000,
    private fallback: T[] = [], private visible: (item: T) => boolean = () => true,
    private pageSize = HISTORY_PAGE_SIZE) {
    this.limit = pageSize;
    this.sources = sources.map(source => ({ source, items: [] as T[], next: undefined as HistoryCursor | null | undefined,
      through: undefined as number | undefined, error: false }));
  }

  private merged() {
    const byId = new Map<string, T>(this.sources.some(s => s.error) ? this.fallback.map(item => [item.key, item]) : []);
    for (const source of this.sources) for (const item of source.items) {
      const existing = byId.get(item.key);
      if (existing?.status === 'action_required') continue;
      if (existing && ['confirmed', 'success', 'failed'].includes(existing.status) && ['pending', 'checking', 'prepared'].includes(item.status)) continue;
      byId.set(item.key, item);
    }
    return [...byId.values()].filter(this.visible).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.key.localeCompare(b.key));
  }

  snapshot() {
    const merged = this.merged();
    // Do not expose older local rows ahead of a still-unread remote page.
    const frontier = Math.max(-Infinity, ...this.sources.filter(s => !s.error && s.next !== null)
      .map(s => s.through ?? -Infinity));
    const covered = merged.filter(item => Date.parse(item.timestamp) >= frontier);
    return {
      items: covered.slice(0, this.limit),
      hasMore: covered.length > this.limit || this.sources.some(s => s.next !== null && !s.error),
      errors: [...new Set(this.sources.filter(s => s.error).map(s => s.source.label))],
    };
  }

  replace(id: string, items: T[]) {
    const source = this.sources.find(s => s.source.id === id);
    if (source) source.items = items;
  }

  load(mode: 'initial' | 'more' | 'retry' = 'initial', onProgress?: () => void): Promise<void> {
    if (this.pending) return this.pending;
    if (mode === 'more') this.limit += this.pageSize;
    const merged = this.merged();
    const threshold = merged[this.limit - 1] ? Date.parse(merged[this.limit - 1].timestamp) : -Infinity;
    const needed = this.sources.filter(s => mode === 'retry' ? s.error : !s.error && s.next !== null &&
      (s.next === undefined || (s.through ?? Infinity) >= threshold));
    const operation = Promise.all(needed.map(async state => {
      try {
        const page = await withTimeout(state.source.load(state.next ?? undefined, this.pageSize), this.timeoutMs, 'History page timed out.');
        if (page.next !== null && page.next === state.next) throw new Error('History cursor did not advance.');
        state.items.push(...page.items);
        state.next = page.next;
        state.through = page.through;
        state.error = false;
      } catch { state.error = true; }
      // A slow optional source must not hide rows already returned by others.
      onProgress?.();
    })).then(() => undefined).finally(() => { if (this.pending === operation) this.pending = null; });
    this.pending = operation;
    return operation;
  }
}
