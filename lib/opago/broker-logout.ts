import type { HkaHttp } from './hka';
import type { OidcConfig } from './oidc';
import { PUBLIC_API_ORIGIN } from './public-account-origin';
import { OpagoError } from './api';

/** Fixed broker protocol endpoint, with no user-controlled destination or redirect. */
export async function endWalletBrokerSession(http: HkaHttp, config: OidcConfig, idToken: string): Promise<void> {
  try {
    if (config.issuer !== PUBLIC_API_ORIGIN || config.clientId !== 'opago-wallet' ||
        typeof idToken !== 'string' || idToken.length > 16_384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken)) throw new Error('Invalid logout context.');
    const response = await http(PUBLIC_API_ORIGIN + '/api/v2/auth/oauth/logout', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ id_token_hint: idToken, client_id: config.clientId }).toString(),
      maxBytes: 4096, timeoutMs: 10_000,
    });
    if (response.status !== 204 || response.body !== '') throw new Error('Logout not confirmed.');
  } catch { throw new OpagoError('account_logout_pending', true); }
}
