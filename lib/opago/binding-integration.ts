import type { AccountLogin } from './account';
import { OpagoError } from './api';
import { NativeHkaTransport, type HkaHttp } from './hka';
import { OidcAccountLogin, type OidcPlatform } from './oidc';
import { PUBLIC_API_ORIGIN } from './public-account-origin';
import { RuntimeConfigClient } from './runtime-config';
import type { F3Integration } from './runtime-native';
import type { PrivateStore } from './store';
import type { WalletBrokerConfiguration } from './wallet-broker-config';

export type BindingIntegrationPorts = {
  platform: 'ios' | 'android';
  build: number;
  http: HkaHttp;
  store: PrivateStore;
  random(length: number): Uint8Array;
  oidc(configuration: WalletBrokerConfiguration): OidcPlatform;
  logout(): Promise<void>;
  assertCurrent(): void;
  now?: () => number;
};

/** Connect the existing 0.2.0 clients. Construction proves transport trust only,
 * never account ownership, a WalletBearer or backend binding availability.
 * Broker access tokens are forwarded unchanged: accepting them is a backend duty.
 */
export async function createAccountBindingIntegration(ports: BindingIntegrationPorts): Promise<F3Integration> {
  const now = ports.now || Date.now;
  ports.assertCurrent();
  const configuration = new RuntimeConfigClient(ports.http, ports.platform, ports.build, now);
  const initial = await configuration.brokerConfiguration();
  ports.assertCurrent();
  const hka = new NativeHkaTransport({ audience: PUBLIC_API_ORIGIN,
    platform: ports.platform, build: ports.build,
    oidc: { issuer: initial.config.issuer, clientId: initial.config.clientId, redirectUri: initial.config.redirectUri },
  }, ports.http, ports.store, ports.random, now);
  // Uses the separately pinned root, revocations and persistent rollback markers.
  // No business operation, signature or credential is sent during bootstrap.
  await hka.configuration();
  ports.assertCurrent();
  if (initial.expiresAt <= now()) throw new OpagoError('app_config_expired');

  async function loginAdapter() {
    ports.assertCurrent();
    const resolved = await configuration.brokerConfiguration();
    ports.assertCurrent();
    const platform = ports.oidc(resolved);
    return new OidcAccountLogin(resolved.config, resolved.trusted, { ...platform,
      start: () => {
        ports.assertCurrent();
        const active = platform.start?.();
        return () => { ports.assertCurrent(); active?.(); };
      },
    }, ports.store, now);
  }
  const accountLogin: AccountLogin = {
    mode: 'oidc',
    async login(fresh) { return (await loginAdapter()).login(fresh); },
    async refresh() { return (await loginAdapter()).refresh(); },
    async logout() {
      ports.assertCurrent();
      // The existing client-only revocation path must work during config outages.
      await ports.logout();
    },
  };
  return { hka, accountLogin, publicAddressOrigin: 'https://opago.com' };
}
