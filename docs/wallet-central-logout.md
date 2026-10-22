# Wallet broker logout

The native OIDC platform calls `POST https://api.opago.com/api/v2/auth/oauth/logout`
with a form containing `client_id=opago-wallet` and the previously verified
`id_token_hint`. It sends no Authorization header, client secret or redirect target.
Only an empty HTTP 204 confirms completion. The bounded native HTTP transport
rejects redirects and omits cookies. Server error bodies are never displayed.

Contract reference: opago-api main `f6c856362fbccb7cd53815dfcc546107f79c6f14`,
`services/auth_broker.py:end_session`. Account-wide revocation and website/Keycloak
session termination are the API's responsibility; the Wallet does not call them directly.

Logout invalidates pending login/refresh results and removes local OIDC credentials
before the end-session request. A failed request keeps only its ID-token hint in
PrivateStore (native SecureStore), for explicit retry. Concurrent adapters coalesce
logout requests and cannot start a new login/refresh during remote revocation.
An explicit subsequent sign-in after a failed logout forces `prompt=login` and
`max_age=0`; only verified success replaces the old hint. This does not retroactively
claim the preceding logout succeeded.

The account layer attempts broker logout even if wallet-session logout fails,
clears cached account authority, retains unfinished wallet logout operations,
and leaves the sign-out action available for retry. Local wallet seeds are untouched.

Validation covers form/response handling, untrusted configuration, error redaction,
concurrent logout/login/refresh, credential-write races, durable retry and account
cleanup. These are local tests with simulated services, not production logout evidence.

This change does not enable F3 bootstrap, publish AppConfig fields or finish the
Portal signup/handover integration. Once that integration is available, device
acceptance must verify the Wallet, Portal and website are all signed out; repeat
with network loss and after restarting the app.
