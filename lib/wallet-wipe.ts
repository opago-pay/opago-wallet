export interface WipeMarker {
  get(): Promise<string | null>;
  remove(): Promise<void>;
}

/** A durable marker makes partial deletion restartable. Every step must be
 * idempotent; failure keeps the marker so no new wallet can be opened. */
export function createWalletWiper(marker: WipeMarker, steps: readonly (() => Promise<unknown>)[]) {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    resumeIfPending(): Promise<boolean> {
      const result = queue.catch(() => undefined).then(async () => {
        if (await marker.get() !== 'true') return false;
        for (const step of steps) await step();
        await marker.remove();
        return true;
      });
      queue = result;
      return result;
    },
  };
}
