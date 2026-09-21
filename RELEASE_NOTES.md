# Opago Wallet release notes

Latest internal wallet update: 21 September 2026. The grant-candidate scope below describes the earlier HBAR-only artifact; the current internal production candidate enables the explicitly configured Hedera and Lightning Mainnet profiles. See [PUBLIC_RELEASE_READINESS.md](PUBLIC_RELEASE_READINESS.md) for artifact evidence and outstanding release acceptance.

## Shared native seed derivation — 21 September 2026

- Compute BIP39 once per authenticated startup and reuse its bytes for the existing Hedera keys and Spark initialization. Android performs PBKDF2 through background system crypto in a local Expo module; other platforms retain asynchronous JavaScript derivation.
- Keep the same recovery phrase, empty passphrase, Hedera derivation path, Spark account defaults and network selection. Temporary app buffers are erased on completion, error and lock. Late native/SDK results remain subject to session validation and cleanup.
- All 218 application tests, TypeScript and changed-file ESLint passed. Tests verify all supported phrase lengths, identical Hedera signatures and Spark key families, malformed native results, retries and locking during startup. Both native module tests also passed; the build is installed on Android ending 8690, with app data preserved. Three owner-operated unlocks on Android ending 8690 reached the current Bitcoin balance in 3.617, 4.162 and 3.837 seconds after authentication (mean 3.872 seconds). All met the preferred 5-second target; the preceding measured sample took 11.805 seconds. Cached preview appeared after 1.226–1.709 seconds. This is evidence for this device and these runs, not a cross-device latency guarantee.

## Spark balance priority and startup measurement — 21 September 2026

- Home prioritizes the live Bitcoin balance before loading an early-opened HBAR section or the shared history. Both sections remain opt-in. They show a waiting message while queued; closing them cancels the queued read. The interface gets a frame to show the Bitcoin result before optional queries start.
- Expanding HBAR no longer restarts Bitcoin's balance query. Pull-to-refresh loads Bitcoin first. A failed Bitcoin balance attempt releases optional reads; a stalled SDK has a 20-second priority deadline and explicit slow-connection copy. This never fabricates a zero/ready Bitcoin balance or changes payment authorization.
- Local timing logs contain only fixed stage names and elapsed milliseconds. Additional stages distinguish secure-storage access, key derivation, backup-status loading, Spark startup, first balance, visible live balance and optional query starts. The owner-operated Android measurement recorded 11.805 seconds to the live balance after authentication, including 4.212 seconds for Hedera key derivation and 6.786 seconds for Spark initialization. Optional reads started later as intended; this was the baseline for the shared native seed optimization above.
- 208 application tests, TypeScript and changed-file ESLint passed. New cases cover early expansion, queued cancellation, avoiding repeat Spark reads, failures, stalled SDK, leaving the screen, new SDK instances and ordered refreshes.

- Installed on Android ending 8690 as an update preserving app data. Package/source-map/signature checks and locked launch passed. Authenticated startup measurement is separate from this launch check.

## Shared history below Advanced options — 21 September 2026

- Home now places Advanced options immediately after the Bitcoin balance card, followed by a single transaction history for Bitcoin and HBAR. Opening or closing the asset options does not hide, filter or collapse this history.
- History remains collapsed on startup. Opening it loads both assets together and shows payments in date order; closed-history refreshes still load balances only. The main EUR balance remains Bitcoin-only.
- 197 application tests passed, along with TypeScript and Home ESLint. Regressions verify section order, lazy reads, independence from Advanced options and combined Bitcoin/remote-HBAR results. This supersedes the split history layout in the preceding Bitcoin-default update.

- Installed on the connected Android device ending 8690; installed package hash, signature and source map verified. App launch succeeded, first-install timestamp unchanged, and no app data was cleared.

## Bitcoin by default, HBAR in Advanced options — 21 September 2026

- Home shows a Bitcoin-only EUR estimate, Bitcoin balance and a separately expandable Bitcoin history. HBAR balance, valuation and history sit under initially collapsed Advanced options. No HBAR account/history reads are started by the normal Bitcoin Home path; each history remains opt-in.
- Send and Request initially offer Bitcoin only. Advanced options reveals HBAR; explicitly selecting or scanning HBAR retains accurate HBAR forms/reviews. Back/reset returns to Bitcoin with the extra choices collapsed. Request now has a visible Back action. Existing recovery derivation, key storage, payment authorization, fee policy and transaction submission checks are preserved.
- Onboarding says “Your bitcoin. Your move.” Security uses the same Advanced options disclosure for technical/network information. New labels are available in English, German, French and Spanish. A valid Bitcoin exchange rate and its encrypted preview remain usable when HBAR pricing is unavailable.
- 196 application tests passed; TypeScript and changed-file ESLint passed. Browser checks at 320/360 px used synthetic data and covered Bitcoin defaults, expanding HBAR, HBAR selection and Back in Send/Request. Native authenticated payment acceptance remains separate; no payment was sent.

