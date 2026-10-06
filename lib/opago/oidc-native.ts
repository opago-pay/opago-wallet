import * as WebBrowser from 'expo-web-browser';
import { getRandomValues } from 'expo-crypto';
import { nativeHkaHttp } from './hka-http-native';
import { parseStrictJson } from './encoding';
import type { OidcPlatform } from './oidc';
import { walletSession } from '../wallet-session';

/** Browser auth uses PKCE and secure device randomness, never a client secret. */
export function nativeOidcPlatform(verify: OidcPlatform['verify']): OidcPlatform {
  return { start: () => walletSession.captureRuntime(), randomBytes: length => getRandomValues(new Uint8Array(length)), verify,
    async browser(url, redirectUri) {
      // A trusted external login may background the app; it never authorizes a payment.
      const session = walletSession.beginDeviceAuthentication(true);
      try {
        const response = await WebBrowser.openAuthSessionAsync(url, redirectUri);
        if (response.type !== 'success') { session.cancel(); return null; }
        session.complete()(); return response.url;
      } catch (cause) { session.cancel(); throw cause; }
    },
    async token(url, form) {
      const response = await nativeHkaHttp(url, { method: 'POST', body: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, maxBytes: 32_768, timeoutMs: 10_000 });
      if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.contentType)) throw new Error('OIDC token exchange failed.');
      const tokens = parseStrictJson(response.body) as { access_token: string; id_token: string; refresh_token?: string; token_type?: string };
      if (!tokens || typeof tokens.access_token !== 'string' || typeof tokens.id_token !== 'string' || tokens.token_type?.toLowerCase() !== 'bearer' ||
        tokens.refresh_token !== undefined && typeof tokens.refresh_token !== 'string') throw new Error('Invalid OIDC token response.'); return tokens;
    },
  };
}
