# Native account/wallet adapter — updated 29 October 2026

This implementation prepares real native account and wallet API wiring but keeps
the production `wallet_session_contract_pending` boundary. It incorporates Wallet
main `eed48bab70b4fd2d44f3ceed6a1e7faa2b239492`. No deployment, production flag,
account or wallet binding was changed by this work.

## Current release boundary

The existing EAS production profiles already set `EXPO_PUBLIC_OPAGO_F3_ENABLED`
to `true`. That flag must not silently activate this unfinished backend path.
`bootstrap-native.ts` therefore still rejects before loading HTTP, browser,
key-store or signing adapters. Prepared native wiring lives separately in
`binding-integration-native.ts`, which application code does not import. Connecting
it requires a separate reviewed rollout after backend lifecycle acceptance.

The published AppConfig/OIDC/HPKE contracts establish transport and browser trust,
not readiness of wallet status, refresh, logout, session keys or binding services.
No new capability field, deployment flag or protocol is introduced. Ordinary public
browser account login/signup and local self-custodial wallet operations remain
independent. The account UI explicitly explains that wallet linking is not enabled.
The historical APK and live probes below used earlier source and do not establish
that this candidate activates or completes F3.

## Prepared app flow (not activated in production)

`binding-integration-native.ts` can construct `NativeHkaTransport` and `OidcAccountLogin`
through `binding-integration.ts`. The existing F3 build opt-in is respected;
the production bootstrap remains closed independently of that opt-in. Disabled
builds report `wallet_integration_disabled`; enabled builds remain pending backend
acceptance rather than constructing this adapter.

Bootstrap validates fresh AppConfig, broker metadata, native build minimums,
the independently pinned HPKE root/key document, revocations and rollback markers.
It issues only anonymous configuration reads. Account authentication uses the
existing native ES256 verifier, PKCE browser, SecureStore and lifecycle guards.
The verified broker token is forwarded unchanged; the backend must authorize it.

After a future reviewed activation, the public account screen's **Check wallet
backend** implementation would restore the shared,
cryptographically verified browser session and reads `GET /api/v2/account`.
If a wallet session exists it also reads `GET /api/v2/wallet/me`. It reports a
binding only from a fresh matching account/wallet response with wallet scope.
It never creates a challenge, signs, binds, or fabricates a session. Missing
browser credentials clear stale local account/session authority.

The prepared **Wallet ownership and binding** screen provides explicit sign-in,
account refresh, ownership proof, binding and wallet status actions. Existing
`OpagoAccount` code handles challenge/verify, native biometric approval and Spark
identity signing, durable operation IDs, response validation and session renewal
after binding. Each ownership/binding action refreshes the account first. A
browser login alone never becomes a WalletBearer or a confirmed binding.
The screen revalidates the browser session and backend status whenever it gains
focus, before exposing cached state, including after logout through the public
account screen. It ignores test-mode query parameters and hides account details
while locked or unfocused. Lock/unlock rebuilds native adapters; delayed bootstrap
results cannot replace the new wallet lifecycle. Until activation, no runtime or
ownership/binding actions load; the screen reports the pending backend acceptance.

UMA, POS/QR pairing and transaction sync adapters remain separate integrations.
The payout unlink/relink policy and domain model in this draft do not provide a
new backend endpoint or enable payment destinations. Cancelling a dispatched
pairing/unlink operation clears sensitive UI state but preserves an unknown-outcome
fence until same-account read-only reconciliation; dismissal cannot allow a second
mutation or a second proof.

## API implementation and remaining backend acceptance

