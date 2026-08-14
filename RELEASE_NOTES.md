# Hedera testnet milestone release notes

Release-candidate date: 2026-08-13

## Scope

This milestone adds a complete Hedera testnet asset and merchant-checkout path to the existing Expo 54 Android wallet. It is testnet-only and does not enable Hedera mainnet or claim production readiness.

## Included

- Expo-compatible Hiero SDK `2.84.0`, deterministic Hedera Ed25519 recovery derivation, Mirror Node account discovery, and local-only testnet provisioning.
- Exact `bigint` tinybar balance, send, receive, history, status, HashScan, review, and success flows on Android.
- `OpagoHbarCheckout`, a non-custodial testnet contract that binds each single-use payment to chain, contract, nonce, merchant, exact amount, and expiry.
- A merchant QR demo, pinned deployed runtime verification, on-device contract signing, and public HashScan/Sourcify evidence.
- A persistent non-secret payment journal with fail-closed pending, confirmed, and failed states across offline operation, timeouts, and process restarts.
- Bounded parallel refreshes for optional Lightning and Solana dashboard data, so an unavailable service cannot leave Android pull-to-refresh spinning indefinitely.
- A consistent asset identity and network-badge system across Portfolio, Send, Receive, activity, and checkout selection, with scalable icons and improved small-screen accessibility.
- Recovery and deletion safeguards, exact incoming-payment matching, replay rejection, testnet/mainnet separation, and redacted physical-device security acceptance.
- A reproducible `npm run phase5:verify` quality gate, clean-clone/build instructions, evidence index, and a one-to-five-minute demo script.

## Public deployment

| Item | Value |
| --- | --- |
| Network | Hedera testnet, chain ID `296` |
| Contract ID | [`0.0.9972670`](https://hashscan.io/testnet/contract/0.0.9972670) |
| EVM address | `0x0000000000000000000000000000000000982bbe` |
| Runtime SHA-256 | `18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8` |
| Source verification | [Sourcify exact runtime match](https://sourcify.dev/server/v2/contract/296/0x0000000000000000000000000000000000982bbe) |

The full deployment metadata and verification timestamps are versioned in [`deployments/hedera-testnet.json`](deployments/hedera-testnet.json).

## Verification baseline

On Windows, `npm run phase5:android` performs the clean dependency install, repository quality gates, fresh arm64 Android build, installation, launch, and local non-secret evidence capture for the exact checked-out commit.

- TypeScript: pass.
- ESLint: pass.
- Application tests: 67/67 pass.
- Contract tests: 9/9 pass.
- Locked runtime bytecode: matches Hedera testnet Mirror Node.
- Sourcify: verified.
- Physical Android direct transfer, exact receive, checkout, pending/restart reconciliation, recovery, tamper rejection, and replay rejection: accepted and documented.

Run the complete deterministic local gate with:

```powershell
npm ci
npm run phase5:verify
```

## Compatibility and operator notes

- Node.js `20.19` or newer and the committed `package-lock.json` are required.
- Generated `android/` and `ios/` projects are intentionally excluded; use `npm run android` for a fresh Android development build.
- Existing wallets keep their deterministic recovery phrase and asset derivations. Never migrate or copy private material into an environment variable.
- A Hedera operator/faucet key is needed only by the trusted local provisioning or deployment scripts. It must never enter the app bundle or any `EXPO_PUBLIC_*` variable.
- The merchant demo, eID, OCP, and Travel Rule services remain local reference implementations.

## Known limits

The wallet, native integration, dependencies, and Solidity contract have not received an independent security audit. The dependency tree contains unresolved transitive advisories. iOS is not accepted in this milestone. Mainnet remains out of scope, and all testnet assets have no monetary value. See [`SECURITY.md`](SECURITY.md) for the current risk statement and [`PHASE5_MILESTONE.md`](PHASE5_MILESTONE.md) for the exact submission checklist.
