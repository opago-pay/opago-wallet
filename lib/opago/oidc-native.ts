import { AppState } from 'react-native';
import { createOidcBrowser } from './oidc-browser';
import * as WebBrowser from 'expo-web-browser';
import { getRandomValues } from 'expo-crypto';
import { nativeHkaHttp } from './hka-http-native';
import { parseStrictJson } from './encoding';
import type { OidcPlatform } from './oidc';
import { revokeWalletBrokerSession } from './broker-logout';
import { walletSession } from '../wallet-session';

const browser = createOidcBrowser({
  open: (url, redirect) => WebBrowser.openAuthSessionAsync(url, redirect),
  dismiss: () => WebBrowser.dismissAuthSession(), state: () => AppState.currentState,
  subscribe: listener => { const subscription = AppState.addEventListener('change', listener); return () => subscription.remove(); },
}, walletSession);

/** Browser auth uses PKCE and secure device randomness, never a client secret. */
export function nativeOidcPlatform(verify: OidcPlatform['verify'], signal?: AbortSignal): OidcPlatform {
  return { start: () => walletSession.captureRuntime(), randomBytes: length => getRandomValues(new Uint8Array(length)), verify,
    revokeSession: (config, tokens) => revokeWalletBrokerSession(nativeHkaHttp, config, tokens),
    browser: (url, redirectUri) => browser(url, redirectUri, signal),
    async token(url, form) {
      const response = await nativeHkaHttp(url, { method: 'POST', body: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, maxBytes: 32_768, timeoutMs: 10_000, signal });
      if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.contentType)) throw new Error('OIDC token exchange failed.');
      const tokens = parseStrictJson(response.body) as { access_token: string; id_token: string; refresh_token?: string; token_type?: string };
      if (!tokens || typeof tokens.access_token !== 'string' || typeof tokens.id_token !== 'string' || tokens.token_type?.toLowerCase() !== 'bearer' ||
        tokens.refresh_token !== undefined && typeof tokens.refresh_token !== 'string') throw new Error('Invalid OIDC token response.'); return tokens;
    },
  };
}
