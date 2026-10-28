import type { AppConfig } from './contract-types';
import type { OidcConfig } from './oidc';
import type { OidcDiscovery } from './oidc-verifier';
import { PUBLIC_API_ORIGIN } from './public-account-origin';
import { WebsiteAccountError } from './website-account';

export type WalletBrokerConfiguration = { config: OidcConfig; discovery: OidcDiscovery;
  trusted: { issuers: string[]; redirectUris: string[]; accessAudience: string }; expiresAt: number };
const callback = 'com.opago.wallet:/oauth/callback';

/** This is a local trust policy, not a fallback for missing runtime fields. */
export function assertWalletBrokerMetadata(app: AppConfig): void {
  const { oidc } = app;
  if (oidc.issuer !== PUBLIC_API_ORIGIN || oidc.client_id !== 'opago-wallet' ||
      oidc.redirect_uris.length !== 1 || oidc.redirect_uris[0] !== callback ||
      oidc.scopes.length !== 3 || new Set(oidc.scopes).size !== 3 ||
      !['openid', 'email', 'profile'].every(scope => (oidc.scopes as string[]).includes(scope))) throw new WebsiteAccountError();
}

/** Resolve only the broker login contract; no Portal URL, signup context or wallet authority is inferred. */
export function resolveWalletBrokerConfiguration(app: AppConfig, document: unknown, fetchedAt: number, now: number): WalletBrokerConfiguration {
  assertWalletBrokerMetadata(app);
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new WebsiteAccountError();
  const data = document as Record<string, unknown>;
  const expected = { issuer: app.oidc.issuer, authorization_endpoint: PUBLIC_API_ORIGIN + '/api/v2/auth/authorize',
    token_endpoint: PUBLIC_API_ORIGIN + '/api/v2/auth/oauth/token', jwks_uri: PUBLIC_API_ORIGIN + '/api/v2/auth/oauth/jwks' };
  if (Object.entries(expected).some(([key, value]) => data[key] !== value) ||
      data.authorization_response_iss_parameter_supported !== true) throw new WebsiteAccountError();
  for (const [field, values] of Object.entries({ code_challenge_methods_supported: ['S256'], response_types_supported: ['code'],
    response_modes_supported: ['query'], grant_types_supported: ['authorization_code', 'refresh_token'],
    id_token_signing_alg_values_supported: ['ES256'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: app.oidc.scopes })) {
    const supported = data[field];
    if (!Array.isArray(supported) || supported.some(value => typeof value !== 'string') ||
        !values.every(value => supported.includes(value))) throw new WebsiteAccountError();
  }
  const expiresAt = Math.min(Date.parse(app.valid_until), fetchedAt + app.cache_max_age * 1000);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now) || now < fetchedAt || expiresAt <= now) throw new WebsiteAccountError();
  return { config: { issuer: app.oidc.issuer, clientId: app.oidc.client_id, redirectUri: app.oidc.redirect_uris[0],
    authorizationEndpoint: expected.authorization_endpoint, tokenEndpoint: expected.token_endpoint }, discovery: expected,
    trusted: { issuers: [app.oidc.issuer], redirectUris: [callback], accessAudience: 'opago-account' }, expiresAt };
}