- Installed as a data-preserving update on the connected Android device ending 8690. APK/source-map/signature verification passed; locked launch succeeded without observed startup errors. The second device was not attached. Exact artifact evidence is in `PUBLIC_RELEASE_READINESS.md`.

## Balance display after unlocking — 17 September 2026

- Home retains the last known balances and EUR rates in encrypted device storage, bound to the wallet public key and both networks. After unlocking it can show this explicitly labelled preview while live balances load. Unknown balances remain unknown; records expire after seven days and are deleted when the wallet is removed. Payment preparation and signing use fresh network checks, never this preview.
- The first Lightning balance display reuses the synchronization that SDK initialization already completed. Subsequent refreshes query fresh data; concurrent display requests share the same in-flight read. Temporary Hedera connection failures no longer delete account bindings and trigger a second discovery request.
- Recent activity starts collapsed and loads local, HBAR and Lightning history only when opened. Pull-to-refresh leaves collapsed history unloaded. Unresolved Lightning payments are reconciled when opening Send or expanding activity, retaining pending-payment protection.
- 188 application tests, TypeScript and ESLint pass. Regression coverage includes wallet/network isolation, invalid and expired previews, locking/removal during storage writes, one-time Spark startup reuse, Hedera outage behavior and actual Home expand/collapse/refresh behavior. This internal build enables local timing logs containing only fixed stage names and elapsed milliseconds. The first measured unlock before the lazy-history addition took 18.873 seconds to show a full EUR value; cached reopen timing is not yet confirmed.

## Home responsiveness and navigation — 17 September 2026

- Wallet derivation and optional Lightning SDK startup yield to the initial interface paint, then recheck the active wallet session. Simultaneous Home balance/history lookups share only the in-flight HBAR account read; signing still performs an independent fresh account check.
- Local activity, Hedera history/journal and Lightning history/journal refresh concurrently and publish completed results immediately in stable source priority. Each refresh source has an eight-second bound; stale results after screen changes or timeouts cannot replace current activity. Existing balance-loading placeholders remain.
- Send has an explicit arrow and Back label, asset-specific heading, full-width recipient field and a visible Back action on both payment reviews. Android Back returns one step at a time; payment-in-flight navigation remains blocked. The redundant live-HBAR banner is omitted from the Mainnet input form.
- The bottom navigation uses compact outline wallet/send/QR/shield icons, muted inactive labels and a yellow active tab, with safe-area and text-scale sizing.
- 179 application tests, TypeScript and ESLint pass. Browser previews at 320/360 px cover Home loading, the outlined tab bar, asset selection, HBAR/Bitcoin forms and returning from simulated reviews without a payment. Device startup/interaction timing, large native fonts and the hardware Back button remain physical acceptance checks.
- The new UI build is installed and hash-verified on the original Android device, which was reconnected during the work. The second device received the preceding HBAR correction but still needs this newer UI artifact.

## HBAR sending and text encoding — 17 September 2026

- A 2 HBAR transfer was rejected before review by the production candidate's old 1 HBAR test cap. With the owner's approval, the production profiles now use available balance minus the maximum network fee. Both review and the refreshed pre-signing check enforce this budget; direct payments retain their 0.1 HBAR maximum fee, device authorization and final session guard.
- Limited test builds still support explicit numeric caps and now explain those caps instead of returning a generic preparation error. HBAR amount errors are localized in all four languages.
- Corrected damaged UTF-8 punctuation in Send, Security and recovery guidance, restoring translation lookup for those messages. A regression scan rejects broken punctuation in bundled sources and catalogs.
- 174 application tests, TypeScript and ESLint pass. Simulated Mainnet tests cover 2 HBAR with 2.38690992 HBAR available, the exact balance-minus-fee boundary, one tinybar over budget, merchant fee reserves, int64 bounds, SDK transfer amounts and cancellation before network submission. No real payment was submitted.
- Installed on the connected original Android device at 15:44:55; the on-device APK hash matches the verified artifact, wallet data was retained, and cold launch has no observed JavaScript/fatal errors. The second device was not connected. A real transfer remains for owner acceptance.

