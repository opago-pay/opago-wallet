# Security status

Last reviewed: 2026-08-12

This repository is a proof of concept and has not received an independent security or smart-contract audit. Do not use it for production custody, identity processing, or mainnet payments without dedicated reviews.

## Dependency audit

The lockfile contains targeted same-major overrides for previously remediated `brace-expansion`, `postcss`, and supported `ws` lines. No forced or breaking `npm audit fix` was applied.

The npm advisory report captured from the 2026-08-08 lockfile is:

| Scope | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production dependency tree | 0 | 60 | 27 | 0 | 87 |
| Complete tree including development tools | 0 | 65 | 29 | 11 | 105 |

These numbers count affected packages and dependency paths, not independent exploitable defects. The production report is dominated by unresolved transitive findings propagated through Expo/React Native, Hiero, Privy, Solana, Atomiq, and Spark. npm currently reports no compatible automatic fix for those paths.

Phase 3 adds Hardhat, Ethers, and the pinned Solidity compiler as development-only dependencies. They are not bundled into the mobile app, but their toolchain has additional advisories through packages including `adm-zip`, `serialize-javascript`, `tmp`, `undici`, and `uuid`. Contract tooling must run only on trusted source and in a restricted development environment.

Before any release:

- reassess every reachable production advisory against the actual native bundle;
- update upstream frameworks and SDKs when compatible patched releases exist;
- audit `OpagoHbarCheckout.sol` independently and repeat its failure-path tests;
- generate an SBOM and archive the exact lockfile, compiler version, bytecode hashes, and deployment evidence;
- do not enable mainnet while unresolved reachable high-severity findings remain.

## Smart-contract boundaries

`OpagoHbarCheckout` is designed without an owner, upgrade mechanism, fee, withdrawal path, fallback, or receive function. It domain-binds chain, contract, random request nonce, merchant, exact tinybar amount, and expiry into a single-use payment ID, and reverts if forwarding fails. These properties are covered by local Hardhat tests but are not a substitute for an independent audit or production security review.

Contract `0.0.9972670` was deployed to Hedera testnet and its runtime bytecode was matched against the locked artifact through Mirror Node and Sourcify. On 2026-08-10, a physical Android device completed a contract checkout from wallet `0.0.9960666` to merchant `0.0.9944908`; Hedera consensus and the contract result were both `SUCCESS`. This proves the documented testnet path only and does not establish mainnet or production readiness.

The versioned deployment manifest contains only public evidence. Operator credentials remain local and must never be committed or exposed through `EXPO_PUBLIC_*`.

## Wallet recovery and provisioning safeguards

On 2026-08-12, physical Android acceptance provisioned testnet account `0.0.10030291`, displayed its `2 HBAR` balance, deleted the local wallet, restored it from the paper backup, and rediscovered the same account and balance. This is testnet evidence only.

Local wallet deletion is disabled until three randomly selected paper-backup words match the phrase held in device-bound secure storage. The challenge asks for one word at a time, blocks screen capture, never transmits the phrase, and clears deletion authorization when the app backgrounds. Recovery display and entry also block screen capture and clear phrase state on backgrounding.

The testnet provisioning script derives the submitted operator public key and compares it with the configured operator account's Mirror Node key before submitting an account-creation transaction. A mismatch fails locally with no transaction submitted. Operator credentials remain process-local and are removed after the script exits.

## Reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw transaction dumps. Share only redacted reproduction data through the project owner's private security channel.
