import type { WalletSession } from '../wallet-session';
import { assertWebsiteDestination, WebsiteAccountError, type WebsiteBrowser, type WebsiteBrowserResult } from './website-account';

export interface SystemBrowser {
  open(url: string): Promise<{ type: string }>;
  dismiss(): Promise<unknown>;
  state(): string;
  subscribe(listener: (state: string) => void): () => void;
}

/** Custom Tabs returns 'opened' immediately on Android; wait for app return.
 * iOS reports dismissal. Neither result proves sign-in.
 */
export function createWebsiteBrowser(system: SystemBrowser, wallet: WalletSession): WebsiteBrowser {
  let occupied = false;
  return { async open(url, signal) {
    assertWebsiteDestination(url);
    if (occupied || signal.aborted || system.state() !== 'active') throw new WebsiteAccountError();
    const lease = wallet.beginDeviceAuthentication(true);
    occupied = true;
    return new Promise<WebsiteBrowserResult>((resolve, reject) => {
      let ended = false, nativeSettled = false, away = false;
      let outcome: WebsiteBrowserResult | undefined;
      let unsubscribe = () => {};
      const release = () => { if (ended && nativeSettled) occupied = false; };
      const finish = (error?: unknown) => {
        if (ended || !error && (!outcome || system.state() !== 'active')) return;
        ended = true; unsubscribe(); clearTimeout(timer); signal.removeEventListener('abort', abort);
        try {
          if (error) throw error;
          // Discard authorization: the lease only preserves the browser switch.
          // It never approves a payment, binding, signing or key disclosure.
          lease.complete(); resolve(outcome!);
        } catch {
          lease.cancel(); reject(new WebsiteAccountError(signal.aborted ? 'cancelled' : 'unavailable'));
        }
        release();
      };
      const dismiss = () => { try { void system.dismiss().catch(() => undefined); } catch { /* Unsupported on Android. */ } };
      const abort = () => { finish(new WebsiteAccountError('cancelled')); dismiss(); };
      const timer = setTimeout(() => { finish(new WebsiteAccountError()); dismiss(); }, 120_000);
      unsubscribe = system.subscribe(state => {
        if (state !== 'active') away = true;
        else if (away && nativeSettled) { outcome ||= 'returned'; finish(); }
      });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { nativeSettled = true; abort(); return; }
      // Keep the mutex if an aborted native opening is still unresolved.
      void Promise.resolve().then(() => {
        if (signal.aborted || ended) throw new WebsiteAccountError('cancelled');
        return system.open(url);
      }).then(result => {
        nativeSettled = true;
        if (result.type === 'cancel' || result.type === 'dismiss') outcome = 'cancelled';
        else if (result.type === 'opened') { if (away && system.state() === 'active') outcome = 'returned'; }
        else { finish(new WebsiteAccountError()); return; }
        finish();
      }, error => { nativeSettled = true; finish(error || new WebsiteAccountError()); }).finally(release);
    });
  } };
}
