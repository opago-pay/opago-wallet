# Hedera Mainnet scope and ownership

**Current status — 5 October 2026:** OPAGO Wallet is production-ready for its implemented Bitcoin/Lightning and HBAR wallet features. Signed iOS and Android production builds are available, and more than ten people use and test the app through TestFlight and Android distribution. The [production release record](PRODUCTION_RELEASE_STATUS.md) contains the public APK, verified release certificate, build IDs and Mainnet evidence.

## Product scope

OPAGO Wallet is a non-custodial consumer payment wallet. Users control their locally protected keys and authorize payments on-device. Bitcoin/Lightning is the default experience; HBAR is available under the additional asset options.

The Hedera implementation uses native HBAR services, Smart Contract Service and the official Mainnet Mirror Node. HTS, HCS, AI, RWA tokenization and DeFi liquidity are not requirements of this use case.

| Capability | Implementation and evidence |
| --- | --- |
| HBAR activation | Mainnet activation API and verified binding to the locally derived Ed25519 public key; see [activation API](HEDERA_ACTIVATION_API_V1_APP.md) |
| HBAR balance, receive, direct send and history | Native HBAR operations and Mirror Node REST API |
| Contract checkout | Source-verified [contract `0.0.10850063`](https://hashscan.io/mainnet/contract/0.0.10850063), pinned by runtime hash |
| Transaction reconciliation | Consensus receipts and Mirror Node results; unknown outcomes retain a pending state |
| Release distribution | Signed iOS build 46, Android store artifact 11 and directly installable Android release APK 12 |
| Implemented-function device acceptance | Complete; more than ten users in the current TestFlight/Android test distribution |

Both current production profiles enable Bitcoin/Lightning Mainnet and Hedera Mainnet. The HBAR limit uses the available balance, with amount plus the applicable maximum network fee checked before signing. The old `1 HBAR` cap applies only to the historical grant candidate.

The Mainnet activation service supersedes the September first-deposit-only onboarding model. It creates an account for the user's public key without receiving the recovery phrase or private key. Account activation and transaction funding are separate: the user must have enough HBAR for a payment and its network fee.

## Separate integrations and assurances

OPAGO account/UMA integration, POS linking, platform synchronization, identity onboarding and swaps retain their own implementation status. The separate merchant QR reference service does not establish a verified OPAGO merchant identity. See the [feature matrix](FEATURE_MATRIX.md) and [security boundaries](../SECURITY.md).

Public store publication, legal/operator approvals and independent audit evidence are distinct from completed implemented-function device acceptance. An EAS store artifact is not a claim of public store approval. No independent mobile or smart-contract audit is claimed by this record.

## Historical grant candidate

The original September submission used a standalone locally signed Android candidate, `com.opago.wallet.mainnetcandidate`, with Hedera Mainnet, Lightning regtest and a `1 HBAR` payment cap. Project-controlled consumer and merchant accounts performed the documented real-HBAR payments. These facts belong to the [dated canary acceptance](HEDERA_MAINNET_CANARY_ACCEPTANCE.md) and immutable [submission history](THRIVE_MILESTONE2_MAINNET.md); they do not describe the current release APK.

## Responsibilities

Repository delivery covers Mainnet clients, key/session safeguards, exact-amount checks, tests, build configuration, deployed-contract pinning and public evidence. OPAGO manages user distribution, signing credentials, service operations, publication decisions, support, legal approvals and Guardian follow-up.

No Mainnet private key, keystore, password or recovery phrase may be committed, sent through chat, or embedded in an app build.
