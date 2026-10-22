# Wallet client-session logout

This supersedes the account-wide logout prepared in #64. Michael clarified on
22 October that logout is scoped to the originating client; Portal and website
sessions must remain independent.

The native OIDC platform sends form-urlencoded `POST /api/v2/auth/oauth/revoke`
requests to `https://api.opago.com`: first the stored refresh token (if present),
then the access token, each with `client_id=opago-wallet` and its `token_type_hint`.
No Authorization header, ID-token hint, redirect target or client secret is sent.
It never calls `/auth/oauth/logout`, Compliance logout-account or website logout.

The API already implements RFC 7009 in main `738bbaf`,
`services/auth_broker.py:revoke` and `_revoke_token`. Refresh revocation targets
that client token's family; access revocation targets its jti. Unknown, expired
or foreign tokens change nothing and return empty HTTP 200. Non-200 responses,
nonempty bodies and network errors leave logout unconfirmed. Both revocations
are attempted even when one fails; retries are safe under the existing API contract.

Local OIDC credentials and cached account authority are removed even on server
failure. Unconfirmed revocation tokens are retained only in a separate native
SecureStore retry queue; the login/refresh path never reads them as credentials.
No ID token is needed or retained in that queue. Successfully revoked records are
removed. An explicit fresh login may proceed after a failed logout, but never
silently discards old pending revocations. Logout requests share a flight across
adapter instances and fence delayed credential writes, callbacks and refreshes.
The account UI keeps the sign-out action available after partial failure.

Tests cover client-only request shape, partial errors, retries, new accounts,
concurrent login/refresh and secure-storage races. No production session was
revoked. End-to-end device acceptance must prove Wallet revocation while an
existing Portal/website session remains usable.

This change wires the native OIDC adapter; native F3 bootstrap and the Portal
signup/session mapping remain separate integration work. No feature is enabled
and no API or Compliance code changes are needed for this client revocation.
