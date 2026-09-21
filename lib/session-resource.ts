/** Serializes key-bearing SDK startup and disposes late results after locking. */
export class SessionResource<T extends { cleanupConnections(): Promise<void> }> {
  private generation = 0;
  private current: T | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  reset() {
    this.generation += 1;
    const current = this.current;
    this.current = null;
    // cleanupConnections stops SDK timers synchronously before closing sockets.
    const cleanup = current ? this.dispose(current) : Promise.resolve();
    this.queue = Promise.all([this.queue.catch(() => undefined), cleanup]);
  }

  initialize(factory: () => Promise<T>): Promise<T | null> {
    const generation = this.generation;
    const operation = this.queue.catch(() => undefined).then(async () => {
      if (generation !== this.generation) return null;
      const resource = await factory();
      if (generation !== this.generation) {
        await this.dispose(resource);
        return null;
      }
      this.current = resource;
      return resource;
    });
    this.queue = operation;
    return operation;
  }

  private async dispose(resource: T) {
    try { await resource.cleanupConnections(); }
    catch { /* The session is already invalid; cleanup cannot unlock it. */ }
  }
}
