# Native Wallet broker login

## Delivered

The production account screen now uses AppConfig plus pinned-origin OIDC discovery,
then opens the broker authorize endpoint in Expo AuthSession. The broker selects
the Portal login page. The Wallet neither builds a Portal login URL nor collects
passwords. This account-only path does not activate the separate F3 wallet-proof
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

## Delivered registration and remaining acceptance — 29 October 2026

The shared **Sign in or register** entry uses the Broker/Portal flow. Dashboard
[#181](https://github.com/opago-pay/opago-dashboard/pull/181) and
[#182](https://github.com/opago-pay/opago-dashboard/pull/182) are merged: the
Portal preserves the Wallet authorization context through private-customer
registration and email confirmation. See [Portal registration](wallet-portal-registration.md).
A second native Create account form is not required by this implementation.

Wallet [#72](https://github.com/opago-pay/opago-wallet/pull/72) is merged at
`456e284de7c09824cbff0499b411b6a84e970415`. It prepares the separate native F3
adapter but preserves the production `wallet_session_contract_pending` block.
Signing in does not link the Spark wallet or activate this adapter. Production
keyring/session-lifecycle acceptance and an explicit rollout remain prerequisites.
The lifecycle previews from [#87](https://github.com/opago-pay/opago-wallet/pull/87)
also remain disabled; they do not establish live deletion or detachment.

Source delivery does not prove the deployed Portal target, public-route access,
email delivery or a successful native registration/login. The device checks below
remain unverified for this candidate. Existing basic-wallet device evidence is not
revoked or reclassified as missing by this account-integration checklist.

## Historical public probe — 22 October 2026

These are historical observations, not a current outage claim. Repeat the
read-only checks against the candidate environment before device acceptance.
Anonymous requests used no credentials, invoice or payment:

- `GET https://api.opago.com/api/v2/app/config`: 200 JSON.
- `GET https://api.opago.com/.well-known/openid-configuration`: 200 JSON.
- `GET https://api.opago.com/api/v2/auth/oauth/jwks`: 200 JSON.
- Valid Wallet PKCE `GET /api/v2/auth/authorize`: 302 to
  `https://opago.com/login`, retaining all authorization parameters.
- That target responds 404. The configured broker website login target/routing
  must resolve to the actual Portal handler and preserve the authorization query.
  That observation was an acceptance blocker at the time. Current routing remains
  unverified here; do not introduce a client-side fallback URL.

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
6. Register through the same Portal entry, verify email and return through the
   original Wallet context. If confirmation exceeds the lock/timeout window,
   unlock and start a fresh sign-in; an abandoned callback must remain invalid.
7. Verify local BTC/Lightning/HBAR functionality remains available independently.

Automated coverage uses real generated ES256 signatures with simulated Expo/network
ports, plus UI/lifecycle tests. It is not evidence of a completed device/production login.
