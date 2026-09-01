# Hedera Mainnet scope and ownership

**Milestone 0 status:** the technical scope package is complete. Human approvals and external confirmations listed below remain open. This document does not claim that Mainnet is enabled or that the product is ready for real funds.

## Product classification

Opago Wallet is currently scoped as a non-custodial payment wallet and merchant checkout application. It is not designed as an AI product, an RWA tokenization platform, or a DeFi liquidity protocol. This classification must be confirmed in writing with the milestone reviewer before implementation expands into unrelated HTS, HCS, or liquidity features.

## Required Hedera capabilities

| Capability | Hedera surface | Required for Mainnet pilot | Current state |
| --- | --- | --- | --- |
| HBAR send and receive | Cryptocurrency Service / `CryptoTransfer` | Yes | Implemented on testnet |
| Contract-bound checkout | Hedera Smart Contract Service | Yes | Implemented and verified on testnet |
| Account, balance, history, receipt, and runtime lookup | Mirror Node REST API | Yes | Implemented on testnet; network binding added in Milestone 1 |
| Public transaction and contract evidence | HashScan and Sourcify | Yes | Implemented on testnet |
| Hedera Token Service | HTS | No current product requirement | Out of scope unless Thrive explicitly requires it |
| Hedera Consensus Service | HCS | No current product requirement | Out of scope unless a product requirement is approved |
| DeFi liquidity | External liquidity protocol | No current product requirement | Out of scope unless Opago is formally classified as DeFi |

## Controlled Mainnet pilot scope

The initial production target is a controlled Android beta with a small, human-approved HBAR cap and a limited pilot cohort. The pilot includes:

- a signed Android release that runs without Metro, ADB, or a development client;
- an audited and source-verified Mainnet checkout contract;
- a public HTTPS merchant checkout service;
- Mainnet HBAR balance, receive, direct send, checkout, history, and recovery;
- strict build-time network and contract binding;
- operational monitoring, incident ownership, and support contact;
- three to five pilot users and documented feedback;
- reproducible submission evidence tied to one commit and one signed build.

The pilot excludes token issuance, liquidity, custody, fiat conversion, automated treasury management, and unbounded public onboarding unless separately approved.

## Responsibility boundary

### Codex technical delivery

- implement network isolation, Mainnet clients, UI labels, tests, and release checks;
- prepare account-lifecycle, contract, merchant service, Android release, and evidence changes;
- produce threat models, runbooks, acceptance scripts, and submission drafts;
- inspect public deployment evidence and fail closed when it does not match the pinned build.

### Fabian / Opago authority and external delivery

- obtain written grant-scope confirmation;
- approve user count, HBAR limits, onboarding model, and release channel;
- acquire and fund Mainnet accounts while retaining all private keys;
- commission an independent contract and mobile security review;
- provide hosting, domain, app-store identity, legal review, support, and incident ownership;
- authorize real-fund actions, recruit users, collect feedback, record the video, and submit the milestone.

No Mainnet private key may be sent through chat, committed to Git, placed in an `EXPO_PUBLIC_*` variable, or embedded in an app build.

## Human decisions still required

| ID | Decision | Owner | Blocks |
| --- | --- | --- | --- |
| M0-D1 | Written confirmation that Opago is not subject to AI, RWA, or DeFi-liquidity requirements | Fabian / Thrive | Final scope |
| M0-D2 | Confirmation that HSCS, HBAR transfer, and Mirror Node satisfy the required-service scope | Fabian / Thrive | Final scope |
| M0-D3 | Controlled beta versus unrestricted public launch | Fabian | Account and operations design |
| M0-D4 | Pilot user count and per-payment/aggregate HBAR limits | Fabian | Mainnet release configuration |
| M0-D5 | Android distribution channel | Fabian | Release workflow |
| M0-D6 | Account onboarding and initial-funding policy | Fabian | Milestone 2 |
| M0-D7 | Security reviewer, legal reviewer, support owner, and incident owner | Fabian | Go-live |

## Milestone 0 acceptance

Technical acceptance is complete when this scope, the threat model, and the Thrive clarification request are versioned and linked from the README. Full Milestone 0 acceptance additionally requires written resolution of M0-D1 through M0-D7.
