# Hedera Mainnet scope and ownership

**Last updated:** 16 September 2026

**Milestone status:** the Hedera Mainnet grant candidate was submitted to Thrive. This scope records what was actually delivered and separates it from a future public consumer-wallet launch.

## Product classification

Opago Wallet is a non-custodial **consumer wallet** for people who want to pay with crypto. It is not the Opago merchant POS, does not receive or settle customer payments on behalf of merchants, and does not bundle the separate merchant software, APIs, or webshop plugins.

The repository is not an AI product, RWA tokenization platform, or DeFi liquidity protocol. The Hedera milestone therefore uses native HBAR, Hedera Smart Contract Service, consensus receipts, Mirror Node data, and public explorer evidence. It does not add HTS, HCS, or liquidity solely to inflate the integration claim.

## Delivered Hedera capabilities

| Capability | Hedera surface | Mainnet evidence |
| --- | --- | --- |
| HBAR balance, receive, direct send, and history | Cryptocurrency Service plus Mirror Node REST API | Accepted on the physical Android candidate |
| Contract-bound checkout | Hedera Smart Contract Service | Contract [`0.0.10850063`](https://hashscan.io/mainnet/contract/0.0.10850063) is deployed and source-verified |
| Account discovery and transaction reconciliation | Official Mainnet Mirror Node | Implemented with network binding and fail-closed pending states |
| Public deployment and payment evidence | HashScan and Sourcify | Versioned manifest and submitted-video transaction are public |
| Hedera Token Service | HTS | No current consumer-wallet requirement; not claimed |
| Hedera Consensus Service | HCS | No current consumer-wallet requirement; not claimed |

## Current grant candidate

The grant candidate is a standalone internal Android build with a `1 HBAR` per-payment cap. It enables real funds only for Hedera Mainnet, while Solana remains on devnet, Lightning remains on regtest, and swaps remain disabled. One Opago-controlled consumer account completed direct and contract payments to a separate Opago-controlled merchant/deployment account.

The candidate is locally signed, not published through an app store, not independently audited, and not offered as unrestricted public production software. The merchant QR page is a local reference service. It binds payment data to the contract but does not authenticate an official Opago merchant identity.

## Future production consumer wallet

The intended later product is a separate production-focused fork with HBAR and Lightning. The current direction is:

- non-custodial: users control and fund their own wallet; Opago does not advance activation funds;
- no separate Opago payment fee in the initial MVP; users pay the relevant network fee;
- distribution through Google Play and the Apple App Store;
- initial availability limited to countries covered by the MiCAR launch decision and legal review;
- a separate merchant system and public APIs/plugins outside the consumer app;
- signed or registry-backed verified-merchant requests as a later feature, not a claim of the current MVP.

This future release requires store signing, public infrastructure, independent security review, legal/privacy approval, monitoring, support, incident ownership, and external-user recovery testing.

## Responsibility boundary

### Repository-level technical delivery

- network isolation, Mainnet clients, UI labels, exact-amount handling, tests, and release checks;
- account lifecycle, contract, local merchant reference, Android candidate, and evidence scripts;
- threat models, runbooks, acceptance records, and public submission evidence;
- fail-closed validation when public deployment evidence does not match the pinned build.

### Fabian / Opago external authority

- product, legal, financial, geographic, app-store, and real-user decisions;
- Mainnet accounts, balances, keys, and every real-fund authorization;
- independent auditors, production hosting/domain, support, monitoring, and incident ownership;
- user consent, external feedback, video hosting, milestone submission, and Guardian follow-up.

No Mainnet private key may be sent through chat, committed to Git, placed in an `EXPO_PUBLIC_*` variable, or embedded in an app build.

## Decision record

| Decision | Recorded outcome |
| --- | --- |
| Product type | Non-custodial consumer payment wallet; not AI, RWA, DeFi liquidity, or merchant POS |
| Account funding | User-funded Ed25519 alias activation; no Opago-sponsored customer balance |
| Candidate payment cap | `1 HBAR` per app-initiated Mainnet payment |
| Candidate users | Internal grant acceptance only; no external public pilot claimed |
| App fee | No separate Opago fee in the initial MVP |
| Production networks | Future fork targets HBAR and Lightning; experimental chains stay in this hackathon repository |
| Distribution | Future Google Play and Apple App Store release |
| Geography | Future initial launch limited to MiCAR countries, subject to legal approval |
| Merchant verification | Desirable later feature; not claimed by the current local QR demo |
| Independent audit | Not completed; remains a production-release blocker |
