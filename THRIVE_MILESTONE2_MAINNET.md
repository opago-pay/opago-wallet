# Thrive Milestone 2 - Hedera Mainnet evidence package

**Due:** 10 October 2026

**Status:** submitted through the Thrive portal on 16 September 2026

**Scope:** the Hedera Mainnet wallet and checkout path in the public multi-chain Opago hackathon repository

This record distinguishes public, independently inspectable evidence from information retained only in the Thrive submission. It never substitutes a Testnet link, intended transaction, or manually invented identifier for Mainnet evidence.

## Submission fields

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

> This public repository intentionally remains the multi-chain Opago hackathon project. Thrive Milestone 2 covers the Hedera Mainnet consumer-wallet and contract-checkout path; it does not claim production readiness for the repository's experimental Solana, USDC, Lightning, swap, eID, or Travel Rule demonstrations. The merchant QR page used in the video is a separate reference service and is not bundled into the consumer wallet. Opago does not sponsor customer account activation or custody user funds.

## Evidence checklist

- [x] `npm run phase5:verify` passes for the submitted source: TypeScript, ESLint, `113/113` application tests, and `9/9` contract tests.
- [ ] An independent contract/security review is complete and blocking findings are resolved.
- [x] The deployment account had at least the documented 30 HBAR safety reserve.
- [x] `npm run contract:preflight:mainnet` passed immediately before deployment.
- [x] Opago explicitly approved the exact runtime hash and real-HBAR deployment.
- [x] `npm run contract:deploy:mainnet` reached Mainnet consensus successfully.
- [x] `npm run contract:verify:mainnet` confirmed Mirror Node bytecode and Sourcify status.
- [x] `deployments/hedera-mainnet.json` contains only script-derived public evidence.
- [x] The Mainnet Android build is pinned to that contract ID and runtime hash.
- [x] The standalone internal candidate starts without Metro or a development server.
- [ ] A final store-signed release has completed Play distribution checks.
- [x] One small real-HBAR checkout succeeds from a separate consumer wallet to the merchant.
- [ ] One expired or invalid request remains failed and never appears successful.
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
