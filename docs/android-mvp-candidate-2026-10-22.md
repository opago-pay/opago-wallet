# Android MVP candidate - 22 October 2026

Base: Wallet `mvp-branch` at `acd9685` (#53, #57, #59, #61).
API #617 is merged. This checkpoint supersedes the build/runtime observations in
PR #56; it does not claim that the complete Wallet account flow is enabled.

## Build changes

- Pin Node 22.23.4 across package engines, lockfile, CI, all EAS profiles and
  native iOS test/release gates. Main-only PR #62 does not update `mvp-branch`.
- Verify that development, preview, mainnet candidate and production profiles
  agree with the pinned runtime. The release APK inherits production as before.
- Give each preview APK an incremented EAS-managed versionCode.
- Update the public support link to `https://opago.com/portal` and the operator
  name to `opago GmbH`. This is an informational link, not an authentication adapter.
- Preserve preview Testnet/Regtest settings. No mainnet or account feature flag
  is enabled by this change. The preview cannot validate the mainnet-only Spark helper.

## Current public checks

At 2026-10-22 07:11:53 UTC, an unauthenticated GET of
`https://api.opago.com/api/v2/app/config` returned HTTP 302 to
`https://opago.cloudflareaccess.com/cdn-cgi/access/login/api.opago.com`.
Cloudflare ray: `a4e6b0c9af507ac3-FRA`. The Wallet requires direct JSON; it does
not follow Access login redirects. No redirect query or token was retained.

The separate HPKE-key document and broker discovery returned HTTP 200. These
read-only checks do not establish authenticated account or wallet access.
No login, invoice callback or payment was attempted.

## Remaining runtime work

1. **AppConfig exposure and schema:** Michael owns the Access exemption and
   deployed configuration. API/Wallet owners must agree and implement a versioned
   Portal-login/signup configuration. Current AppConfig 0.2.0 remains closed and
   has no such fields; do not guess URLs or reinterpret legacy OIDC metadata.
2. **Wallet account/session adapter:** Compliance's published
   `docs/wallet-identity-verification.md` authorizes eight merchant-data routes
   using verified Wallet identity. It does not specify the F3 `/api/v2/account*`
   and `/api/v2/wallet/auth/*` integration or their mapping to v3 wallet sessions.
   Agree that contract with Compliance, then connect the API facade and native
   `bootstrap-native.ts`. API #617 removes direct provider access but does not
   supply this missing wallet-authority contract.
3. **Signup and lifecycle:** Preserve the Wallet client's PKCE request through
   private-customer signup, email confirmation and Portal login; wire native
   refresh and account-wide logout using the confirmed API contract. Existing
   verifier/lifecycle tests are preparation, not proof of the native flow.
4. **Device acceptance:** Install without clearing app data, verify package,
   signing certificate, versionCode and APK hash; test cold start, local wallet,
   network settings and recovery preservation. No Android device was connected
   at this checkpoint. Complete account tests only after items 1-3.

`websiteAccountAvailability` remains unavailable and `createNativeF3Integration`
continues to reject with `wallet_session_contract_pending`. Removing those gates
without an implemented adapter would falsely present login as working.

## Validation and artifacts

Clean `npm ci` and `npm run phase5:verify` passed on Node 22.23.4: native
patch checks, TypeScript, ESLint, 1,016 application tests (1 skipped), nine contract
tests and syntax/configuration checks. `npm audit --omit=dev` reports 0 Critical,
23 High and 5 Moderate, matching the three leaf advisories already recorded in
`security-dependencies-2026-10-21.md`; it is not an all-clear security report.
Record the Android export result, PR head and EAS artifact separately.
An Android JS export is not an installable APK. A successful APK build is not
production MVP acceptance. The EAS preview uses the existing authorized project
and signing key; no store submission or production rollout is part of this task.

## Preview snapshot

EAS build `e4a0e7b6-9404-48a4-b2e5-e2cfe7524b47` uses source `2ea74c5`
and Android versionCode 17. The source checkout was clean. EAS has no Git commit
metadata because this upload used no-VCS mode. This preview predates the final
support-link/operator-text correction in this PR; no account code differs.
The build result and APK hash are recorded after completion in the PR.
Android Hermes export passed with SHA-256
`4b8c1690e605b543060b2a74db5c35cdf47fb95e603934f80854b44374ed93aa`.
