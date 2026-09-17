# Lightning Mainnet Android acceptance

This runbook is the real-funds gate for Bitcoin Lightning. The automated suite and build tooling never initiate a payment. A named Opago approver must authorize each canary amount before a human confirms it on the Android device.

## Preconditions

- Use a clean, reviewed commit on the `production` branch.
- Record the commit and `package-lock.json` SHA-256.
- Keep the paper recovery phrase offline and verify the three-word backup challenge before testing.
- Use an Android device with strong biometrics enrolled.
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
4. **Process death:** with an unresolved payment recorded, force-stop the app, reopen it, refresh Home, and confirm the payment remains Processing until Spark reports a proof-backed success or an explicit failure.
5. **Connectivity:** repeat with Wi-Fi disabled before submission and with connectivity interrupted after confirmation. The app must never display a false success and must warn against sending again while status is unknown.
6. **Negative requests:** reject an expired invoice, a regtest invoice, an amount mismatch, an unaffordable payment, and a fee quote above the configured ceiling.
7. **Receive restart:** create an invoice, force-stop the app, reopen Request, and confirm that the unexpired QR returns and expires automatically.
8. **History:** load more than one Spark page and verify no duplicate payment appears after refresh or restart.

## Evidence

Retain only:

- commit, lockfile hash, APK hash, package ID, Android model/version, and test time;
- redacted screenshots of review, processing, success, receive, and local service status;
- payment hashes/request IDs only when required for support and explicitly approved;
- pass/fail results for every scenario above.

Do not retain complete invoices, preimages, recovery phrases, keys, or signed payloads.

## Release gate

Mainnet Lightning is accepted only when every scenario passes on a physical Android device, a second reviewer signs the evidence, no unresolved payment remains, dependency and secret scans pass, and the rollback owner is available. Any false success, duplicate submission, unrecoverable balance, secret exposure, or unknown payment that cannot be reconciled blocks release.
