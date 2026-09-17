# Security status

Last reviewed: 2026-09-16

This repository is a public hackathon and grant codebase. It has not received an independent mobile, key-lifecycle, dependency, or smart-contract audit. A capped, standalone Android candidate has completed internal real-HBAR Mainnet acceptance, but that evidence is not a public-production, custody, regulatory, or app-store readiness claim. Do not distribute it as a production wallet or process third-party funds or identities without the dedicated reviews and release controls listed below.

## Dependency audit

The lockfile contains targeted same-major overrides for previously remediated `brace-expansion`, `postcss`, and supported `ws` lines. On 16 September 2026, the Hiero SDK was updated from `2.84.0` to `2.88.0`, Spark was pinned exactly to `0.7.12`, and npm's non-breaking audit fixes were applied where compatible. No forced or major-version `npm audit fix` was applied.

The npm advisory report captured from the resulting 2026-09-16 lockfile is:

| Scope | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production dependency tree | 0 | 8 | 16 | 0 | 24 |
| Complete tree including development tools | 0 | 14 | 17 | 11 | 42 |

These counts are the result of `npm audit` against the current lockfile. `npx expo install --check` reports that all SDK 54 packages are on their supported versions, while npm marks the available audit remediations as dependency transitions outside that supported set. The high-severity production-tree entries currently descend through Expo's CLI/Metro build toolchain, including `image-size`; npm labels them production because `expo` is a direct application dependency even though those tools are not mobile payment code. Moderate entries also include Expo modules and the router's `query-string` chain, so they are not dismissed as harmless. They remain an explicit release-review gate. These counts are not a substitute for source review, native-bundle analysis, runtime hardening, or an independent security audit.

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

Physical Phase 4 acceptance on 12 August 2026 covered offline operation, timeout, force-stop after submission, restart reconciliation, expired and altered checkout data, wrong amounts, and an on-chain replay rejection. The redacted app-process Logcat review found no recovery/private-key labels, complete signed-transaction payloads, or fatal exceptions. Public transaction links and aggregate counts are recorded in [PHASE4_ACCEPTANCE.md](PHASE4_ACCEPTANCE.md); raw device logs are intentionally not retained.

## Wallet recovery and provisioning safeguards

On 2026-08-12, physical Android acceptance provisioned testnet account `0.0.10030291`, displayed its `2 HBAR` balance, deleted the local wallet, restored it from the paper backup, and rediscovered the same account and balance. This is testnet evidence only.

Local wallet deletion is disabled until three randomly selected paper-backup words match the phrase held in device-bound secure storage. The challenge asks for one word at a time, blocks screen capture, never transmits the phrase, and clears deletion authorization when the app backgrounds. Recovery display and entry also block screen capture and clear phrase state on backgrounding.

The testnet provisioning script derives the submitted operator public key and compares it with the configured operator account's Mirror Node key before submitting an account-creation transaction. A mismatch fails locally with no transaction submitted. Operator credentials remain process-local and are removed after the script exits.

## Remaining wallet-key limitations

The recovery phrase is stored with Expo SecureStore using device-only, when-unlocked storage. Biometric access control is requested when the platform reports it is available. Lightning Mainnet payments require a separate review screen and biometric/device authentication immediately before submission. This is a local authorization gate, not a hardware-backed transaction signature: derived signing keys necessarily exist in JavaScript runtime memory while the wallet is open. The same recovery phrase derives the Hedera and Lightning identities. A public app-store release still requires an independent mobile/key-lifecycle review and clean-device recovery acceptance.

Lightning payments use a non-secret local journal before submission. Unknown SDK outcomes remain pending across process death and are reconciled through the opaque Spark request ID or paginated outgoing history. Confirmation requires a returned preimage whose SHA-256 equals the invoice payment hash. Privacy-sensitive incoming invoice state uses device-protected SecureStore and persists only until completion, expiry, replacement, or wallet deletion. Local service health stores aggregate timestamps, failure counts, and broad categories only.

## Reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw transaction dumps. Send an initial, redacted report to `info[at]opago.com`; Opago can establish a private follow-up channel if sensitive technical detail is required. Never email wallet recovery material or private keys.
