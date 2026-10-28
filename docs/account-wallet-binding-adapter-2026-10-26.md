# Native account/wallet adapter — updated 28 October 2026

This draft replaces the unconditional `wallet_session_contract_pending` failure
shipped in APK source `855530934a0367d0108dbf2ddc157cef53f314ec` with real native
account and wallet API wiring. It incorporates Wallet main
`f8ea690eafe3318ad94dd0b53b7b55a75824e3ac`. No deployment, production flag, account
or wallet binding was changed by this work.

## Implemented app flow

`bootstrap-native.ts` constructs `NativeHkaTransport` and `OidcAccountLogin`
through `binding-integration.ts`. The existing F3 build opt-in is respected;
current EAS production configuration already enables it. Disabled builds report
`wallet_integration_disabled`, rather than pretending a backend request failed.

Bootstrap validates fresh AppConfig, broker metadata, native build minimums,
the independently pinned HPKE root/key document, revocations and rollback markers.
It issues only anonymous configuration reads. Account authentication uses the
existing native ES256 verifier, PKCE browser, SecureStore and lifecycle guards.
The verified broker token is forwarded unchanged; the backend must authorize it.

The public account screen's **Check wallet backend** action restores the shared,
cryptographically verified browser session and reads `GET /api/v2/account`.
If a wallet session exists it also reads `GET /api/v2/wallet/me`. It reports a
binding only from a fresh matching account/wallet response with wallet scope.
It never creates a challenge, signs, binds, or fabricates a session. Missing
browser credentials clear stale local account/session authority.

The separate **Wallet ownership and binding** screen exposes explicit sign-in,
account refresh, ownership proof, binding and wallet status actions. Existing
`OpagoAccount` code handles challenge/verify, native biometric approval and Spark
identity signing, durable operation IDs, response validation and session renewal
after binding. Each ownership/binding action refreshes the account first. A
browser login alone never becomes a WalletBearer or a confirmed binding.
The screen ignores test-mode query parameters and hides account details while
locked or unfocused. Lock/unlock rebuilds native adapters; delayed bootstrap
results cannot replace the new wallet lifecycle.

UMA, POS/QR pairing and transaction sync adapters remain separate integrations.
The payout unlink/relink policy and domain model in this draft do not provide a
new backend endpoint or enable payment destinations.

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
`npm run phase5:verify` passed on pinned Node 22.23.4: 1,172 application tests
passed, one existing test skipped, and all nine contract tests passed, along with
typecheck, lint and configuration/patch/syntax gates. The existing iOS plist test
used a local `python3.exe` alias to installed Python 3.14 on Windows. Android
Expo export with the existing EAS production environment also succeeded.
These checks are not production acceptance or a signed native APK build.

Keep the PR draft until real authenticated acceptance is recorded: approved test
account, matching backend network, first binding, replay/lost-response recovery,
foreign account/key rejection, expiry, logout and lock/cancellation. Build and
install a new signed APK with source SHA, build ID, version code and APK hash.
Confirm login/return, proof, binding, restart and status on the physical device,
preserving existing local keys/funds. The installed versionCode-21 APK predates
this change and does not validate it. No replacement APK was installed here.
