# Hedera activation API v1: wallet integration and acceptance

Checked on 2026-10-04 against https://hedera-activation.opago.com/v1/openapi.json.
The internal `mainnet-candidate`, EAS `production` / `production-apk`, and local
production candidate builds use `https://hedera-activation.opago.com` and
`network: mainnet` in every normal request. The production configuration gate
requires this URL so a release cannot silently omit activation. Local/default
builds remain Testnet and have no activation service configured. No store
rollout was performed.

## App behaviour

- Receive offers **Activate Hedera account**. Requests contain the derived
  32-byte Ed25519 public key as 64 lowercase hex characters. No bearer token,
  payer credential, private key or recovery words are sent.
- The client validates purpose, version, configured network, public key, nonce,
  challenge ID and expiry. It signs the exact UTF-8 bytes including the final
  LF, without hashing, prefixes or JSON serialization. The result is 128
  lowercase hex characters.
- A fresh challenge first reads `/v1/activations/status`. Only the explicit
  `JOB_NOT_FOUND` result permits `/v1/activations`, using another fresh proof.
  Lost creation responses are recovered via status rather than blindly creating
  another job. A restart or recovery uses the same derived public key.
- Polling backs off 15 / 30 / 60 seconds, observes later `retry_after`,
  `next_release_at` and HTTP `Retry-After`, and stops at confirmed, failed or
  needs_review. Foreground waiting is bounded to five minutes; the durable job
  can be checked again. Per-wallet cooldown survives repeated button presses
  in the process. A normal poll costs two IP requests and one proof, below
  the 30/IP and 10/key per-minute limits for one client. Shared-IP limits and
  other devices are handled through the server's 429 response.
- Locking, backgrounding or replacing the wallet prevents further signing.
  The native transport also cancels requests on session invalidation and now
  preserves Retry-After on Android and iOS.
- Confirmed IDs are looked up independently on the official Mirror Node for
  the selected network. The exact requested numerical ID, active lifecycle and
  matching Ed25519 key are checked before local binding. A mismatched account
  is never made usable. Server confirmation alone is insufficient.
- All stable API-v1 400/401/404/429/503 codes have user-facing messages in
  German, French, Spanish and Italian, with English source text. Pending
  MIRROR_UNAVAILABLE is shown as temporary service unavailability, not success.

## Official fixture and automated checks

