import type { WalletSession } from '../wallet-session';
import { WebsiteAccountError } from './website-account';
export interface AuthBrowserSystem {
  open(url: string, redirect: string): Promise<{ type: string; url?: string }>;
  dismiss(): void;
  state(): string;
  subscribe(listener: (state: string) => void): () => void;
}
/** Wait for BOTH Expo callback and foreground. Keep one native auth session at a time. */
export function createOidcBrowser(system: AuthBrowserSystem, wallet: WalletSession) {
  let occupied = false;
  return async (url: string, redirect: string, signal?: AbortSignal): Promise<string | null> => {
    if (occupied || signal?.aborted || system.state() !== 'active') throw new WebsiteAccountError('cancelled');
    const lease = wallet.beginDeviceAuthentication(true); occupied = true;
    return new Promise((resolve, reject) => {
      let ended = false, settled = false, result: { type: string; url?: string } | undefined;
      let unsubscribe = () => {};
      const release = () => { if (ended && settled) occupied = false; };
      const finish = (error?: unknown) => {
        if (ended || !error && (!result || system.state() !== 'active')) return;
        ended = true; clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', abort);
        try {
          if (error) throw error;
          lease.complete();
          if (result!.type === 'success' && typeof result!.url === 'string') resolve(result!.url);
          else if (['cancel', 'dismiss'].includes(result!.type)) resolve(null);
          else throw new WebsiteAccountError();
        } catch { lease.cancel(); reject(new WebsiteAccountError(signal?.aborted ? 'cancelled' : 'unavailable')); }
        release();
      };
      const dismiss = () => { try { system.dismiss(); } catch { /* Expo may already be closed. */ } };
      const abort = () => { finish(new WebsiteAccountError('cancelled')); dismiss(); };
      const timer = setTimeout(() => { finish(new WebsiteAccountError()); dismiss(); }, 120_000);
      try { unsubscribe = system.subscribe(() => finish()); }
      catch (error) { settled = true; finish(error); return; }
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { settled = true; abort(); return; }
      void Promise.resolve().then(() => {
        if (ended) throw new WebsiteAccountError('cancelled');
        return system.open(url, redirect);
      }).then(value => { settled = true; result = value; finish(); }, error => {
        settled = true; finish(error || new WebsiteAccountError());
      }).finally(release);
    });
  };
}
