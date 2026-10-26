import { OpagoError } from './api';
import type { OidcAccountLogin } from './oidc';
import type { WalletBrokerConfiguration } from './wallet-broker-config';
import { WebsiteAccountError } from './website-account';

export type BrokerAccountAction = 'check' | 'login' | 'logout';
export type BrokerAccountResult = { status: 'ready'; expiresAt: number; signInRequired?: boolean } |
  { status: 'signed_in'; expiresAt: number } | { status: 'signed_out' | 'cancelled' };
export type BrokerAccountPorts = {
  configuration(signal: AbortSignal): Promise<WalletBrokerConfiguration>;
  login(config: WalletBrokerConfiguration, signal: AbortSignal, current: () => void,
    browsing: (value: boolean) => void): Pick<OidcAccountLogin, 'login' | 'restore'>;
  logout(): Promise<void>;
};
/** Account authentication only. Never constructs an AccountBearer or wallet proof. */
export class BrokerAccountFlow {
  private flight: { controller: AbortController; browsing: boolean } | null = null;
  constructor(private readonly ports: BrokerAccountPorts, private readonly now = Date.now) {}
  isBrowsing() { return this.flight?.browsing === true; }
  cancel() { this.flight?.controller.abort(); }
  async run(action: BrokerAccountAction, current: () => void): Promise<BrokerAccountResult | null> {
    if (this.flight) return null;
    current();
    const flight = { controller: new AbortController(), browsing: false }; this.flight = flight;
    const check = () => { if (flight.controller.signal.aborted) throw new WebsiteAccountError('cancelled'); current(); };
    try {
      // Logout must work even if discovery/configuration is unavailable.
      if (action === 'logout') { await this.ports.logout(); check(); return { status: 'signed_out' }; }
      const config = await this.ports.configuration(flight.controller.signal); check();
      if (config.expiresAt <= this.now()) throw new WebsiteAccountError();
      const login = this.ports.login(config, flight.controller.signal, check, value => { flight.browsing = value; });
      let credential;
      if (action === 'login') credential = await login.login(false);
      else {
        try { credential = await login.restore(); }
        catch { check(); return { status: 'ready', expiresAt: config.expiresAt, signInRequired: true }; }
      }
      check();
      if (!credential) return { status: 'ready', expiresAt: config.expiresAt };
      if (credential.expiresAt <= this.now()) throw new WebsiteAccountError();
      // Tokens never enter component state, route params or display messages.
      return { status: 'signed_in', expiresAt: credential.expiresAt };
    } catch (error) {
      check();
      if (error instanceof OpagoError && error.code === 'account_login_cancelled') return { status: 'cancelled' };
      throw error;
    } finally { if (this.flight === flight) this.flight = null; }
  }
}
