# Thrive Milestone 2 - Hedera Mainnet evidence package

**Due:** 10 October 2026

**Status:** original submission recorded on 16 September 2026; Guardian rejected it for public-access and real-user evidence. Current release evidence is updated below; no new portal submission or Guardian approval is claimed.

**Scope:** the Hedera Mainnet wallet and checkout path in the public multi-chain Opago hackathon repository

This record distinguishes public, independently inspectable evidence from information retained only in the Thrive submission. It never substitutes a Testnet link, intended transaction, or manually invented identifier for Mainnet evidence.

## Current resubmission evidence — 5 October 2026

The implemented wallet features are production-ready and tested by more than ten users through TestFlight and Android distribution. The original debug grant candidate has been superseded by signed production artifacts. Use [PRODUCTION_RELEASE_STATUS.md](PRODUCTION_RELEASE_STATUS.md) for the canonical release status, certificate and artifact verification.

| Guardian concern from the original rejection | Current evidence |
| --- | --- |
| Only a debug-signed internal candidate | Android release APK 12 is signed with the EAS release certificate, package `com.opago.wallet`; APK v2 verification passes |
| No publicly installable release | [Direct Android APK download](https://expo.dev/artifacts/eas/63l1DUKIYeMT9plvqoGJ5ZmNTbDTR8vRDSHZvPGOdqY.apk) returned HTTP 200 without authentication on 5 October |
| Dependency on Metro or ADB | The release contains its embedded application bundle and is installed directly on Android; `developmentClient: false` in the APK profile |
| Store-signed artifact still listed as open | Successful iOS production build 46, Android store artifact 11 and Android release APK 12 are recorded in the current release evidence |
| No pilot users | The product owner confirms more than ten users through TestFlight and Android distribution |
| Payments only between project-controlled accounts; no feedback | The published September transactions remain project-controlled-account evidence. External tester Mainnet transaction links and actual feedback have not been supplied for this documentation update; attach them to the resubmission |

Do not infer external-user payments from participation alone. The updated installation/payment video and any TestFlight or Play invitation links must also be attached in the portal. Public store approval, independent audit and Guardian approval are not asserted by this update.

## Current submission fields

### Written summary

> Opago Wallet is live on Hedera Mainnet and production-ready for its implemented wallet features. We deployed and source-verified the OpagoHbarCheckout smart contract (0.0.10850063). The non-custodial app supports HBAR account activation, balance and transaction history, sending and receiving HBAR, and on-device signing with locally protected keys. Integration covers Hedera's native HBAR services, Smart Contract Service and the official Mainnet Mirror Node. Real-HBAR contract checkout payments have reached SUCCESS and are publicly verifiable on HashScan, including a 0.01 HBAR payment to a separate merchant account. The app is already used and tested by more than 10 people through TestFlight and Android distribution via Google Play/APK. Current iOS and Android production builds have completed successfully.

### Mainnet contract address

[OpagoHbarCheckout `0.0.10850063`](https://hashscan.io/mainnet/contract/0.0.10850063)

### GitHub repository

[Public repository](https://github.com/opago-pay/opago-wallet) with [release source `724ca2e`](https://github.com/opago-pay/opago-wallet/tree/724ca2e6da346e181a83d72875d12ba55bca49e1). All deployment code is public.

### Demo and user evidence

Use the signed Android APK linked above in the updated demo. Show installation and startup without development tools, a user-authorized Mainnet operation, its confirmed result and the corresponding HashScan entry. The previous video's URL was supplied directly in the portal and is not stored here; no new video URL is invented.

More than ten users are confirmed. Add consented feedback and actual external-user Mainnet transaction links when supplying those exhibits. No feedback quote or external-user payment is fabricated.

### Additional context

OPAGO Wallet is a non-custodial payment wallet. Required Hedera integrations are native HBAR services, Smart Contract Service and Mirror Nodes; HTS and HCS are not required for this use case. AI, DeFi liquidity and RWA tokenization requirements do not apply. Current production builds also enable Bitcoin/Lightning Mainnet. OPAGO account/UMA and identity integrations retain their own feature scope.

## Original submission archive — 16 September 2026

The original submission fields, build identity and consensus evidence below are historical. They must not be presented as the current release status. Old incomplete checklist items are observations from that submission, not a current device-test backlog.

## Original submission fields

### Written summary

> Opago deployed its non-custodial HBAR checkout contract on Hedera Mainnet and integrated the verified deployment into the Android consumer wallet. The app protects the user's Hedera key locally, discovers the account through the official Mirror Node, loads balance and history, creates interoperable receive requests, and signs direct HBAR or contract checkout payments only after explicit on-device review and confirmation. Checkout requests bind chain ID, contract, merchant, exact tinybar amount, nonce, and expiry. Failed, expired, duplicate, replayed, or unknown transactions never appear as successful. The runtime is pinned by SHA-256 and matched against Mainnet Mirror Node bytecode and Sourcify. The submitted demo records a real-HBAR payment, consensus result, history, and public HashScan evidence. Other multi-chain hackathon features are outside this milestone.

This text is below the form's 1,000-character limit and every technical claim is bounded by the evidence below.

### Mainnet contract address

[OpagoHbarCheckout `0.0.10850063` on Hedera Mainnet HashScan](https://hashscan.io/mainnet/contract/0.0.10850063)

### GitHub repository

[Public repository at submitted commit `b955c7529d36f10464d07182ec960460b794a73d`](https://github.com/opago-pay/opago-wallet/tree/b955c7529d36f10464d07182ec960460b794a73d)

### Demo video

The submitted recording shows this sequence:

1. Show the exact app version/commit and visible `Hedera Mainnet` / `REAL HBAR` state.
2. Show the consumer wallet's real balance without exposing recovery material.
3. Open the separate merchant page and show its merchant, amount, expiry, verified contract, and Mainnet QR.
4. Scan in the Android wallet and show the complete final review before signing.
5. Authenticate, submit, and wait for a consensus-confirmed success result.
6. Open the exact Mainnet transaction and contract on HashScan.
7. Refresh wallet history and show the same confirmed transaction.
8. Briefly show that an expired or altered request is rejected, if this fits within five minutes.

The externally hosted video URL was supplied in the Thrive form. It is not duplicated in this repository because it is not required to reproduce or verify the public on-chain evidence.

### Initial user feedback

No external public-pilot feedback is claimed for this milestone. The recorded acceptance was performed by the project team on a physical Android device. Future feedback must be consented, non-sensitive, and tied to an exact build without exposing private keys, recovery phrases, personal balances, or unnecessary personal data.

### Additional context

> Thrive Milestone 2 covers the Hedera Mainnet consumer-wallet and contract-checkout path; it does not claim production readiness for the repository's Lightning, eID, or Travel Rule demonstrations. The merchant QR page used in the video is a separate reference service and is not bundled into the consumer wallet. Opago does not sponsor customer account activation or custody user funds.

## Evidence checklist

- [x] `npm run phase5:verify` passes for the submitted source: TypeScript, ESLint, `113/113` application tests, and `9/9` contract tests.
- Independent contract/security audit: not documented in the September submission; no audit is claimed by the current release record.
- [x] The deployment account had at least the documented 30 HBAR safety reserve.
- [x] `npm run contract:preflight:mainnet` passed immediately before deployment.
- [x] Opago explicitly approved the exact runtime hash and real-HBAR deployment.
- [x] `npm run contract:deploy:mainnet` reached Mainnet consensus successfully.
- [x] `npm run contract:verify:mainnet` confirmed Mirror Node bytecode and Sourcify status.
- [x] `deployments/hedera-mainnet.json` contains only script-derived public evidence.
- [x] The Mainnet Android build is pinned to that contract ID and runtime hash.
- [x] The standalone internal candidate starts without Metro or a development server.
- Release artifact: the September submission used a locally signed candidate; current signed production artifacts and the public APK are documented in the resubmission evidence above.
- [x] One small real-HBAR checkout succeeds from a separate consumer wallet to the merchant.
- Invalid/expired physical scenario: not established by this historical September submission checklist; this is not a current device-test task.
- [x] App history, Mirror Node, and HashScan agree on the transaction and amount.
- [x] The submitted video is 1-5 minutes and shows the real Mainnet checkout and HashScan evidence without secrets.
- [x] The repository URL resolves publicly and the submitted commit hash is recorded.
- [x] The final written summary contains no claim that exceeds the recorded evidence.

## Immutable submission record

Fill this table only from verified build and deployment output:

| Evidence | Value |
| --- | --- |
| Deployment source commit | `bd68e8f68498dd825c51bdbf2bb43a38c600c513` |
| Final submission commit | [`b955c7529d36f10464d07182ec960460b794a73d`](https://github.com/opago-pay/opago-wallet/tree/b955c7529d36f10464d07182ec960460b794a73d) |
| Android version/build | `1.0.0`; standalone internal candidate from `b955c7529d36f10464d07182ec960460b794a73d`; APK SHA-256 `19a0ea2c9da565d2f02b7321a14f001dad85a20210f9267b23db65d542e3b738`; local debug certificate, not a store artifact |
| Contract ID | `0.0.10850063` |
| Contract EVM address | `0x0000000000000000000000000000000000a58f0f` |
| Deployment transaction | `0.0.10848889@1788856737.537500943` |
| Runtime SHA-256 | `18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8` |
| Sourcify status | `verified` (`d7f91325-8b0d-4fa5-9e8d-95a8a06402da`) |
| Submission-video payment transaction | [`0.0.10861984@1789541018.595289764`](https://hashscan.io/mainnet/transaction/0.0.10861984%401789541018.595289764) |
| Merchant account | `0.0.10848889` |
| Consumer account | `0.0.10861984` |
| Video URL | Supplied directly in the Thrive portal; not stored in this repository |
| Submission timestamp | 16 September 2026; exact portal timestamp retained by Thrive |

The complete public transaction and physical-device record is in [HEDERA_MAINNET_CANARY_ACCEPTANCE.md](HEDERA_MAINNET_CANARY_ACCEPTANCE.md). Deployment procedure and secret-handling rules are defined in [HEDERA_MAINNET_DEPLOYMENT_RUNBOOK.md](HEDERA_MAINNET_DEPLOYMENT_RUNBOOK.md).
