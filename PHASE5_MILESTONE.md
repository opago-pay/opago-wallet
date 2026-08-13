# Phase 5 milestone package

Last reviewed: 2026-08-12

This document is the reproducible evidence index for the Opago Wallet Hedera testnet milestone. It describes a testnet proof of concept only. It is not a mainnet release, security audit, custody product, or regulatory-compliance claim.

## Submission identity

| Item | Locked value |
| --- | --- |
| Repository | `https://github.com/Opago-Pay/opago-wallet` |
| Release branch | `main` |
| Package version | `1.0.0` |
| Hedera network | `testnet` only |
| Hedera chain ID | `296` |
| Checkout contract | `0.0.9972670` |
| Contract EVM address | `0x0000000000000000000000000000000000982bbe` |
| Solidity compiler | `0.8.28+commit.7893614a.Emscripten.clang` |
| Runtime bytecode SHA-256 | `18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8` |
| Dependency lock | committed `package-lock.json`; install with `npm ci` |
| Deployment manifest | [`deployments/hedera-testnet.json`](deployments/hedera-testnet.json) |

The submitted commit is the commit checked out for the build. Record it before capture with `git rev-parse HEAD`, require a clean `git status --short`, and use the same commit for the APK, tests, and video.

## Evidence index

| Evidence | Public or reproducible record |
| --- | --- |
| Contract | [HashScan contract `0.0.9972670`](https://hashscan.io/testnet/contract/0.0.9972670) |
| Deployment transaction | [HashScan transaction](https://hashscan.io/testnet/transaction/0.0.9959245%401786181037.989721534) |
| Verified source/runtime | [Sourcify chain `296` record](https://sourcify.dev/server/v2/contract/296/0x0000000000000000000000000000000000982bbe) |
| Initial physical checkout | [Successful contract call](https://hashscan.io/testnet/transaction/0.0.9960666%401786350735.994979380) |
| Exact HBAR receive | [Successful MetaMask transfer](https://hashscan.io/testnet/transaction/0.0.7314364%401786354442.132871379) |
| Restart reconciliation | [Successful transfer](https://hashscan.io/testnet/transaction/0.0.10030291%401786527531.288214115) |
| Phase 4 checkout | [Successful contract call](https://hashscan.io/testnet/transaction/0.0.10030291%401786528624.880688643) |
| Replay rejection | [Reverted duplicate call](https://hashscan.io/testnet/transaction/0.0.10030291%401786528712.770556312) |
| Physical-device matrix | [`PHASE4_ACCEPTANCE.md`](PHASE4_ACCEPTANCE.md) |
| Security boundaries and known limits | [`SECURITY.md`](SECURITY.md) |
| Milestone release notes | [`RELEASE_NOTES.md`](RELEASE_NOTES.md) |
| Video sequence | [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) |

The versioned deployment manifest is the machine-readable source of truth for network, IDs, timestamps, compiler, bytecode hashes, transaction URL, and source-verification status. It contains no operator credential.

## Hedera architecture

1. A BIP39 recovery phrase is created or restored inside the native wallet and kept in device-bound secure storage.
2. The app deterministically derives a dedicated Hedera Ed25519 key at `m/44'/3030'/0'/0'`. Private material is retained only in runtime memory while needed.
3. A trusted local provisioning script uses a disposable testnet operator to create or find the public-key account. The operator ID and key are never compiled into the app.
4. The app discovers account ID, balance, history, transaction state, merchant aliases, and deployed bytecode through bounded Hedera testnet Mirror Node requests.
5. Direct transfers and checkout contract calls are built and signed on the Android device with `@hiero-ledger/sdk` `2.84.0`.
6. HBAR amounts remain `bigint` tinybars from parsing through review, signing, storage, and display.
7. The app persists a non-secret transaction journal. Only explicit Hedera `SUCCESS` promotes a payment to `confirmed`; failed results remain failed, and unknown or unavailable results remain pending.
8. Checkout requests bind chain, contract, nonce, merchant, exact amount, and expiry into a single-use payment ID. The wallet verifies the pinned runtime hash before signing, and the contract atomically forwards the exact value or reverts.

Trust boundaries are deliberate: recovery material and signing stay on-device; public read data comes from Mirror Node; account creation credentials stay in a local script; the merchant demo creates payment requests but cannot sign for the wallet; HashScan and Sourcify provide independently inspectable public evidence.

## Clean-clone verification

Use a new directory on a trusted development machine. Do not copy `node_modules`, generated `android/`, build output, or Hardhat artifacts from another checkout.

```powershell
git clone https://github.com/Opago-Pay/opago-wallet.git opago-wallet-milestone
Set-Location opago-wallet-milestone
git checkout main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
Copy-Item .env.example .env
npm ci
npm run phase5:verify
```

`git status --short` must be empty before configuration and after verification. `npm ci` must use the committed lockfile without updating it. The expected baseline is 59 passing application tests, 9 passing contract tests, successful TypeScript and ESLint checks, and successful syntax checks for the local reference services and Hedera scripts.

Public client configuration belongs in the untracked `.env`. The committed `.env.example` pins Hedera testnet and the verified checkout deployment. Add valid Privy public client identifiers locally if the authentication flow is exercised. Never put a recovery phrase, private key, operator/faucet key, callback secret, or bearer credential in `.env`, `EXPO_PUBLIC_*`, source files, screenshots, terminal history, or the video.

## Fresh Android build, installation, and launch

Requirements are Node.js `20.19` or newer, Android Studio/JDK, an Android SDK, and a physical device with USB debugging. The repository intentionally excludes generated native directories, so the first command below creates Android native code from the reviewed Expo config.

```powershell
npm run phase5:android
```

The Windows acceptance command refuses a dirty worktree or unsafe build environment, runs `npm ci` and every quality gate, requires exactly one authorized arm64 Android device, regenerates the native project, builds and installs `com.opago.wallet`, starts Metro, launches the app, and writes commit, lockfile, and APK hashes to ignored `.codex-local-evidence/phase5-android-evidence.json`. State `unauthorized` requires accepting the USB-debugging fingerprint on the phone. Confirm that the dashboard opens, shows `HEDERA TESTNET`, displays the expected numeric account ID and balance, and can open Send and Receive without a render error. Metro is deliberately left running for the manual checks and video capture.

For an exact clean rebuild after changing native configuration, remove only the generated native output in the disposable clean clone and rerun `npm run android`; never delete a broad workspace directory. The native project and APK are derived artifacts and are not committed.

## Testnet acceptance sequence

1. Open the dashboard and verify the visible `HEDERA TESTNET` label, account ID, and HBAR balance.
2. Open Receive and generate a QR for an exact test amount. Verify that only a new successful incoming Mirror Node transaction with the exact tinybar amount confirms it.
3. Start the local merchant demo with `HEDERA_MERCHANT_ID` set to the dedicated testnet merchant, scan its QR, and inspect network, merchant, exact HBAR amount, expiry, contract ID, and fee warning on the review screen.
4. Confirm on Android, wait for explicit consensus `SUCCESS`, and open the transaction in HashScan from the success screen.
5. Reuse the same request and confirm that the replay is rejected and never stored or displayed as successful.
6. Force-stop during a submitted transaction, restart, and verify that the journal remains pending until Mirror Node reports a terminal result.
7. Restore a disposable testnet wallet from its protected paper backup and verify deterministic account rediscovery. Never record or publish the phrase.

The completed physical-device results and public transaction links for these failure and recovery paths are in [`PHASE4_ACCEPTANCE.md`](PHASE4_ACCEPTANCE.md).

## Submission checklist

- [ ] `git status --short` is empty and `git rev-parse HEAD` is recorded.
- [ ] `npm ci` succeeds in a clean clone without changing `package-lock.json`.
- [ ] `npm run phase5:verify` passes in that clean clone.
- [ ] A fresh Android native project builds, installs, launches, and reaches the Hedera dashboard on the intended physical device.
- [ ] The video follows [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md), lasts one to five minutes, and exposes no secret or personal data.
- [ ] The video shows the visible testnet label, balance, merchant QR, review screen, device confirmation, success transaction ID, and public HashScan record.
- [ ] Contract, deployment transaction, source-verification record, deployment manifest, lockfile, security status, and Phase 4 acceptance evidence are included with the exact submitted commit.
- [ ] No mainnet claim is made. Hedera remains technically restricted to testnet.

## Known limits

The wallet and checkout contract have not received an independent audit. The dependency tree contains unresolved transitive advisories documented in [`SECURITY.md`](SECURITY.md). iOS is outside this milestone. Local merchant, eID, OCP, and Travel Rule services are reference demos rather than production backends. Phase 5 demonstrates a reproducible Hedera testnet milestone and does not authorize real-fund use.
