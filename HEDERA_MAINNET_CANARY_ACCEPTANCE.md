# Hedera Mainnet Android canary acceptance

**Accepted:** 15 September 2026

**Scope:** internal standalone Android candidate for the Hedera Mainnet grant path. This acceptance is public transaction evidence, not a security audit or a Play Store production release.

## Locked candidate

| Item | Value |
| --- | --- |
| Source commit | `d2501899cf30850a8f15c30771be49907f4a7605` |
| App version | `1.0.0` |
| Package ID | `com.opago.wallet.mainnetcandidate` |
| APK SHA-256 | `491b62a9afe80f0539846c6a16be424c4dc7528a3b8bf64be5067afc487f190b` |
| Device | UMIDIGI `PG3NBG7YA`, Android 14, `arm64-v8a` |
| Hedera network | Mainnet, chain ID `295` |
| Maximum payment amount | `1 HBAR` |
| Direct-transfer fee ceiling | `0.1 HBAR` |
| Checkout fee ceiling | `0.75 HBAR` |
| Checkout contract | [`0.0.10850063`](https://hashscan.io/mainnet/contract/0.0.10850063) |
| Runtime SHA-256 | `18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8` |

The candidate enables real funds only for Hedera. Solana remains on devnet, Lightning remains on regtest, and swaps remain disabled. The APK uses a local debug certificate and is not the final store artifact.

## Accounts and public transactions

| Role | Account |
| --- | --- |
| Consumer wallet derived and controlled on the Android device | [`0.0.10861984`](https://hashscan.io/mainnet/account/0.0.10861984) |
| Separate merchant/deployment wallet | [`0.0.10848889`](https://hashscan.io/mainnet/account/0.0.10848889) |

The wallet was activated with `1 HBAR`. It then completed these two real-fund checks:

| Scenario | Public evidence | Result |
| --- | --- | --- |
| Direct HBAR transfer | [`0.0.10861984@1789477423.490632405`](https://hashscan.io/mainnet/transaction/0.0.10861984%401789477423.490632405) | `SUCCESS`; exactly `0.01 HBAR` delivered; `0.00129868 HBAR` charged fee |
| Contract checkout | [`0.0.10861984@1789478514.756946872`](https://hashscan.io/mainnet/transaction/0.0.10861984%401789478514.756946872) | `SUCCESS`; contract `0.0.10850063`; exactly `0.01 HBAR` forwarded; `0.21460450 HBAR` charged fee |

For the checkout, the separate merchant page generated a fresh five-minute request for payment ID `0xd1e97e68ab439e1c9277a2b271061983bd81974916a597ef792a6c4b9a14c8806`. The Android review displayed Mainnet, the exact amount, consumer, merchant, verified contract, and maximum fee before authentication. The app displayed its green confirmed-success state only after the network result was reconciled. The transaction and contract opened in Mainnet HashScan, and the same transaction appeared in wallet history after refresh.

An independent public Mirror Node lookup returned `CONTRACTCALL`, transaction result `SUCCESS`, contract `0.0.10850063`, amount `1,000,000` tinybars, and `195,095` gas used. Its transfer list showed exactly `1,000,000` tinybars delivered to `0.0.10848889`.

## Finding and correction during acceptance

The first direct transfer reached consensus successfully while the SDK returned an ambiguous `UNKNOWN` response after bounded receipt attempts. The app did not falsely report success, and the user did not retry. The payment flow was then hardened to persist the transaction ID before submission, reconcile ambiguous outcomes through the official Mirror Node, retain unresolved submissions as durable pending records, and prevent immediate duplicate retries. The corrected candidate was rebuilt, installed, and used for the successful contract checkout above. Automated application tests pass `110/110` and include explicit success, failure, and still-pending reconciliation cases.

## Acceptance result

- [x] Standalone Android candidate is pinned to Hedera Mainnet and the verified runtime.
- [x] Mainnet account discovery, balance, direct send, and history operate on the physical device.
- [x] A fresh contract-bound merchant QR was reviewed and signed on-device.
- [x] The checkout reached consensus with `SUCCESS` and forwarded the exact bigint tinybar amount.
- [x] App history, Mirror Node, and HashScan agree on account, contract, amount, and result.
- [x] An ambiguous SDK response cannot become a false success or invite an immediate duplicate retry.
- [ ] Independent security review is complete.
- [ ] Mainnet invalid/expired/replay cases have been physically exercised with real funds.
- [ ] Final store-signed build starts without development tooling and has completed store distribution checks.
- [ ] The one-to-five-minute submission video is recorded and publicly hosted.

Only the checked items are established by this record.
