# Thrive Milestone 2 - Hedera Mainnet evidence package

**Due:** 10 October 2026

**Status:** Mainnet contract deployed and source-verified; Android canary, video, and submission pending

**Scope:** the Hedera Mainnet wallet and checkout path in the public multi-chain Opago hackathon repository

This document remains intentionally incomplete until the Android canary and video evidence exist. Never replace a missing value with a Testnet link, an intended transaction, or a manually invented identifier.

## Submission fields

### Written summary - final draft after successful canary

> Opago deployed its non-custodial HBAR checkout contract on Hedera Mainnet and integrated the verified deployment into the Android consumer wallet. The app protects the user's Hedera key locally, discovers the account through the official Mirror Node, loads balance and history, creates receive requests, and signs direct HBAR or contract checkout payments only after review and device authentication. Checkout requests bind chain ID, contract, merchant, exact tinybar amount, nonce, and expiry. Failed, expired, duplicate, replayed, or unknown transactions never appear as successful. The runtime is pinned by SHA-256 and matched against Mainnet Mirror Node bytecode and Sourcify. The demo records a real-HBAR payment, consensus result, history, and public HashScan evidence. Other multi-chain hackathon features are outside this milestone.

Use this draft only after every claim is backed by the evidence below. It is below the form's 1,000-character limit.

### Mainnet contract address

[OpagoHbarCheckout `0.0.10850063` on Hedera Mainnet HashScan](https://hashscan.io/mainnet/contract/0.0.10850063)

### GitHub repository

https://github.com/Opago-Pay/opago-wallet

Submit the exact public commit used for the signed Android build and video, not merely the moving `main` branch.

### Demo video

Pending recording. Required sequence:

1. Show the exact app version/commit and visible `Hedera Mainnet` / `REAL HBAR` state.
2. Show the consumer wallet's real balance without exposing recovery material.
3. Open the separate merchant page and show its merchant, amount, expiry, verified contract, and Mainnet QR.
4. Scan in the Android wallet and show the complete final review before signing.
5. Authenticate, submit, and wait for a consensus-confirmed success result.
6. Open the exact Mainnet transaction and contract on HashScan.
7. Refresh wallet history and show the same confirmed transaction.
8. Briefly show that an expired or altered request is rejected, if this fits within five minutes.

Video URL: pending.

### Initial user feedback

Optional and pending. Record only consented, non-sensitive pilot feedback. Include date, build/commit, device class, completed task, result, and a short paraphrased comment. Do not include private keys, recovery phrases, personal wallet balances, or unnecessary personal data.

### Additional context

> This public repository intentionally remains the multi-chain Opago hackathon project. Thrive Milestone 2 covers the Hedera Mainnet consumer-wallet and contract-checkout path; it does not claim production readiness for the repository's experimental Solana, USDC, Lightning, swap, eID, or Travel Rule demonstrations. The merchant QR page used in the video is a separate reference service and is not bundled into the consumer wallet. Opago does not sponsor customer account activation or custody user funds.

## Evidence checklist

- [ ] `npm run phase5:verify` passes on a clean checkout of the submission commit.
- [ ] An independent contract/security review is complete and blocking findings are resolved.
- [x] The deployment account had at least the documented 30 HBAR safety reserve.
- [x] `npm run contract:preflight:mainnet` passed immediately before deployment.
- [x] Opago explicitly approved the exact runtime hash and real-HBAR deployment.
- [x] `npm run contract:deploy:mainnet` reached Mainnet consensus successfully.
- [x] `npm run contract:verify:mainnet` confirmed Mirror Node bytecode and Sourcify status.
- [x] `deployments/hedera-mainnet.json` contains only script-derived public evidence.
- [ ] The Mainnet Android build is pinned to that contract ID and runtime hash.
- [ ] The signed release starts without Metro, ADB, or development tooling.
- [ ] One small real-HBAR checkout succeeds from a separate consumer wallet to the merchant.
- [ ] One expired or invalid request remains failed and never appears successful.
- [ ] App history, Mirror Node, and HashScan agree on the transaction and amount.
- [ ] The video is 1-5 minutes and shows all required evidence without secrets.
- [ ] The repository URL resolves publicly and the submitted commit hash is recorded.
- [ ] The final written summary contains no claim that exceeds the recorded evidence.

## Immutable submission record

Fill this table only from verified build and deployment output:

| Evidence | Value |
| --- | --- |
| Deployment source commit | `bd68e8f68498dd825c51bdbf2bb43a38c600c513` |
| Final submission commit | pending |
| Android version/build | pending |
| Contract ID | `0.0.10850063` |
| Contract EVM address | `0x0000000000000000000000000000000000a58f0f` |
| Deployment transaction | `0.0.10848889@1788856737.537500943` |
| Runtime SHA-256 | `18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8` |
| Sourcify status | `verified` (`d7f91325-8b0d-4fa5-9e8d-95a8a06402da`) |
| Canary payment transaction | pending |
| Merchant account | pending |
| Consumer account | pending |
| Video URL | pending |
| Submission timestamp | pending |

Deployment procedure and secret-handling rules are defined in [HEDERA_MAINNET_DEPLOYMENT_RUNBOOK.md](HEDERA_MAINNET_DEPLOYMENT_RUNBOOK.md).