`tests/fixtures/hedera-activation/test-vectors-v1.json` is copied unchanged from
[opago-compliance commit 4e51e217](https://github.com/opago-pay/opago-compliance/blob/4e51e217f072d8ff9a33d9aeeaef1e1ab6b27d99/apps/hedera-activation/test-vectors-v1.json).
The public test-only seed is deliberately part of that fixture. The upstream
fixture says Testnet; it is verified in the safe Testnet test configuration.
The real Mainnet challenge was tested separately below.

Tests cover exact public key/signature/final LF, wrong network, expiry, malformed
line endings, error codes, Retry-After, backoff, failed/review terminal states,
interruption, lost responses, restart/recovery, and wrong/deleted/expired account
responses. Run `npm run phase5:verify`. The additional Swift test needs Xcode;
Windows cannot execute it or certify an iOS runtime.

## Live Mainnet result — confirmed after backend DNS fix

On 2026-10-04, the real API accepted the wallet's raw Ed25519 signature.
It rejected a signature without the final LF with 401 INVALID_SIGNATURE,
rejected an already consumed proof with 401 CHALLENGE_USED, and rejected a
Testnet body with 400 NETWORK_DISABLED. The initial status request returned
404 JOB_NOT_FOUND without creating an activation.

One explicitly authorized activation was submitted for a separate random test
wallet. Its recovery words are stored only in the ignored local evidence folder,
encrypted using Windows DPAPI. No existing user wallet or payer key was used.

- Job: `33d34700-ee12-4c77-8abd-7f98825c7fd7`.
- Test public key: `a3e8d39b8e925e73b1b2ce9880e4009b1f4032521e43d8c4c6952940cf7a0ab4`.
- Initial proof checks: 2026-10-04 07:07 UTC (09:07 Europe/Berlin).
- Repeated status responses: `pending`, `error_code: MIRROR_UNAVAILABLE`,
  `account_id: null`, `transaction_id: null`; still present on a fresh-process
  recovery check around 07:17 UTC (09:17 Europe/Berlin).
- Fresh process + restored derivation + fresh proof returned the same job ID.
- Independent reads of the official Mainnet account-by-key endpoint and network
  exchange-rate endpoint returned HTTP 200 from this workstation. The account
  lookup was empty. That does not prove reachability from the deployed worker.

On 2026-10-04 at 12:21 UTC (14:21 Europe/Berlin), a fresh-process recovery
check with the unchanged application client from PR #33 (`21a329e`) returned
`confirmed`, no error, account `0.0.10904683`, and transaction
`0.0.10903266@1791105058.519714593`. No new activation was submitted.
The actual app account validator independently matched the numerical ID and
restored wallet's Ed25519 key against the official Mainnet Mirror Node.
The account has zero HBAR, consistent with activation without funding.
An independent transaction lookup returned `CRYPTOCREATEACCOUNT`, `SUCCESS`,
and entity ID `0.0.10904683`. The earlier backend blocker is resolved for this
job; the operator reports fixing cluster DNS. That infrastructure diagnosis
was not independently audited.

All 32 targeted activation API, flow and account tests passed again, including
the pinned signing vector, terminal states, retry handling and recovery.
This proves live API/client compatibility and command-line recovery; it does
is complemented by the current user device testing documented in [DEVICE_TESTING_STATUS.md](DEVICE_TESTING_STATUS.md).

## Backend implementation review

Reviewed API, signature/proof handling, persistent job creation, rate-limit SQL,
worker recovery and Mirror validation at the upstream commit above. In that
source, proof consumption is transactional, the key quota is charged only after
signature verification, job uniqueness is `(network, public_key)`, and the status
route does not create jobs. The worker stores its transaction before submission,
collects independent receipt/Mirror evidence, and checks the resulting account
key. These source observations do not establish the deployed image revision or
healthy worker egress in general. The successful job above verifies the live
path for this test; deployed image identity and infrastructure remain
operator-side checks.

No production load test was performed to force 429/503 or consume the daily
activation budget. These cases are covered by client-side controlled responses.

## Build and quality evidence

`npm run phase5:verify` passed: 701 application tests passed, zero failed,
one existing native integration test skipped, and 9 contract tests passed.
TypeScript, ESLint and the configured release checks passed.

The Android arm64 release-variant test APK built successfully (7m22s). Its
package ID is `com.opago.wallet.activationmainnet`; signature verification
reports the Android Debug test certificate. The packaged JS includes the
Mainnet activation URL and the native bridge includes Retry-After forwarding.
APK SHA-256: `96a5ea11664913524882c6c6ca9d8fe24546d6d2c6f575dfc1b07c4e8cd8b35a`.
The APK and build manifest are local, ignored artifacts under
`.codex-local-evidence/activation-mainnet-build/`; no upload was performed.

## Test build and service tools

Build an isolated Android APK with:

```powershell
./scripts/build-hedera-activation-mainnet-test.ps1
```

It uses package ID `com.opago.wallet.activationmainnet`, local test signing and
no Metro server. It does not install, upload or publish the APK. For long Windows
checkout paths, pass a short `-NativeBuildDirectory` for CMake artifacts. The
existing Testnet build script is unchanged.

The manual service check uses the actual app API client, signing and account
validation code:

```powershell
# Read an existing test job, restoring the locally protected test wallet:
node scripts/verify-hedera-activation-mainnet.cjs
# Only for an explicitly approved first sponsored Mainnet test activation:
node scripts/verify-hedera-activation-mainnet.cjs --create --protocol-check
```

The API confirms the exact on-network account. Fabian confirms that implemented features are already in the ongoing TestFlight and Android user test; no separate device acceptance is outstanding. See [current device testing status](DEVICE_TESTING_STATUS.md).
