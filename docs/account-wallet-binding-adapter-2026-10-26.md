# Native account/wallet adapter — backend acceptance pending

Base: main `d040266fccf2e8614e8e7f5002f2c3a90c31b35c` after MVP integration.
This is a draft integration, not proof of a usable production binding service.
No API/Compliance deployment, account, wallet binding or production flag was changed.

## Implemented app wiring

`bootstrap-native.ts` now constructs the existing `NativeHkaTransport` and
`OidcAccountLogin` through `binding-integration.ts` when the existing F3 release
opt-in is explicitly enabled. Its default remains false in `.env.example` and
no EAS profile enables it. The account-only Portal screen is unchanged.

Bootstrap validates fresh AppConfig, the registered `opago-wallet` broker metadata,
native build minimums, the independently pinned HPKE root/key document, revocations
and persisted rollback markers. It issues only anonymous configuration reads.
Account login and refresh obtain fresh broker configuration and use the existing
native ES256 verifier, PKCE browser, SecureStore and lifecycle guards. Logout
reuses client-only revocation and does not depend on fresh configuration.

The existing `OpagoAccount` still owns challenge, Spark identity signing,
verification, explicit binding, durable operation IDs and response validation.
No account ID/party ID is derived locally, no wallet is synthesized, and the
broker token is never converted into a WalletBearer or a Keycloak token.
UMA, POS adapters and transaction sync are not installed by this factory.

## Concrete backend blockers

The public API's checked-in 0.2.0 contract already specifies these operations.
An available facade does not prove their internal implementation or authorization:

| Required operation | Existing facade target / required result | Missing compatibility |
| --- | --- | --- |
| `GET /api/v2/account` | `GET /api/account`; closed `Account` response including `party_id` and `account_generation` | Supply the account projection authorized for the verified broker subject. Do not substitute `/user` or derive party IDs from `sub`. |
| `POST /api/v2/wallet/auth/challenge`, then `/verify` | `/api/wallet/auth/challenge`, `/verify`; `login` returns a `WalletSession`, `wallet_bind` an `ActionProof` | The inspected Compliance router `routers/internal/pos_binding_auth.py` accepts only `action=pos_bind`, not `login` or `wallet_bind`. |
| `POST /api/v2/account/wallets` | `POST /api/account/wallets`; `WalletBindingRequest` and authoritative `Wallet` response | Implement first binding with subject/tenant/party/generation checks and atomic proof consumption. No corresponding account handler was found in the inspected backend. |
| Subsequent wallet status/session lifecycle | `/api/v2/wallet/me`, `/auth/refresh`, `/auth/logout` and their existing 0.2.0 schemas | Prove compatibility with the returned 0.2.0 WalletBearer. A v3 session response has a different shape and no refresh endpoint. |

The new app sends the existing verified broker token unchanged:
issuer `https://api.opago.com`, audience `opago-account`, client `opago-wallet`.
API `services/wallet_broker_auth.py` deliberately accepts it only on its enumerated
merchant-data routes; that contract does not authorize the F3 account routes.
Compliance `wallet_account_bearer.py` instead verifies a private Keycloak realm
token with audience `opago-compliance-api`. The separate OPAGO API project chat must publish and
implement the broker-to-F3 authorization boundary without a direct app/Keycloak
connection or a client-side token substitution.

The v3 `/api/v3/wallets/challenges` and `/wallets/{wallet_id}/sessions` are not a
first-binding alternative: they require an existing owned wallet UUID and reject
`purpose=bind` with `422 rail_not_enabled`. The current payout `/user/wallet/link`
operation accepts a public key but does not implement this F3 proof/session contract.
Do not use it as an unsigned fallback. The proposed QR pairing-intent endpoints
are a separate contract and are not invented by this adapter.

Sources: API `contracts/lnurl-spark/v2/route-map.json`,
`docs/wallet-verified-data-routes.md`, `services/wallet_v2_transport.py`;
Compliance `routers/internal/pos_binding_auth.py`,
`routers/internal/wallet_sessions.py`, `wallet_session_proofs.py`,
`wallet_account_bearer.py` and `docs/wallet-session-store.md`.
These were source reads; no authenticated production probe was performed.

## Acceptance and native build

Keep this PR draft and F3 off until the separate OPAGO API implementation and Compliance deliver the boundary
and run the real facade-to-backend flow. Verify first binding, same-wallet replay,
foreign account/tenant/key, expired challenge/proof/session, concurrent binding,
lost-response recovery and client-only logout. Existing credentials must not
be promoted to wallet authority after any failed step.

After backend acceptance, add the reviewed production UI entry for explicit
ownership/binding; the current Portal screen still exposes account login only.
Review the app PR, then create a new signed EAS preview and record source SHA,
build ID, version code and APK hash. Preview defaults to Spark Regtest/Hedera
Testnet while the account origin is still the production API; it is not an
isolated account sandbox. Obtain an approved test account and matching backend
network policy. Expo Go and the old versionCode-17 preview do not validate this
native code. Confirm device login/return, ownership/binding, locks/cancellation,
restore, expiry, logout and preservation of existing local keys and funds.

Tests use fixed public configuration/key-document fixtures and explicit synthetic
OIDC/network ports. They verify trust rejection, lifecycle invalidation, client
logout during metadata outages and absence of fabricated binding/signatures when
the business backend is unavailable. They are not a production success test.

## Ownership correction — 27 October 2026

The separate **OPAGO API project chat** implements Challenge/Verify for `login`
and `wallet_bind`, internal handlers `/api/account` and `/api/account/wallets`,
and broker-token acceptance matching the Keycloak **AccountBearer F3** profile.
Those are not tasks for Michael's team and are not implemented again here.
The source inventory above records missing compatibility at inspection time,
not a claim about the other chat's current implementation or deployment.

Michael's team owns only the Keycloak/broker client, any required public values
in `OPAGOkubernetes`, binding evidence in Compliance (five years), and pin/deploy.
See [the binding decisions and API handoff](contracts/payout-binding-decisions-2026-10-27.md).
