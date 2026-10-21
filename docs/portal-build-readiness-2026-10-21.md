# Wallet / Portal build readiness — 21 October 2026

Source reviewed: `mvp-branch` at `bd19d189affe0f928b79221cdbe0c44c652474da`.
This dated report supersedes the current-status paragraphs of the October 15/16
account handoffs; those documents remain historical evidence.

## Ready

- Spark SDK is pinned to 0.14.0.
- `lib/opago/hpke-roots.ts` pins `opago-hpke-root-1` with the supplied Ed25519
  public key `Pus0lthp1p3EtJkixJuBanqaC5T1on5FALRUK_PDNaU`. Source version:
  `1612ed385ebc4185992b0096eedfb213`; document not-after limit 2027-04-30.
- RuntimeConfigClient only fetches the API configuration and validates its
  closed schema, lifetime, audience and supported build. No retired Keycloak
  or guessed portal URL is used as a fallback.
- Prepared browser lifecycle handles Android return, iOS dismissal, abort,
  double taps, stale callbacks, wallet lock and retry without granting signing
  authority. Browser return alone never authenticates an account.
- Local regression result: 970 passed, 1 skipped, 0 failures; typecheck passed.

## Not yet a working Portal account build

`website-account-config.ts` deliberately returns unavailable for AppConfig
0.2.0. That schema contains no Portal login/signup destinations or complete
native session handover. `bootstrap-native.ts` still raises
`wallet_session_contract_pending`.

D6 is a Dashboard contract. Do not copy its browser cookie, its client ID or its
merchant permissions into the Wallet. Required next implementation inputs are
the versioned Wallet AppConfig fields, private signup context, native callback
and token/session acceptance for the account/wallet routes. Once those are
confirmed, our Wallet adapter and API configuration support still need coding;
these are not solved by an image rollout or by pinning the HPKE signing root.

Do not change the public contract_version for the internal Spark helper 0.2.2.
Transfers/coverage payment path B remains outside MVP acceptance.

## Android candidate and next build

An installable candidate already exists for this exact application revision:

- EAS build `9f805d5d-871d-43f6-ae0c-b2bce803a608`
- Profile `preview`: Testnet/Regtest, package `com.opago.wallet`
- Version 1.0.0, versionCode 16
- APK SHA-256 `417fac9a0cdfc3b6d0ad23e69a2c8da4f56f7b3c3cf217107c216b5866e32907`

Use the recorded build evidence to verify the artifact checksum before install.
No new APK was generated merely for this documentation update. A new account
test build must be created from the reviewed adapter commit after the missing
contract is implemented; do not label the existing preview as successful
production signup/login or an authenticated POS payer release.

Build preparation: install the lockfile with Node 22.23.1, run `npm run
typecheck` and `npm test`, then use the existing Expo project and remote signing
key with `eas build --platform android --profile preview`. Record source SHA,
EAS ID, actual remote versionCode, artifact SHA-256 and signing certificate.
Never invent a minimum supported versionCode before device acceptance.

Device checklist: preserve wallet/recovery, launch and unlock; verify outage
messages; cancel browser login and return safely; then, after the adapter lands,
signup/confirm/login/return, account switch, expired config/key, wrong issuer,
logout and locked-wallet late callback. Payment testing is a separate step.
