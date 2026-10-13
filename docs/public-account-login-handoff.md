# Wallet account login through the public API

## Implemented scope

The native account screen uses the existing public customer session protocol at
`https://api.opago.com`. It no longer launches an OIDC browser or contacts
Keycloak discovery, token, JWKS or refresh endpoints. Local BTC, Lightning, HBAR,
recovery words and existing balances are independent of these services.

The sole bootstrap constant is the approved API origin. Before login, session
resume, signup or password reset, the client fetches `/api/v2/app/config` and
validates its pinned 0.2.0 contract, origin/audience, timestamps and minimum build.
A 503, expired/invalid document or unsupported build prevents the dependent
request. There is no environment-specific issuer, API alias or guessed fallback.
The old `oidc` fields are still required by the shared schema but never used as
destinations. A changed configuration shape needs a reviewed contract revision.

Login uses the **existing dedicated login** key discovery
`GET /api/v2/auth/login/hpke-key`, then one encrypted
`POST /api/v2/auth/token`, then authenticated `GET /api/v2/auth/me`.
Both discovery and login send `X-OPAGO-Login-Context: public-customer`. The wallet
requires the new discovery acknowledgement `login_context: public-customer`
before it encrypts/sends credentials. An older API that silently ignores the
header cannot make the wallet enter staff login. Only the verified customer UUID,
tenant and exactly one public customer role are accepted.

The existing login HPKE protocol is **not** the signed F3 key-document protocol
at `/api/v2/auth/hpke-key`. These are deliberately not interchanged. Native HTTPS
verification, redirect rejection, response bounds, HPKE freshness and server-side
Redis replay protection remain in use. No shared secret is bundled.

Verified public sessions have their own SecureStore slot. No password is persisted.
Resume rechecks `/me`; expiry requires a new login. Logout clears local state even
if the server is unavailable. Lock, backgrounding, navigation and wallet changes
cancel pending work and reject late responses. The screen supports the existing
neutral password-reset request and the three-field signup screen.

## Release gates and remaining contract work

`EXPO_PUBLIC_OPAGO_F3_ENABLED` remains a build opt-in and is not enabled by this PR.
The API companion introduces `WALLET_PUBLIC_ACCOUNT_LOGIN_ENABLED`, default closed.
Public login/key/profile/logout exposure needs that flag **and**
`PUBLIC_DASHBOARD_LOGIN_ENABLED=true`; edge allowlisting must match the API inventory.
`SIGNUP_ENABLED` and the other wallet flags remain separate. No flag, deployment,
EAS build or installed application is changed by this implementation.

Do not activate a new account-creation release on the strength of these tests:
the following backend/runtime acceptance remains open.

1. At reviewed Compliance main `b7e98b280b17e650ac02bc09175cdb490dbe4634`,
   `docs/wallet-account-bearer.md` and `wallet_account_bearer.py` still require a
   Keycloak AccountBearer for F3. Public customer sessions cannot satisfy that
   verifier. Supply a binding contract for server-side exchange/validation via
   the facade, including identity, audience, auth time, expiry, revocation and
   required reauthentication. Do not synthesize or reinterpret either token.
2. Define the initial trust anchor for the signed F3 HPKE document, consistent
   with runtime configuration and no privately provisioned app configuration.
   A signing root fetched alongside an untrusted key is not independent pinning.
3. Publish the corresponding config revision, including any Lightning origin
   field (`https://opago.com`) and removal/migration of legacy OIDC metadata.
4. Restore native account deletion, wallet binding/recovery, personal Lightning
   address and dependent POS/sync wiring using that reviewed authority contract;
   then perform live signup, email confirmation, login, deletion and refusal tests.

Until then `createNativeF3Integration()` refuses with a specific pending-contract
error. It does not fall back to direct Keycloak. Existing F3 protocol components
and synthetic contract screens remain for implementing the eventual adapter;
the production screen cannot select contract mode. The local wallet stays usable.
References to retired OPAGO domains in POS rejection code are deny-recognition,
not service destinations: removing that guard would accidentally permit an
anonymous fallback for an old OPAGO payment QR.

## Verification and coordination

Wallet base: `4a6029d39b844dca8c6ceb4bbf90910b576f2570` (`mvp-branch`).
API base: `0cf12c37248cae82a9fb9eb5f300faacc1eea234` (`main`).
The API companion pins the tested wallet commit for real-client HTTPS tests with
an owned Redis and simulated Compliance. These do not prove live deployment,
backend acceptance, native device networking or authenticated POS payments.

Local `npm run phase5:verify`: typecheck and lint passed; 932 wallet tests passed,
one existing iOS-project test skipped; all nine checkout contract tests passed.
New tests exercise real HPKE ciphertext, invalid config, server acknowledgement,
no credential retries, unauthorized identities, storage isolation and UI races.
Deploy/review the API companion before distributing a new wallet build; coordinate
the missing runtime contracts with Michael. No additional minimum supported POS
build is asserted by this change.
