# Phase 4 acceptance evidence

Phase 4 was completed on 12 August 2026 against Hedera testnet. This document contains only public account, contract, transaction, and aggregate diagnostic evidence. Recovery phrases, private keys, signed transaction bytes, and raw Logcat output are deliberately excluded.

## Scope

| Field | Value |
| --- | --- |
| Android device | Physical `PG3NBG7YA`, Android 14 |
| Package | `com.opago.wallet` development client |
| Wallet | `0.0.10030291` |
| Merchant | `0.0.9944908` |
| Checkout contract | `0.0.9972670` |
| Network | Hedera testnet only |
| Test amount | `1` tinybar per new Phase 4 transaction |

## Physical-device matrix

| Case | Physical action | Result |
| --- | --- | --- |
| Offline send | Disabled Wi-Fi and mobile data before signing a direct transfer | SDK stopped after three attempts; UI showed `HBAR payment not confirmed`; no success was stored |
| Timeout | Kept the device offline through the bounded SDK request window | Request ended with gRPC `UNAVAILABLE`; UI explicitly stated `No success was recorded` |
| Restart after submit | Force-stopped the app 3.75 seconds after tapping Sign, immediately after the journal write was detected | Journal contained only `pending`; after restart, Mirror Node `SUCCESS` promoted the same record to `confirmed` |
| Expired checkout | Opened a correctly bound request whose expiry was already past | Rejected before submission: `Hedera checkout request is expired or too close to expiry` |
| Altered checkout | Replaced the request nonce without recomputing the payment ID | Rejected before submission: `Checkout payment ID does not match the bound request fields` |
| Wrong amount | Changed the URI amount without recomputing the payment ID | Rejected before submission with the same field-binding error |
| Valid checkout | Submitted a fresh one-tinybar request from the Android wallet | Hedera consensus `SUCCESS`; app displayed the transaction and payment IDs |
| Replay | Submitted the identical successful checkout request a second time | Contract status `CONTRACT_REVERT_EXECUTED`; journal stored `failed`; UI never displayed success |

## Public transaction evidence

| Purpose | Journal result | HashScan |
| --- | --- | --- |
| Restart-during-payment direct transfer | `SUCCESS` | [0.0.10030291@1786527531.288214115](https://hashscan.io/testnet/transaction/0.0.10030291%401786527531.288214115) |
| Valid Phase 4 checkout | `SUCCESS` | [0.0.10030291@1786528624.880688643](https://hashscan.io/testnet/transaction/0.0.10030291%401786528624.880688643) |
| Replayed checkout | `CONTRACT_REVERT_EXECUTED` | [0.0.10030291@1786528712.770556312](https://hashscan.io/testnet/transaction/0.0.10030291%401786528712.770556312) |

The successful and replayed checkout records have the same public payment ID, proving that the second submission exercised the contract's single-use guard rather than a different request.

## Fail-closed payment lifecycle

The mobile client writes a submitted Hedera transaction to a bounded AsyncStorage journal as `pending`, with its amount encoded as an exact decimal tinybar string. It promotes the record to `confirmed` only after an SDK receipt or later Mirror Node lookup returns `SUCCESS`. Known non-success receipts become `failed`; timeouts, process termination, Mirror Node unavailability, and unknown transactions remain `pending`.

The dashboard merges journal records with Mirror Node history by normalized transaction ID. A pending or failed record is therefore never rendered as successful merely because a request was initiated. HBAR calculations continue to use `bigint`; the journal does not convert tinybars to JavaScript floating point.

## Redacted Logcat and source review

The final app-process Logcat snapshot contained 1,505 lines. The review recorded aggregate counts only:

| Pattern | Matches |
| --- | ---: |
| Recovery/mnemonic/seed/private/operator-key labels | 0 |
| Hex payloads of 256 or more characters | 0 |
| Signed-transaction or transaction-bytes labels | 0 |
| Fatal exceptions | 0 |

The mobile application source under `app/`, `components/`, `hooks/`, and `lib/` contains zero `console.log`, `console.warn`, or `console.error` calls. Raw Logcat was not committed because retaining unrelated device telemetry would weaken the redaction boundary. Non-secret Spark SDK rate-limit warnings occurred in the development overlay during the forced offline test; they did not crash the app or change Hedera payment state.

## Reproduction

Generate fresh, non-secret checkout fixtures:

```powershell
$env:HEDERA_MERCHANT_ID='0.0.YOUR_TESTNET_MERCHANT'
npm run phase4:checkout-fixtures
Remove-Item Env:HEDERA_MERCHANT_ID
```

The command emits a valid/replay URI plus expired, altered-nonce, and wrong-amount variants. It reads the public merchant alias from the official testnet Mirror Node and uses the versioned deployment manifest. It does not accept or output an operator key.

Run the automated gates:

```powershell
npm run typecheck
npm run lint
npm test
npm run contract:compile
npm run contract:test
node --check server/eid-backend.js
```