## Internal interface update — 17 September 2026

- English, French, Spanish and German, selected under Security → Language and retained after restart; localized onboarding, recovery guidance, balances, payments, camera and security controls.
- Loading, known-zero, stale and unavailable balances are distinct; incomplete balances never become a partial EUR total.
- Home opens the QR camera directly. Camera permission is checked before requesting access, preventing repeated permission requests when it is already granted.
- 144 application tests, TypeScript and ESLint pass. The combined Android update is installed; German loading/receive UI and camera activation were observed. Repeated scanning, native language selection and TalkBack still need physical acceptance.

## LNURL payment correction — 17 September 2026

- Reusable LNURL codes and Lightning addresses now ask for an amount after scanning instead of reporting a failed payment. The amount field receives focus and Continue waits for input. Amountless BOLT11 invoices use the same step; fixed requests still proceed to review.
- Callback amounts must match the user's chosen amount exactly. Invalid amount ranges, unavailable fee estimates and exceeded fee caps have specific messages in English, German, French and Spanish. Existing fee caps and payment authorization remain enforced.
- 150 tests, TypeScript and ESLint pass. The supplied Wallet of Satoshi endpoint was resolved without payment: empty amount prompts for input; a 20 SAT request returns a matching Mainnet invoice. A mock-wallet test covers preparation without submission. Browser checks confirm input focus, disabled/enabled Continue and German layouts at 320/360 px. The update is installed on the connected Android device; cold launch and the German lock screen were verified. A real Spark fee quote and completed device payment remain unverified.

## Lightning fee correction — 17 September 2026

- A follow-up device screenshot identified the second Wallet of Satoshi rejection: a 2 SAT quote exceeded the old 0.5% fee budget (1 SAT for small payments).
- When a valid quote is available, review now uses that quote as the exact maximum fee, subject to the existing 100 SAT build cap and enough balance for amount plus fee. It shows both maximum network fee and maximum total in all four supported languages. Payment submission retains the reviewed ceiling; there is no automatic increase or retry.
- Without a fee-estimate method, the conservative percentage fallback remains. Unavailable/invalid quotes still stop preparation. Device authorization and pending-payment reconciliation are unchanged.
- 155 application tests, TypeScript and ESLint pass. Regression tests cover 20 SAT + 2 SAT, exact-balance and zero-fee cases, invalid/over-limit quotes, unchanged submitted fee ceiling and authorization cancellation. German review was checked at 320 px with synthetic data. The update is installed and launches on the original Android device; the second device disconnected during installation and still needs the update. No real payment was submitted.

## Android device PIN — 17 September 2026

- Android 11+ users can create and restore a wallet, approve payments and access recovery/backup controls using the system device credential or supported strong biometrics. Simple face recognition is not sufficient by itself. The PIN is entered only in Android's system UI.
- A pending credential prompt no longer invalidates its own operation merely because Android opens a separate credential activity. Normal background/idle locking, cancellation, foreground checks and final session-bound payment approval remain enforced; older approvals cannot survive a new prompt.
- 165 tests, TypeScript and ESLint pass. The update is installed on both Android 14 devices, preserving package data; both app processes start without observed JavaScript/fatal errors. Real PIN entry, wallet creation/restoration and payments await owner acceptance. PIN-only Android 10 and older receives a clear compatibility message.

## Home and inactivity correction — 17 September 2026

- Backup warnings appear only after the current wallet’s stored status is known. Security and Request show loading/retry feedback while that status is unavailable.
- Home again has Send / Swap / Request; Swap opens a localized coming-soon notice.
- Gestures, text entry, dialogs and accessible button/tab activation refresh the two-minute inactivity timer. Network updates and rendering do not. Background locking remains enforced.
- 170 tests, TypeScript and ESLint pass, including sustained activity followed by exact inactivity expiry and delayed backup-status loading. Installed on both Android 14 devices without clearing wallet data; cold starts completed without observed JavaScript/fatal errors. Native interaction timing remains an owner acceptance check.

## Scope

This public repository remains the multi-chain Opago hackathon project. The current grant candidate adds a guarded Hedera Mainnet wallet and contract-checkout path to the earlier accepted Hedera Testnet integration. It does not claim that the complete repository is an audited public-production wallet.

The standalone Android candidate enables real funds only for Hedera Mainnet. Lightning remains on regtest. The candidate uses a local debug certificate and is not a Play Store artifact.

