# Native Wallet broker login

## Delivered

The production account screen now uses AppConfig plus pinned-origin OIDC discovery,
then opens the broker authorize endpoint in Expo AuthSession. The broker selects
the Portal login page. The Wallet neither builds a Portal login URL nor collects
passwords. This account-only path does not depend on the unfinished F3 wallet-proof
adapter or enable its payment, binding or transaction operations.

PKCE S256, state, nonce, exact callback issuer/path and both ES256 tokens are checked
before SecureStore persistence. The app scheme is `com.opago.wallet:/oauth/callback`.
Expo receives the callback; Router receives only `/opago-account`, with every query
parameter stripped. A cold or unsolicited callback cannot authenticate. Browser
success alone is insufficient. The browser lease invalidates prior payment approval
and waits for foreground; timeout, lock, navigation and cancellation invalidate the
attempt, including delayed token verification/storage results.

The screen restores and re-verifies stored credentials. Expired access triggers the
existing rotating refresh flow; a failed restore offers explicit sign-in again.
Refresh runs on account-screen checks/expiry, not as a new background service.
Only status and expiry enter component state. Logout remains Wallet-client-only
(RFC 7009), with local removal and separate secure retry records. Logout does not
require fresh AppConfig. Website and Portal sessions remain independent.

## Deliberate remaining work

The separate Create account entry is not enabled yet: preserving PrivateCustomer
context through registration, email confirmation and the original authorization
request needs its own Portal integration. Signing in does not link the Spark wallet,
create an AccountBearer or enable the account/wallet challenge/session adapter.
Those adapters and the Android end-to-end acceptance remain separate work.

## Public live probe, 22 October 2026

Anonymous requests (no credentials, no invoice, no payment):

- `GET https://api.opago.com/api/v2/app/config`: 200 JSON.
- `GET https://api.opago.com/.well-known/openid-configuration`: 200 JSON.
- `GET https://api.opago.com/api/v2/auth/oauth/jwks`: 200 JSON.
- Valid Wallet PKCE `GET /api/v2/auth/authorize`: 302 to
  `https://opago.com/login`, retaining all authorization parameters.
- That target responds 404. The configured broker website login target/routing
  must resolve to the actual Portal handler and preserve the authorization query.
  This is a concrete release/acceptance blocker, not a reason to leave the native
  integration unfinished or introduce a client-side fallback URL.

## Acceptance

1. Deploy/confirm the broker Portal target, callback registration and public token,
   refresh, revoke and JWKS paths. Keep issuer/client/callback from validated config.
2. Build a native Android candidate from the merged revision; Expo Go is insufficient.
3. Sign in as an existing customer and return to the same account screen. Verify
   success only after token verification; restart/unlock and restore; renew after expiry.
4. Cancel in the browser and app; lock or change local wallet during login; send an
   unrelated callback. None may authenticate the abandoned attempt.
5. Sign out, including offline/retry. Confirm active local credentials are removed,
   the Wallet client is revoked when online, and Portal login is unaffected.
6. Verify local BTC/Lightning/HBAR functionality remains available independently.

Automated coverage uses real generated ES256 signatures with simulated Expo/network
ports, plus UI/lifecycle tests. It is not evidence of a completed device/production login.
