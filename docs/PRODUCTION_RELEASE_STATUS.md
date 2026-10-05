# Production release status

**As of 5 October 2026:** OPAGO Wallet is production-ready for its implemented Bitcoin/Lightning and HBAR wallet features. More than ten people already use and test the app through TestFlight and Android distribution via Google Play/APK. Device acceptance for this implemented scope is complete.

This is the current release record. September grant candidates and dated development reports describe their own artifacts; their debug signing, test-network settings and old device-test checklists do not describe the current production builds.

The public build, artifact and on-chain observations are also recorded in [machine-readable release evidence](release-evidence/2026-10-05-production.json).

## Install the Android release

[Download OPAGO Wallet 1.0.0, Android build 12](https://expo.dev/artifacts/eas/63l1DUKIYeMT9plvqoGJ5ZmNTbDTR8vRDSHZvPGOdqY.apk)

The download was checked without authentication on 5 October 2026 and returned HTTP 200. This is a standalone release APK: download it on an Android device, permit installation from the browser when prompted, install it and open OPAGO Wallet. Metro, ADB and a development server are not required. Android 7.0/API 24 or later is required; authentication requirements are described in [SECURITY.md](../SECURITY.md).

The downloaded artifact was inspected with Android SDK `apksigner` and `aapt` on 5 October 2026:

| Evidence | Verified value |
| --- | --- |
| Package | `com.opago.wallet` |
| Version | `1.0.0`, version code `12` |
| File size | `166583276` bytes |
| APK SHA-256 | `2022e0281500b1e30a8d1af145c31cd919fc4a6285106ed6ef35cdc46b5f68d3` |
| APK v2 signature | Verified; one RSA-2048 signer |
| Signing certificate SHA-256 | `e1af011a9b8e07817568bc8d261ca8b8a6612cfa643e954ef4d093db37cefdb8` |
| Signing identity | Matches the EAS-managed Android release certificate recorded on 2 October; not the local Android Debug certificate |
| Debuggable application | Not present in `aapt dump badging` |
| Bundled application | `assets/index.android.bundle`, `11635636` bytes |
| Mainnet settings | Hedera Mainnet and Lightning Mainnet enabled in the production profile |

The private signing key remains in EAS. No private key, keystore, password or user recovery material is included here. Update the published download reference whenever replacing or rehosting this artifact.

## Successful production builds

EAS reported all three builds as `FINISHED` on 5 October 2026. All were built from merged main commit [`724ca2e6da346e181a83d72875d12ba55bca49e1`](https://github.com/opago-pay/opago-wallet/commit/724ca2e6da346e181a83d72875d12ba55bca49e1).

| Platform | Build | Profile | EAS distribution | Completed, 4 October 2026 CEST |
| --- | --- | --- | --- | --- |
| iOS | [46](https://expo.dev/accounts/fabcot01/projects/wallet/builds/f394175c-9eff-44ae-9ca3-bb0511143ce7) | `production` | `STORE` | 18:39 |
| Android | [11](https://expo.dev/accounts/fabcot01/projects/wallet/builds/88dbf9fb-0e29-409b-9ef0-e4e669629398) | `production` | `STORE` | 18:15 |
| Android APK | [12](https://expo.dev/accounts/fabcot01/projects/wallet/builds/c1c4852f-88e5-410a-a0e2-7ee9064bc9f4) | `production-apk` | `INTERNAL` | 18:32 |

`STORE` identifies an artifact built for store submission, not an assertion of public store approval. `INTERNAL` is the EAS distribution setting for the directly installable APK; the download above is accessible without an Expo login. TestFlight and Android user distribution are confirmed by the product owner; invitation links are managed outside this repository.

The recorded 4 October quality gate for this source passed TypeScript, lint, 718 application test cases and nine contract tests; one application case was skipped. The artifact and build results above were checked independently of the dated September test reports.

## Hedera Mainnet evidence

The app integrates native HBAR operations, Hedera Smart Contract Service and the official Mainnet Mirror Node. HTS, HCS, AI, DeFi liquidity and RWA tokenization are outside this payment-wallet use case.

| Evidence | Public reference |
| --- | --- |
| Deployed, source-verified checkout contract | [OpagoHbarCheckout `0.0.10850063`](https://hashscan.io/mainnet/contract/0.0.10850063) |
| Contract EVM address | `0x0000000000000000000000000000000000a58f0f` |
| Pinned runtime SHA-256 | `18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8` |
| Confirmed real-HBAR checkout | [Transaction `0.0.10861984@1789541018.595289764`](https://hashscan.io/mainnet/transaction/0.0.10861984%401789541018.595289764) |
| Deployment manifest | [hedera-mainnet.json](../deployments/hedera-mainnet.json) |

On 5 October, a read-only official Mirror Node lookup confirmed that the contract is not deleted and the recorded transaction is `CONTRACTCALL`, `SUCCESS`, with exactly `1000000` tinybars (`0.01 HBAR`) transferred to merchant account `0.0.10848889`. The September payment used project-controlled consumer and merchant accounts; it is deployment/integration evidence, not an external-user payment.

## User testing and release scope

The product owner confirmed more than ten users testing the implemented wallet functions via TestFlight and Android. See [device testing status](DEVICE_TESTING_STATUS.md). No separate device-test backlog remains for these functions.

The release includes wallet creation and recovery, locally protected keys, authentication and locking, Bitcoin/Lightning payment review and transfer functions, HBAR activation/send/receive, balances and history. OPAGO account/UMA integration, POS account linking, platform synchronization, identity onboarding and swaps retain their separate feature status in [FEATURE_MATRIX.md](FEATURE_MATRIX.md).

Security boundaries, provider-specific recovery limitations and the status of independent assurance are described in [SECURITY.md](../SECURITY.md) and the feature matrix. This release record does not claim an independent security audit or legal certification.

## Thrive submission evidence

The signed release and installation link supersede the old debug-candidate limitation. For the Guardian's separate real-user-payment and feedback requirements, attach actual tester Mainnet transaction links and consented feedback, plus a current install/start/payment video. Those external-user transaction links, feedback reports and current video URL have not been supplied for this repository update. User participation is confirmed; those additional exhibits are not inferred from the number of testers.

The [milestone record](THRIVE_MILESTONE2_MAINNET.md) retains the original submission history and records the current resubmission evidence separately. Documentation changes do not imply Guardian approval or a new portal submission.
