# Opago Wallet release notes

Current candidate date: 16 September 2026

## Scope

This public repository remains the multi-chain Opago hackathon project. The current grant candidate adds a guarded Hedera Mainnet wallet and contract-checkout path to the earlier accepted Hedera Testnet integration. It does not claim that the complete repository is an audited public-production wallet.

The standalone Android candidate enables real funds only for Hedera Mainnet. Solana remains on devnet, Lightning remains on regtest, and swaps remain disabled. The candidate uses a local debug certificate and is not a Play Store artifact.

## Included

- Expo-compatible Hiero SDK `2.88.0`, deterministic Hedera Ed25519 recovery derivation, network-separated account discovery, and local-only provisioning or deployment scripts.
- Exact `bigint` tinybar balance, send, receive, history, status, HashScan, review, and success flows on Android.
- `OpagoHbarCheckout`, a non-custodial immutable contract that binds each single-use payment to chain, contract, nonce, merchant, exact amount, and expiry.
- Verified Testnet and Mainnet deployment manifests, pinned runtime-bytecode verification, Sourcify evidence, and contract calls signed on the Android device.
- A persistent non-secret payment journal with fail-closed pending, confirmed, and failed states across offline operation, ambiguous SDK results, timeouts, and process restarts.
- HashPack-compatible plain account-ID receive QR values alongside strict Opago checkout request parsing.
- A consistent consumer-oriented asset, Send, Request, activity, and receipt interface with scalable asset icons and explicit network labels.
- Opago-owned launcher, adaptive, monochrome, splash, and web icons replace the remaining Expo template and obsolete prototype artwork.
- The generated Android application requests camera access only for QR scanning; transitive audio-recording, storage, and overlay permissions are explicitly removed.
- Native SOL and configured SPL USDC development-network flows plus the existing experimental Lightning and swap code, isolated from the real-HBAR candidate.
- A reproducible `npm run phase5:verify` gate covering TypeScript, ESLint, application tests, contract compilation/tests, and service/script syntax checks.

## Public Hedera evidence

| Item | Testnet | Mainnet |
| --- | --- | --- |
| Chain ID | `296` | `295` |
| Contract | [`0.0.9972670`](https://hashscan.io/testnet/contract/0.0.9972670) | [`0.0.10850063`](https://hashscan.io/mainnet/contract/0.0.10850063) |
| EVM address | `0x0000000000000000000000000000000000982bbe` | `0x0000000000000000000000000000000000a58f0f` |
| Runtime SHA-256 | `18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8` | same locked runtime |
| Deployment manifest | [`deployments/hedera-testnet.json`](deployments/hedera-testnet.json) | [`deployments/hedera-mainnet.json`](deployments/hedera-mainnet.json) |
| Physical-device checkout | [Testnet transaction](https://hashscan.io/testnet/transaction/0.0.9960666%401786350735.994979380) | [Submitted-video Mainnet transaction](https://hashscan.io/mainnet/transaction/0.0.10861984%401789541018.595289764) |

The exact Mainnet candidate, transaction, and remaining limitations are recorded in [`HEDERA_MAINNET_CANARY_ACCEPTANCE.md`](HEDERA_MAINNET_CANARY_ACCEPTANCE.md). The Thrive evidence index is [`THRIVE_MILESTONE2_MAINNET.md`](THRIVE_MILESTONE2_MAINNET.md).

## Verification baseline

Run the deterministic local gate with:

```powershell
npm ci
npm run phase5:verify
```

- TypeScript: pass.
- ESLint: pass.
- Application tests: `113/113` pass.
- Contract tests: `9/9` pass.
- Mainnet runtime bytecode: matches the locked artifact and versioned deployment evidence.
- Mainnet source verification: verified.
- Expo dependency and native-module compatibility: all Expo Doctor checks pass.
- Physical Android balance, receive, direct transfer, checkout, pending reconciliation, and HashScan evidence: accepted for the internal candidate.

## Compatibility and operator notes

- Node.js `20.19` or newer and the committed `package-lock.json` are required.
- Generated `android/` and `ios/` projects are intentionally excluded.
- A Hedera operator key is used only by trusted local provisioning or deployment scripts. It must never enter the app bundle, Git, chat, screenshots, or an `EXPO_PUBLIC_*` variable.
- The merchant, eID, OCP, and Travel Rule services are local reference implementations, not hosted production services.
- The Mainnet contract is already deployed. The deployment command must not be run again.

## Known limits

The wallet, native integration, dependencies, and Solidity contract have not received an independent security audit. The dependency tree retains documented transitive advisories. The merchant demo does not authenticate an Opago merchant identity. iOS, store signing/distribution, public hosting, external-user recovery, production monitoring, and broad Mainnet failure-path acceptance remain outside this internal grant candidate. See [`SECURITY.md`](SECURITY.md) for the current risk statement.
