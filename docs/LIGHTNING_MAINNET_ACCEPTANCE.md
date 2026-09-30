# Lightning Mainnet Android acceptance

The one-Bitcoin interface and separate onchain send/receive paths add acceptance cases in [BITCOIN_PAYMENT_ACCEPTANCE.md](BITCOIN_PAYMENT_ACCEPTANCE.md). This Lightning runbook remains applicable. Do not treat the new combined-URI parser as approval to emit a combined receive QR; unique onchain mapping and partner acceptance are still outstanding.

This runbook is the real-funds gate for Bitcoin Lightning. The automated suite and build tooling never initiate a payment. A named Opago approver must authorize each canary amount before a human confirms it on the Android device.

## Preconditions

- Use a clean, reviewed commit on the `production` branch.
- Record the commit and `package-lock.json` SHA-256.
- Keep the paper recovery phrase offline and verify the three-word backup challenge before testing.
- Use a supported Android device with strong biometrics or, on Android 11+, the secure device PIN/password/pattern configured. The owner completes each native prompt.
- Use a separate external Mainnet Lightning wallet with a deliberately small test budget.
- Never put a recovery phrase, private key, invoice, payment preimage, or operator secret in shell history, screenshots, tickets, or committed files.

## Build and installation

Connect exactly one authorized arm64 Android device, then run:

```powershell
npm ci
npm run phase5:verify
npm run android:production-candidate
```

The build must fail unless Lightning and Hedera use explicit matching Mainnet profiles, insecure HTTP is disabled, the reviewed Spark SDK is pinned exactly, and the Hedera deployment evidence matches the verified Mainnet contract.

Record the generated ignored evidence from `.codex-local-evidence/production-candidate/build.json`. The local candidate is not an app-store-signed release.

## Manual scenarios

Use fresh invoices and the smallest practical amounts approved by Opago.

1. **Clean-device recovery:** restore the wallet from the paper phrase, confirm the same Lightning balance and recent transfers, and verify no secret appears in Logcat.
2. **Receive:** create a 10-minute Mainnet invoice, close and reopen the Request screen, pay it from the external wallet, and confirm the exact amount and payment hash appear once.
3. **Send:** scan a fixed-amount Mainnet invoice, confirm amount and maximum fee on the review screen, authenticate on-device, and verify success only after the preimage matches the invoice hash.
4. **Process death:** with an unresolved payment recorded, use Android's Force stop for Opago at the agreed test step, reopen it, unlock and stay on Home. Merely switching tabs/apps is not a process-death test. Bitcoin balance loads first; pending sends then reconcile automatically. Confirm the processing notice disappears only when Spark reports a proof-backed success or an explicit unpaid status. Opening history is optional for reconciliation. Do not send the same invoice again while pending.
5. **Connectivity:** repeat with Wi-Fi disabled before submission and with connectivity interrupted after confirmation. The app must never display a false success and must warn against sending again while status is unknown.
6. **Negative requests:** reject an expired invoice, a regtest invoice, an amount mismatch, an unaffordable payment, and a fee quote above the configured ceiling.
7. **Receive restart/expiry:** create an invoice, close the app, pay it from the external wallet while Opago is closed, then reopen Request (also test reopening after the ten-minute expiry). The receipt must still be recognized. An unpaid expired QR must disappear, show an expiry explanation and offer a new request. The saved status check continues until replaced. A success dismisses after three seconds without tapping Done.
8. **History:** load more than one Spark page and verify no duplicate payment appears after refresh or restart.
9. **Reusable destinations:** scan an LNURL and enter a Lightning address; choose an amount, verify domain/description and exact fee in review, then authenticate and confirm in both wallets. Repeat scanning after cancelling a review, and once before Spark has finished loading. A scan alone must never send funds.
10. **Device cancellation:** cancel the PIN/biometric prompt, leave Send during preparation, and lock during an unfinished balance check. No SDK submission may start without a current authorization. Unknown submitted outcomes must remain pending, not invite an immediate resend.

## Automated coverage — 21 September 2026

245 application tests passed, including 27 added tests across invoice/destination validation, submit failure and timeout handling, restart reconciliation, receive UI and scan lifecycle. TypeScript and changed-file ESLint passed. These tests use synthetic payment data and never submit a network payment. They do not replace the physical scenarios above.

Protocol references: [BOLT 11](https://github.com/lightning/bolts/blob/master/11-payment-encoding.md), [LUD-06](https://github.com/lnurl/luds/blob/luds/06.md). Ordinary LNURL description invoices are accepted under current LUD-06; invoices containing a metadata hash are checked against its exact UTF-8 input. Spark outcome handling is matched to the pinned `@buildonspark/spark-sdk` 0.7.12 types and implementation.

## Evidence

Retain only:

- commit, lockfile hash, APK hash, package ID, Android model/version, and test time;
- redacted screenshots of review, processing, success, receive, and local service status;
- payment hashes/request IDs only when required for support and explicitly approved;
- pass/fail results for every scenario above.

Do not retain complete invoices, preimages, recovery phrases, keys, or signed payloads.

## Release gate

Mainnet Lightning is accepted only when every scenario passes on a physical Android device, a second reviewer signs the evidence, no unresolved payment remains, dependency and secret scans pass, and the rollback owner is available. Any false success, duplicate submission, unrecoverable balance, secret exposure, or unknown payment that cannot be reconciled blocks release.

Observed P05 blocker, 22 September: a real interrupted outgoing attempt remains unknown despite successful request-index, history and sender-role operator lookups with no matching record. Do not accept repeated empty results as terminal failure. See [the integration finding and prepared provider questions](SPARK_PENDING_SEND_INTEGRATION.md). The final read-only preflight now runs before the durable send journal; a process death during that read must leave no newly submitted record. This preventive correction does not retroactively resolve the existing unknown attempt.
