# Security status

Last reviewed: 2026-08-08

This repository is a proof of concept and has not received an independent security or smart-contract audit. Do not use it for production custody, identity processing, or mainnet payments without dedicated reviews.

## Dependency audit

The lockfile contains targeted same-major overrides for previously remediated `brace-expansion`, `postcss`, and supported `ws` lines. No forced or breaking `npm audit fix` was applied.

The current npm advisory report is:

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

`OpagoHbarCheckout` is designed without an owner, upgrade mechanism, fee, withdrawal path, fallback, or receive function. It domain-binds chain, contract, random request nonce, merchant, exact tinybar amount, and expiry into a single-use payment ID, and reverts if forwarding fails. These properties are covered by local Hardhat tests but are not a substitute for an independent audit or physical-device checkout acceptance.

Contract `0.0.9972670` was deployed to Hedera testnet and its runtime bytecode was matched against the locked artifact through Mirror Node and Sourcify. The versioned manifest contains only public evidence; operator credentials remain local and must never be committed or exposed through `EXPO_PUBLIC_*`.

## Reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw transaction dumps. Share only redacted reproduction data through the project owner's private security channel.
