# Wallet / Portal build readiness - 21 October 2026

Application source: `mvp-branch` at `acd9685` (after #53, #57, #59 and #61).
API source checkpoint: main `c3696b6` (after #606 and #607). These are source
checkpoints, not claims about deployed configuration or successful account login.
This report supersedes earlier current-status paragraphs, not historical evidence.

## Implemented and ready for independent verification

- Spark SDK 0.14.0 and the dependency resolutions from #59 are on MVP. The exact
  scope and remaining audit findings are in `security-dependencies-2026-10-21.md`;
  do not claim Michael's external vulnerability-report acceptance from npm alone.
- `hpke-roots.ts` pins `opago-hpke-root-1`, Ed25519 public key
  `Pus0lthp1p3EtJkixJuBanqaC5T1on5FALRUK_PDNaU`, source version
  `1612ed385ebc4185992b0096eedfb213`, maximum document expiry 2027-04-30.
- #57 adds the strict Wallet ES256 broker profile, callback issuer validation
  and the explicit `com.opago.wallet` native scheme. The callback is
  `com.opago.wallet:/oauth/callback`; the client remains `opago-wallet`.
- #61 fences late login/refresh responses across logout, lock and account change
  and coordinates rotating-token refresh across recreated adapter instances.
- Browser return alone never grants account or wallet signing authority. Local
  funds/recovery remain independent of the still-closed account integration.

## Not yet a working Portal account build

`website-account-config.ts` still returns unavailable for AppConfig 0.2.0.
`bootstrap-native.ts:createNativeF3Integration` still raises
`wallet_session_contract_pending`. The prepared verifier and lifecycle classes
are not connected into the production account/wallet runtime.

Remaining integration inputs and work:

| Input / implementation | Owner / boundary |
| --- | --- |
| Versioned AppConfig fields for Portal destinations and handover | Agree exact schema and deployed values with Michael; Fabian implements API/Wallet support. Do not overload legacy oidc fields. |
| PrivateCustomer signup from Wallet through email confirmation and return | Agree how the original authorization request survives; Fabian connects Portal/Wallet behavior. Do not use the Dashboard client or cookie. |
| ServiceAccount authentication | API #607 is merged. Michael must deploy Compliance #1016 and the projected token with roles before the new API image is pinned. |
| Wallet identity and resource authorization | API #606 provides local verification, not transport activation. #1014 validates identity; the announced data-route handover still needs exact fields/errors and coverage of wallet challenge/session routes. |
| Account-wide logout | Michael supplies the announced user-ID logout contract; Fabian connects API and native lifecycle. The existing refresh-token-only Compliance logout is not equivalent. |
| Native F3 adapter | Fabian connects configuration, browser exchange, verified account identity, wallet ownership proof, storage, refresh and logout after the contracts are available. |

The API shared verifier currently permits at most 300-second customer tokens;
the prepared mobile broker profile accepts the configurable 60-900-second range.
Prove a common issuance/acceptance policy before enabling the runtime. Do not
silently widen API permissions or token lifetime to bypass an integration failure.

D6 is the Portal contract, not a Wallet signing/session contract. Internal Spark
helper 0.2.2 does not change public contract_version. Transfers/coverage payment
path B remains outside the agreed MVP acceptance.

## Android build preparation

Use Node 22.23.1 and the lockfile: `npm ci`, then `npm run phase5:verify`.
Postinstall native patches must run; copied or partially installed node_modules
are not release evidence. Check the Android JS bundle separately before spending
an EAS build. A bundle export is not an installable APK or a device test.

The existing preview profile builds an internal APK on Testnet/Regtest with
mainnet flags disabled. It cannot prove the mainnet-only Compliance Spark-helper
path. Use an explicitly approved matching environment for that acceptance; do
not switch networks or enable production payment flags merely to make a build.

A fresh Android test APK can be built through the existing Expo project with
`eas build --platform android --profile preview`, but account features above
remain unavailable until integration lands. Record application SHA, EAS build
ID, actual remote versionCode, APK SHA-256 and signing certificate. Preserve
recovery/local data and confirm the installed version; do not invent a minimum
supported build before device acceptance.

Historical preview: EAS `9f805d5d-871d-43f6-ae0c-b2bce803a608`, application source
`bd19d18`, versionCode 16, SHA-256
`417fac9a0cdfc3b6d0ad23e69a2c8da4f56f7b3c3cf217107c216b5866e32907`.
It predates #57/#59/#61 and must not be described as the current MVP candidate.

## Acceptance sequence

1. Independent: clean install, native patches, TypeScript/lint/application tests,
   contract tests and Android JS bundle. Record exact tools and results below.
2. Deployed service setup: Compliance #1016 + SA mount/role map, then API image;
   authenticated HPKE and token rotation checks. Anonymous 401 is insufficient.
3. Approved configuration: exact native callback, Portal URLs, PrivateCustomer
   context, HPKE signature and compatible token policy. No guessed fallback URL.
4. Account flow: signup, confirm, login, return, identity lookup, separate wallet
   ownership challenge/session binding. Test foreign account/wallet rejection.
5. Lifecycle: double tap, cancel, wrong/missing issuer, duplicate/cold-start return,
   lock or logout during exchange, concurrent refresh, account switch and expiry.
   Central logout must also end Website/Portal access and prevent replay.
6. Data and payments: exercise available account/transaction/Lightning routes on
   the declared network. Payment tests are separately authorized, never inferred
   from a successful discovery or JS build.

## Latest local validation

On the application tree at `acd9685`, Node 22.23.1 / npm 10.9.8:

- Clean `npm ci` completed; all three native patch checks passed. The existing
  Hiero/protobuf peer warning remains visible; no force/legacy-peer override used.
- `npm run phase5:verify` passed: TypeScript, ESLint, 1,016 application tests
  passed / 1 skipped / 0 failed, 9 contract tests, compilation and syntax gates.
- Android `expo export` succeeded with preview Testnet/Regtest flags,
  `EXPO_NO_DOTENV=1` and offline mode. Hermes bundle SHA-256:
  `b03e7cf12d05196088e85baf17f8bbece2a17697a9634ba80470f546672c6e21`.
  Metro reported dependency package-export fallbacks for noble/hashes; export
  completed successfully. This does not replace native device verification.
- No new APK, EAS upload, device result or production acceptance was produced.

Local evidence files: `wallet-mvp-post607-install.log`,
`wallet-mvp-post607-verify.log`, `wallet-mvp-post607-export.log` in the operator's
Temp directory; Android export is `opago-wallet-post607-android-export` there.
These local files are not CI artifacts or secrets and are not committed.
