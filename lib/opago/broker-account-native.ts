import { Platform } from 'react-native';
import { nativeBuildVersion } from 'expo-application';
import { nativeHkaHttp, nativeOidcVerifierPorts } from './hka-http-native';
import { RuntimeConfigClient } from './runtime-config';
import { createWalletBrokerVerifier } from './oidc-verifier';
import { nativeOidcPlatform } from './oidc-native';
import { OidcAccountLogin } from './oidc';
import { f3PrivateStore } from './store-native';
import { BrokerAccountFlow } from './broker-account';
import { WebsiteAccountError } from './website-account';
import { walletSession } from '../wallet-session';
import { PUBLIC_API_ORIGIN } from './public-account-origin';

// Logout alone uses the fixed local trust policy so a config outage cannot retain
// an active local session. This adapter can never authenticate or refresh.
const unavailable = async (): Promise<never> => { throw new WebsiteAccountError(); };
const logoutOnly = new OidcAccountLogin({ issuer: PUBLIC_API_ORIGIN, clientId: 'opago-wallet',
  redirectUri: 'com.opago.wallet:/oauth/callback', authorizationEndpoint: PUBLIC_API_ORIGIN + '/api/v2/auth/authorize',
  tokenEndpoint: PUBLIC_API_ORIGIN + '/api/v2/auth/oauth/token' },
{ issuers: [PUBLIC_API_ORIGIN], redirectUris: ['com.opago.wallet:/oauth/callback'], accessAudience: 'opago-account' },
{ ...nativeOidcPlatform(unavailable), browser: unavailable, token: unavailable }, f3PrivateStore);
const flow = new BrokerAccountFlow({
  async configuration(signal) {
    if (!['ios', 'android'].includes(Platform.OS) || !/^[1-9][0-9]*$/.test(nativeBuildVersion || '')) throw new WebsiteAccountError();
    return new RuntimeConfigClient(nativeHkaHttp, Platform.OS as 'ios' | 'android', Number(nativeBuildVersion)).brokerConfiguration(signal);
  },
  login(config, signal, current, browsing) {
    const platform = nativeOidcPlatform(createWalletBrokerVerifier(config.discovery, nativeOidcVerifierPorts), signal);
    return new OidcAccountLogin(config.config, config.trusted, { ...platform,
      start: () => { const unlocked = platform.start!(); return () => { current(); unlocked(); }; },
      async browser(url, redirect) { browsing(true); try { return await platform.browser(url, redirect); } finally { browsing(false); } },
    }, f3PrivateStore);
  },
  logout: nativeBrokerClientLogout,
});
walletSession.subscribe(() => flow.cancel());
export function nativeBrokerAccount() { return flow; }
/** Shared OIDC storage/generation controls keep both account entry points client-scoped. */
export function nativeBrokerClientLogout() { return logoutOnly.logout(); }
