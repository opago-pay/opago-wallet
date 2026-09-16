# Security status

Last reviewed: 2026-09-16

This repository is a public hackathon and grant codebase. It has not received an independent mobile, key-lifecycle, dependency, or smart-contract audit. A capped, standalone Android candidate has completed internal real-HBAR Mainnet acceptance, but that evidence is not a public-production, custody, regulatory, or app-store readiness claim. Do not distribute it as a production wallet or process third-party funds or identities without the dedicated reviews and release controls listed below.

## Dependency audit

The lockfile contains targeted same-major overrides for previously remediated `brace-expansion`, `postcss`, and supported `ws` lines. On 16 September 2026, the Hiero SDK was updated from `2.84.0` to `2.88.0` and npm's non-breaking audit fixes were applied. No forced or major-version `npm audit fix` was applied.

The npm advisory report captured from the resulting 2026-09-16 lockfile is:

| Scope | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production dependency tree | 0 | 14 | 25 | 0 | 39 |
| Complete tree including development tools | 0 | 19 | 27 | 11 | 57 |

These numbers count affected packages and dependency paths, not independent exploitable defects. The previous direct Hiero advisory is removed by `2.88.0`. The remaining production report is dominated by unresolved transitive findings propagated through Expo/React Native, Privy, Solana, Atomiq, and Spark. Some npm suggestions would downgrade Expo or force incompatible major versions; those were deliberately rejected rather than presenting a broken dependency tree as a security fix.

`npm ci` succeeds with the pinned lockfile. Hiero SDK `2.88.0` currently emits upstream peer-metadata warnings for the exact `ansi-styles` and `protobufjs` versions requested by its proto package; the application tests and Android bundle pass without overriding those dependencies to older versions.

Phase 3 adds Hardhat, Ethers, and the pinned Solidity compiler as development-only dependencies. They are not bundled into the mobile app, but their toolchain has additional advisories through packages including `adm-zip`, `serialize-javascript`, `tmp`, `undici`, and `uuid`. Contract tooling must run only on trusted source and in a restricted development environment.

Before any release:

- reassess every reachable production advisory against the actual native bundle;
- update upstream frameworks and SDKs when compatible patched releases exist;
- audit `OpagoHbarCheckout.sol` independently and repeat its failure-path tests;
- generate an SBOM and archive the exact lockfile, compiler version, bytecode hashes, and deployment evidence;
- do not approve unrestricted public distribution while reachable high-severity findings or independent-review blockers remain unresolved.

## Smart-contract boundaries

`OpagoHbarCheckout` is designed without an owner, upgrade mechanism, fee, withdrawal path, fallback, or receive function. It domain-binds chain, contract, random request nonce, merchant, exact tinybar amount, and expiry into a single-use payment ID, and reverts if forwarding fails. These properties are covered by local Hardhat tests but are not a substitute for an independent audit or production security review.

Contract `0.0.9972670` was deployed to Hedera testnet and its runtime bytecode was matched against the locked artifact through Mirror Node and Sourcify. On 2026-08-10, a physical Android device completed a contract checkout from wallet `0.0.9960666` to merchant `0.0.9944908`; Hedera consensus and the contract result were both `SUCCESS`.

The same locked runtime was deployed to Hedera Mainnet as contract [`0.0.10850063`](https://hashscan.io/mainnet/contract/0.0.10850063) and source-verified. The internal Android candidate completed real-HBAR checkout transactions, including the [transaction shown in the submitted grant video](https://hashscan.io/mainnet/transaction/0.0.10861984%401789541018.595289764). This establishes deployment and functional integration only. It does not replace an independent audit or establish public-production readiness.

The versioned deployment manifest contains only public evidence. Operator credentials remain local and must never be committed or exposed through `EXPO_PUBLIC_*`.

## Merchant-request boundary

The checkout contract cryptographically binds the network, contract, merchant address, exact amount, nonce, expiry, and payment ID after a request is created. It does **not** prove that the party which created the QR code is an authorized Opago merchant. The local merchant page is therefore a reference demo, not an authenticated production merchant service, and the wallet must not label its requests as a verified merchant identity. A public release requires a separately reviewed merchant-authentication design such as signed requests or a trusted registry, plus HTTPS hosting, operational ownership, and abuse controls.

## Payment-state and diagnostic safeguards

Hedera SDK operations use bounded request/deadline/attempt settings. Once the SDK returns a transaction ID, the app persists a non-secret journal record as `pending` before waiting for the receipt. Only an explicit `SUCCESS` receipt or Mirror Node result promotes it to `confirmed`; known non-success results become `failed`, and unavailable or unknown results remain `pending`. This state survives process death and prevents an unresolved payment from being shown as successful.

Native Solana payments use exact `bigint` lamports or token base units throughout validation, construction, balance checks, history, and display formatting. The app verifies the RPC genesis hash, validates the selected USDC mint and associated token accounts, obtains the current blockhash and fee, simulates the signed transaction, and persists its public signature as `pending` before broadcast. A payment is shown as confirmed only after authoritative Solana RPC confirmation; ambiguous timeout, offline, or restart states remain pending and are reconciled later. Explorer links are restricted to the configured cluster. The journal contains public payment metadata only and never stores a recovery phrase, private key, or serialized signed transaction.

Devnet SOL and USDC have no monetary value and are excluded from the dashboard's fiat total. Development builds enforce configurable per-transfer ceilings. Mainnet enablement remains a separate build-time decision and requires reviewed RPC infrastructure plus independent mobile, dependency, and key-management audits.

Physical Phase 4 acceptance on 12 August 2026 covered offline operation, timeout, force-stop after submission, restart reconciliation, expired and altered checkout data, wrong amounts, and an on-chain replay rejection. The redacted app-process Logcat review found no recovery/private-key labels, complete signed-transaction payloads, or fatal exceptions. Public transaction links and aggregate counts are recorded in [PHASE4_ACCEPTANCE.md](PHASE4_ACCEPTANCE.md); raw device logs are intentionally not retained.

## Wallet recovery and provisioning safeguards

On 2026-08-12, physical Android acceptance provisioned testnet account `0.0.10030291`, displayed its `2 HBAR` balance, deleted the local wallet, restored it from the paper backup, and rediscovered the same account and balance. This is testnet evidence only.

Local wallet deletion is disabled until three randomly selected paper-backup words match the phrase held in device-bound secure storage. The challenge asks for one word at a time, blocks screen capture, never transmits the phrase, and clears deletion authorization when the app backgrounds. Recovery display and entry also block screen capture and clear phrase state on backgrounding.

The testnet provisioning script derives the submitted operator public key and compares it with the configured operator account's Mirror Node key before submitting an account-creation transaction. A mismatch fails locally with no transaction submitted. Operator credentials remain process-local and are removed after the script exits.

## Remaining wallet-key limitations

The recovery phrase is stored with Expo SecureStore using device-only, when-unlocked storage. Biometric access control is requested when the platform reports it is available. Derived signing keys necessarily exist in JavaScript runtime memory while the wallet is open, and the current payment confirmation screen does not constitute a separate hardware-backed transaction signature. The same recovery phrase also derives the experimental Hedera, Solana, and Lightning identities in this hackathon repository. These are explicit reasons why the internal candidate is not a public app-store release and why a production fork requires an independent mobile/key-lifecycle review, transaction-time authentication decision, and clean-device recovery acceptance.

## Reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw transaction dumps. Send an initial, redacted report to `info[at]opago.com`; Opago can establish a private follow-up channel if sensitive technical detail is required. Never email wallet recovery material or private keys.
