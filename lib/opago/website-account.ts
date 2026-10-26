/** Internal application ports, NOT fields in the published AppConfig schema.
 * A reviewed adapter must resolve destinations AND a secure wallet session
 * handoff before returning ready. Browser outcomes carry no credentials.
 */
export type WebsiteAccountAction = 'login' | 'signup';
export type WebsiteAccountAvailability = { status: 'unavailable' } | {
  status: 'ready'; expiresAt: number; destinations: Record<WebsiteAccountAction, string>;
};
export type WebsiteBrowserResult = 'returned' | 'cancelled';
export type WebsiteAccountResult = WebsiteAccountAvailability | { status: WebsiteBrowserResult };
export interface WebsiteBrowser { open(url: string, signal: AbortSignal): Promise<WebsiteBrowserResult> }
export class WebsiteAccountError extends Error {
  constructor(readonly problem: 'unavailable' | 'cancelled' | 'update' = 'unavailable') { super(problem); }
}
export function websiteAccountMessage(cause?: unknown): string {
  if (cause instanceof WebsiteAccountError && cause.problem === 'update') return 'Update your app to use OPAGO account services. Your local wallet remains available.';
  return 'OPAGO sign-in is temporarily unavailable. Please check again later. Your local wallet remains available.';
}
export function assertWebsiteDestination(value: string): void {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash || url.port && url.port !== '443') throw new WebsiteAccountError();
}

/** One flight across both actions and all screens. No storage/session authority. */
export class WebsiteAccountFlow {
  private flight: { controller: AbortController; browsing: boolean } | null = null;
  constructor(private readonly availability: (signal: AbortSignal) => Promise<WebsiteAccountAvailability>,
    private readonly browser: WebsiteBrowser, private readonly now = Date.now) {}
  isBrowsing() { return this.flight?.browsing === true; }
  cancel() { const flight = this.flight; this.flight = null; flight?.controller.abort(); }
  async run(action: WebsiteAccountAction | 'check', current: () => void): Promise<WebsiteAccountResult | null> {
    if (this.flight) return null;
    current();
    const flight = { controller: new AbortController(), browsing: false }; this.flight = flight;
    const check = () => {
      if (flight.controller.signal.aborted || this.flight !== flight) throw new WebsiteAccountError('cancelled');
      current();
    };
    try {
      // Refresh even when the UI last displayed a ready configuration.
      const available = await this.availability(flight.controller.signal); check();
      if (available.status !== 'ready') return { status: 'unavailable' };
      if (!Number.isFinite(available.expiresAt) || available.expiresAt <= this.now()) throw new WebsiteAccountError();
      assertWebsiteDestination(available.destinations.login); assertWebsiteDestination(available.destinations.signup);
      if (action === 'check') return available;
      flight.browsing = true;
      const result = await this.browser.open(available.destinations[action], flight.controller.signal); check();
      return { status: result === 'cancelled' ? 'cancelled' : 'returned' };
    } finally { if (this.flight === flight) this.flight = null; }
  }
}
