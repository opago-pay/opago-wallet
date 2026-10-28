import type { HkaHttp } from './hka';
import type { OidcConfig, OidcRevocationTokens } from './oidc';
import { PUBLIC_API_ORIGIN } from './public-account-origin';
import { OpagoError } from './api';

/** RFC 7009 client revocation; never calls account-wide end-session or website logout. */
export async function revokeWalletBrokerSession(http: HkaHttp, config: OidcConfig, tokens: OidcRevocationTokens): Promise<void> {
  if (config.issuer !== PUBLIC_API_ORIGIN || config.clientId !== 'opago-wallet' || !tokens ||
      typeof tokens.accessToken !== 'string' || tokens.accessToken.length > 16_384 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(tokens.accessToken) ||
      tokens.refreshToken !== undefined && (typeof tokens.refreshToken !== 'string' ||
        !/^[A-Za-z0-9_-]{1,8192}$/.test(tokens.refreshToken))) throw new OpagoError('account_logout_pending', true);
  const requests: [string, string][] = tokens.refreshToken ? [[tokens.refreshToken, 'refresh_token']] : [];
  requests.push([tokens.accessToken, 'access_token']);
  let failed = false;
  for (const [token, hint] of requests) {
    try {
      const response = await http(PUBLIC_API_ORIGIN + '/api/v2/auth/oauth/revoke', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ token, client_id: config.clientId, token_type_hint: hint }).toString(),
        maxBytes: 4096, timeoutMs: 10_000,
      });
      // RFC 7009 also returns success for already revoked/unknown tokens, so retry is safe.
      if (response.status !== 200 || response.body !== '') failed = true;
    } catch { failed = true; }
  }
  if (failed) throw new OpagoError('account_logout_pending', true);
}