## Included

- Expo-compatible Hiero SDK `2.88.0`, deterministic Hedera Ed25519 recovery derivation, network-separated account discovery, and local-only provisioning or deployment scripts.
- Exact `bigint` tinybar balance, send, receive, history, status, HashScan, review, and success flows on Android.
- `OpagoHbarCheckout`, a non-custodial immutable contract that binds each single-use payment to chain, contract, nonce, merchant, exact amount, and expiry.
- Verified Testnet and Mainnet deployment manifests, pinned runtime-bytecode verification, Sourcify evidence, and contract calls signed on the Android device.
- A persistent non-secret payment journal with fail-closed pending, confirmed, and failed states across offline operation, ambiguous SDK results, timeouts, and process restarts.
- HashPack-compatible plain account-ID receive QR values alongside strict Opago checkout request parsing.
- A consistent consumer-oriented asset, Send, Request, activity, and receipt interface with scalable asset icons and explicit network labels.
- Opago-owned launcher, adaptive, monochrome, splash, and web icons replace the remaining Expo template and obsolete prototype artwork.
- The generated Android application requests camera access only for QR scanning; transitive audio-recording, storage, and overlay permissions are explicitly removed.
- Bitcoin Lightning development-network flows remain isolated from the real-HBAR candidate.
- A reproducible `npm run phase5:verify` gate covering TypeScript, ESLint, application tests, contract compilation/tests, and service/script syntax checks.

## Public Hedera evidence

| Item | Testnet | Mainnet |
| --- | --- | --- |
| Chain ID | `296` | `295` |
| Contract | [`0.0.9972670`](https://hashscan.io/testnet/contract/0.0.9972670) | [`0.0.10850063`](https://hashscan.io/mainnet/contract/0.0.10850063) |
| EVM address | `0x0000000000000000000000000000000000982bbe` | `0x0000000000000000000000000000000000a58f0f` |
| Runtime SHA-256 | `18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8` | same locked runtime |
| Deployment manifest | [`deployments/hedera-testnet.json`](deployments/hedera-testnet.json) | [`deployments/hedera-mainnet.json`](deployments/hedera-mainnet.json) |
| Physical-device checkout | [Testnet transaction](https://hashscan.io/testnet/transaction/0.0.9960666%401786350735.994979380) | [Submitted-video Mainnet transaction](https://hashscan.io/mainnet/transaction/0.0.10861984%401789541018.595289764) |

The exact Mainnet candidate, transaction, and remaining limitations are recorded in [`HEDERA_MAINNET_CANARY_ACCEPTANCE.md`](HEDERA_MAINNET_CANARY_ACCEPTANCE.md). The Thrive evidence index is [`THRIVE_MILESTONE2_MAINNET.md`](THRIVE_MILESTONE2_MAINNET.md).

## Verification baseline

Run the deterministic local gate with:

```powershell
npm ci
npm run phase5:verify
```

- TypeScript: pass.
- ESLint: pass.
- Application tests: `113/113` pass.
- Contract tests: `9/9` pass.
- Mainnet runtime bytecode: matches the locked artifact and versioned deployment evidence.
- Mainnet source verification: verified.
- Expo dependency and native-module compatibility: all Expo Doctor checks pass.
- Physical Android balance, receive, direct transfer, checkout, pending reconciliation, and HashScan evidence: accepted for the internal candidate.

## Compatibility and operator notes

- Node.js `20.19` or newer and the committed `package-lock.json` are required.
- Generated `android/` and `ios/` projects are intentionally excluded.
- A Hedera operator key is used only by trusted local provisioning or deployment scripts. It must never enter the app bundle, Git, chat, screenshots, or an `EXPO_PUBLIC_*` variable.
- The merchant, eID, OCP, and Travel Rule services are local reference implementations, not hosted production services.
- The Mainnet contract is already deployed. The deployment command must not be run again.

## Known limits

The wallet, native integration, dependencies, and Solidity contract have not received an independent security audit. Both npm audit scopes report zero advisories as of 17 September 2026. The merchant demo does not authenticate an Opago merchant identity. iOS, store signing/distribution, public hosting, external-user recovery, production monitoring, and broad Mainnet failure-path acceptance remain outside this internal candidate. See [`SECURITY.md`](SECURITY.md) and [`PUBLIC_RELEASE_READINESS.md`](PUBLIC_RELEASE_READINESS.md) for current evidence and release blockers.