The earlier inventory in this document is superseded by API main
`88e715f58d65d18d5205098963321d0502464053`. It includes the F3 account projection,
`login` / `wallet_bind` challenge/verify core and binding forwarding. See the
[API's exact activation and internal-service contract](https://github.com/opago-pay/opago-api/blob/88e715f58d65d18d5205098963321d0502464053/docs/wallet-f3-binding-backend-handoff.md).
Those API handlers must not be implemented a second time in the wallet.

That implementation is default-off. Activation requires
`WALLET_F3_ACCOUNT_ENABLED=true`, `WALLET_F3_BROKER_ACCOUNT_ENABLED=true`,
`WALLET_F3_COMPLIANCE_CONTRACT=api-f3-v1` and an approved `WALLET_F3_NETWORKS` policy.
The API handoff additionally requires these authoritative internal-service ports:

| Internal operation | Required responsibility |
| --- | --- |
| `GET /internal/v2/wallet-f3/account` | Current account/role/session checks and persisted subject-to-customer mapping |
| `POST /internal/v2/wallet-f3/wallets/lookup` | Persisted wallet ownership and network, with no wallet creation from lookup |
| `POST /internal/v2/wallet-f3/credentials` | Atomic, repeatable proof/session issuance and durable binding evidence |
| `POST /internal/v2/wallet-f3/account/wallets` | Atomic proof consumption and binding, durable original result and evidence |

Compatible 0.2.0 wallet status/refresh/logout and the required evidence retention
also need acceptance. The API document explicitly describes these internal ports
as future requirements, not verified deployed endpoints. Their present production
availability was not established in this wallet work. Michael's team must confirm
the internal-service contract and deployment; turning on flags alone is not
acceptance. See also the earlier [product decisions](contracts/payout-binding-decisions-2026-10-27.md).

## Verification and release boundary

On 28 October, a credential-free live probe using the actual integration factory,
Android build number 21 and HTTP fetch returned 200 for AppConfig, OIDC discovery
and the HPKE key document. Pinned key verification succeeded and created the HKA
transport. This was a Node probe, not a device test or authenticated binding.
No production token, wallet signature, account creation or binding was submitted.

Automated tests use explicit synthetic OIDC/network/backend ports. They cover
trust rejection, restoration of the shared login, account lookup without invented
wallet authority, fresh status, API failure, foreign subjects, logout/lock races,
native adapter recreation, and separate ownership/binding approvals in the UI.
`npm run phase5:verify` passed on pinned Node 22.23.4: 1,173 application tests
passed, one existing test skipped, and all nine contract tests passed, along with
typecheck, lint and configuration/patch/syntax gates. The existing iOS plist test
used a local `python3.exe` alias to installed Python 3.14 on Windows. Android
Expo export with the existing EAS production environment also succeeded.
These checks are not production backend acceptance.

An APK can be built and tested before backend acceptance; the PR review status
does not gate that test. Production acceptance still requires an approved test
account and matching backend network, first binding, replay/lost-response recovery,
foreign account/key rejection, expiry, logout and lock/cancellation.

On 28 October, EAS refused the requested build because the account's monthly
Android build quota was exhausted. A local standalone release APK was then built
from exact source `514c23d47ea9311822cbbc10cabf6be5f9e96ab7`, using the existing
production profile, Node 22.23.4 and a generated-native-only versionCode override.
Gradle completed all 1,103 tasks successfully. APK evidence:

- Package `com.opago.wallet`, versionName `1.0.0`, versionCode **22**, arm64-v8a.
- Production networks and F3 enabled; embedded Hermes bundle; not debuggable.
- APK SHA-256: `04302e672dae14cba2e764b01bc6385b156284a1578547a21fa95a06925a09e9`.
- Signing certificate SHA-256: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
  This is the same local Android test certificate as installed version 21,
  not the EAS/store release certificate.
- `adb install -r` succeeded on the attached G7 device, with no uninstall or data
  clearing. Installed version 22 was confirmed; launch returned `Status: ok` and
  the app displayed its wallet unlock screen.

The device was subsequently unlocked and the native backend inspection completed
with “Please sign in again.” Configuration and HPKE discovery reached the real
API and returned 200. The user attempted browser authentication, but the return
to the wallet failed before OAuth token exchange/account or binding acceptance.

Public API access logs on 28 October (UTC; local Europe/Berlin was UTC+1):

| Time | Request | Status |
| --- | --- | --- |
| 22:49:29 | `POST /api/v2/auth/token` | 200 |
| 22:49:29 | `POST /api/v2/auth/handover-ticket` | 503 |
| 22:49:43 | `POST /api/v2/auth/token` | 200 |
| 22:49:43 | `POST /api/v2/auth/handover-ticket` | 503 |
| 22:50:13 | `POST /api/v2/auth/token` | 200 |
| 22:50:13 | `POST /api/v2/auth/handover-ticket` | 503 |
| 22:50:31 | `POST /api/v2/auth/token` | 200 |
| 22:50:31 | `POST /api/v2/auth/handover-ticket` | 503 |

The failing handover requests were seen across all three public API replicas.
The public handler checks the website session through the internal
`POST /api/auth/verify-website-session` operation and uses Redis for revocation,
quotas and one-time tickets. Its source maps several configuration, internal
authenticator and Redis exceptions to the same 503. Access logs did not expose
which exception occurred; no matching internal session-verification access entries
were available in the inspected container logs. The developer readonly role was
denied access to the internal gateway ConfigMap. Therefore the exact dependency
failure remains unconfirmed and must not be labelled a proven Redis failure or
a proven missing internal handler. Backend operators can correlate the above
times and inspect that handover/session-verification path.

This is a real device failure at browser-to-app handover, not a successful binding
test. No ownership proof or binding was submitted, and stored balances were not
verified. The app remained usable and returned to its wallet home screen.
The running API deployment had the broker enabled and no explicit `WALLET_F3_*`
environment settings (no `envFrom`); its internal-service acceptance remains open.
