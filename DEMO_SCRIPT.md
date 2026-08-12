# Hedera testnet demo script

Target duration: 2:30-3:30 minutes. Hard limit: 5 minutes.

## Before recording

- Use the exact clean, tested commit recorded for submission.
- Charge the Android device, enable USB debugging, and verify that the installed app opens normally.
- Keep the wallet on Hedera testnet account `0.0.10030291` and use a dedicated funded merchant testnet account.
- Start the merchant page with `$env:HEDERA_MERCHANT_ID='0.0.YOUR_MERCHANT'; npm run demo:hedera-checkout` and open the displayed local URL on the computer.
- Use a small testnet amount and create a fresh request immediately before recording so its five-minute expiry does not interrupt the take.
- Close password managers, notifications, terminals containing environment variables, recovery screens, private-key pages, and unrelated browser tabs.
- Never show or narrate a recovery phrase, private key, operator key, authentication token, personal identity data, or QR containing a secret.

## Recording sequence

### 0:00-0:25 - establish the network and wallet

Show the physical Android device and open Opago Wallet. On the dashboard, keep `HEDERA TESTNET`, the numeric account ID, and HBAR balance visible.

Narration: "This is Opago Wallet running on a physical Android device. Hedera is technically restricted to testnet. The wallet has rediscovered its numeric account and loaded the balance through the Hedera Mirror Node."

### 0:25-0:50 - create the merchant request

Show the local merchant demo in the computer browser. Keep the testnet badge, exact HBAR amount, merchant account, expiry, and QR visible.

Narration: "The local merchant demo creates a short-lived request. It binds the testnet chain, deployed checkout contract, random nonce, merchant, exact tinybar amount, and expiry into a single-use payment ID."

### 0:50-1:25 - scan and review before signing

On Android, choose Send, select Hedera, scan the QR, and pause on the review screen. Clearly show the testnet label, merchant, exact amount, contract `0.0.9972670`, and expiry. Do not confirm until all fields have been visible.

Narration: "The wallet parses the request, resolves the merchant alias, verifies the deployed runtime bytecode against the pinned SHA-256, and presents every payment field before the user signs. HBAR accounting remains bigint tinybars."

### 1:25-2:05 - sign and confirm

Tap the confirmation control once. Keep the device visible while the transaction is submitted. Wait for the app's success screen; do not cut from a pending state to a manufactured success. Show the transaction ID and payment ID.

Narration: "The checkout call is signed on this device. The app persists it as pending first and reports success only after Hedera returns an explicit successful result. Failed or unavailable results are never shown as paid."

### 2:05-2:40 - verify the public result

Open the HashScan transaction link from the success screen or show the same URL in the browser. Display testnet, `SUCCESS`, contract `0.0.9972670`, and the exact merchant transfer. Then briefly open the contract page or Sourcify verification record.

Narration: "HashScan independently shows the testnet transaction, contract call, and exact transfer. The deployed contract's runtime matches the locked artifact and its source-verification record is public."

### 2:40-3:00 - close with scope

Return to the app's success screen or dashboard with the testnet label visible.

Narration: "This completes the Opago Hedera testnet milestone: account recovery, native HBAR wallet functions, contract-bound merchant checkout, explicit confirmation, and public transaction evidence. This is a testnet proof of concept, not a mainnet or production-readiness claim."

## Required shots

- Physical Android device running the app.
- Visible `HEDERA TESTNET` label, account ID, and HBAR balance.
- Merchant payment request and QR.
- Review screen before signing with merchant, amount, expiry, and contract.
- User confirmation on the device.
- Genuine success screen with transaction ID.
- HashScan testnet transaction showing `SUCCESS` and exact transfer.
- Contract page or Sourcify verification record.

## If the live transaction is slow

Keep recording the pending state for a reasonable bounded interval. If it remains unresolved, stop the take and investigate; do not edit a prior success onto a new pending request. Start a fresh request for the next take because each payment ID is single-use and expires.

## Optional failure-path appendix

If the submission allows extra footage, scan an already paid request and show that the wallet/contract rejects the replay without presenting success. Keep this outside the main three-minute flow unless specifically requested.
