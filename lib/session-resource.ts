/** Serializes key-bearing SDK startup and disposes late results after locking. */
export class SessionResource<T extends { cleanupConnections(): Promise<void> }> {
  private generation = 0;
  private current: T | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private active: AbortController | null = null;
  private unsettled = 0;

  hasUnsettledStartup(): boolean {
    return this.unsettled > 0;
  }

  reset() {
    this.generation += 1;
    this.active?.abort();
    const current = this.current;
    this.current = null;
    // cleanupConnections stops SDK timers synchronously before closing sockets.
    const cleanup = current ? this.dispose(current) : Promise.resolve();
    this.queue = Promise.all([this.queue.catch(() => undefined), cleanup]);
  }

  initialize(factory: (signal: AbortSignal) => Promise<T>, deadlineMs = 75_000): Promise<T | null> {
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
      return Promise.reject(new Error('Spark startup deadline is invalid.'));
    }
    const generation = this.generation;
    const controller = new AbortController();
    let resolveVisible!: (value: T | null) => void;
    let rejectVisible!: (reason: unknown) => void;
    let notified = false;
    const visible = new Promise<T | null>((resolve, reject) => {
      resolveVisible = resolve;
      rejectVisible = reject;
    });
    const settle = (value: T | null, cause?: unknown) => {
      if (notified) return;
      notified = true;
      if (cause) rejectVisible(cause);
      else resolveVisible(value);
    };
    // This deadline reports failure and signals cancellation. Ownership remains
    // in the queue until the factory actually settles and any late wallet is
    // disposed. A new key-bearing SDK start must never race the old one.
    const timer = setTimeout(() => {
      controller.abort();
      settle(null, new Error('Spark startup timed out; the previous attempt must stop before retrying.'));
    }, deadlineMs);
    this.unsettled += 1;
    const operation = this.queue.catch(() => undefined).then(async () => {
      if (generation !== this.generation || controller.signal.aborted) { settle(null); return; }
      this.active = controller;
      try {
        const resource = await factory(controller.signal);
        if (generation !== this.generation || controller.signal.aborted) {
          await this.dispose(resource);
          settle(null);
          return;
        }
        this.current = resource;
        settle(resource);
      } catch (cause) {
        settle(null, cause);
      } finally {
        if (this.active === controller) this.active = null;
      }
    }).finally(() => {
      clearTimeout(timer);
      this.unsettled -= 1;
    });
    this.queue = operation;
    return visible;
  }

  private async dispose(resource: T) {
    try { await resource.cleanupConnections(); }
    catch { /* The session is already invalid; cleanup cannot unlock it. */ }
  }
}
