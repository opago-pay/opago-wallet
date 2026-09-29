# Opago Wallet release notes

Latest internal wallet update: 23 September 2026. The grant-candidate scope below describes the earlier HBAR-only artifact; the current internal production candidate enables the explicitly configured Hedera and Lightning Mainnet profiles. See [PUBLIC_RELEASE_READINESS.md](PUBLIC_RELEASE_READINESS.md) for artifact evidence and outstanding release acceptance.

## Live Receive QR and network switch — 23 September 2026

Receive opens on Lightning and creates an open-amount QR automatically. Entering SAT or EUR replaces it after a short pause with an invoice for exactly the new amount; the old QR disappears immediately so it cannot be scanned with the wrong value. Expired requests are renewed while older requests remain tracked. Verified payments to open invoices are recorded with their actual received amount, including after restart. Bitcoin switches to a watched on-chain deposit address and updates its BIP21 QR when the amount changes. HBAR remains under Advanced options; its HashPack-compatible QR contains the account ID, so the payer must enter the optional amount in the sending wallet. Existing on-chain claim details and backup requirements remain accessible.

435 app tests, TypeScript, lint, production-profile validation, native release unit tests, bundle/source verification and APK-v2 signature passed. Installed on Android …8690 on 23 September at 11:01:52 MESZ; APK SHA-256 `d944fcae791646dcbcbb3f4e70a4dbf0cb47b2c46147a2f19dfca0b902afe29a` matches the installed artifact. Locked launch had no observed startup errors. Owner testing of actual Lightning, on-chain and HBAR scanning/payment remains open. Evidence: `.codex-local-evidence/receive-live-qr-{android-build.log,source-hashes.json,device-update.json}` and `receive-suite-final.log`.

## Larger Security shortcut — 23 September 2026

Home's Security shortcut now has a visible 64×64 circular button instead of a transparent 48×48 target, with a 34-point gear instead of 27 points. It includes extra hit tolerance, a pressed background and Android ripple; the icon shares its parent touch target. The existing accessible Security label, navigation and wallet activity tracking remain. TypeScript, changed-file lint and 31 existing UI/history/interaction tests passed. Owner touch acceptance remains pending.

Installed on Android …8690 on 23 September at 10:35:17 MESZ. SHA-256 `507e4744323daae078f9fb8015a79585f43b948d0e5de83e10f2554da70d154d` matches the installed APK. Release/native checks, APK-v2 signature and 92 bundled source modules verified. Locked launch completed without observed startup errors; original installation preserved. Evidence: `.codex-local-evidence/settings-target-{tests.log,android-build.log,source-hashes.json,device-update.json}`.

## Load history in small pages — 23 September 2026

The previous “Load earlier” control only revealed prefetched rows: opening Home history requested up to 500 Spark transfers and ran payment reconciliation inside an eight-second combined refresh. Local rows could appear while the spinner still waited for those jobs, followed by a generic partial-history error. The owner confirmed the touch fix, but reported this loading/error behavior.

Home now starts with up to ten merged payments. Bitcoin display history requests a single ten-record Spark page, respecting the provider's continuation/end marker. HBAR uses ten-record timestamp pages for both supported transfer types, and SQLite uses ten-row keyset pages. Small local payment journals supply saved state without performing network reconciliation. A chronological merge deduplicates records and withholds older rows beyond an unread source boundary; filtered internal transfers can produce fewer than ten visible payments, with older pages available through the footer. Pages are fetched only by explicit initial/refresh/retry/load-earlier actions, without a loop that downloads the entire history. The previous 500-display-entry ceiling no longer limits manual paging.

The initial page is published when its bounded source reads finish, at the same time its loading indicator ends. Further loading uses the footer indicator. Failed sources preserve existing rows, identify the unavailable history in the selected language, and retry their same cursor without refetching successful sources. Empty results with an unavailable source are not presented as “No payments yet.” Late timed-out responses cannot silently update the page. The existing separate Lightning/on-chain recovery remains intact; HBAR recovery runs independently after the page is published and cannot turn a loaded page into a refresh failure. Confirmed updates continue to invalidate cached history.

430 automated app tests, TypeScript and changed-file lint passed. Tests cover the Home 10/20/25-entry flow, source continuation/end markers, interleaved Bitcoin/HBAR ordering, duplicate taps/rows, filtered records, timeout/late-response isolation, same-cursor retries, HBAR timestamp paging and a bounded SQLite keyset query. Actual network responsiveness remains for owner acceptance; no agent-operated wallet interaction, payment or payment timing capture.

Installed on Android …8690 on 23 September at 10:25:48 MESZ. SHA-256 `0bf72b2e3d6a0fe15a8e45ee452e71e55ba96479146d76411add0d1014c688bd` matches the installed APK. Native/release checks, APK-v2 signature and 92 bundled source modules verified. Original installation preserved; locked launch completed without observed startup errors. Evidence: `.codex-local-evidence/history-pages-{tests.log,android-build.log,source-hashes.json,device-update.json}`.

## History touch control — 23 September 2026

The owner reports that the preceding history update still barely responds to taps on either the text or arrow. Its installation was confirmed on Android …8690. History now has one full-width pressable card with an 80-point minimum height, a larger chevron area, extra hit tolerance, Android ripple and a pressed background. Its label/content no longer shrinks when expanded; decorative children share the parent's touch target. A loading indicator remains visible inside the button while the requested history loads. Home preserves handled taps instead of consuming them only to dismiss a previously focused keyboard.

The toggle requests the action shown by the current render, so repeated activations before the next render cannot invert the pending update back to its starting state. A regression test covers repeated opening and closing, and the pressable retains wallet activity tracking for touch and accessibility activation. Lazy history reads and the previous caching fixes are preserved. These changes address specific interaction weaknesses; the reported device-level responsiveness still needs owner confirmation.

421 automated app tests, TypeScript and changed-file lint passed. No agent-operated wallet interaction or payment, and no payment timing capture.

Installed on Android …8690 on 23 September at 10:08:02 MESZ. SHA-256 `325d92c78ecd7d6753e96d5902dd21a387f6a2d51f720d3e8cf68fb9805fdacd` matches the installed APK. Native/release checks, APK-v2 signature and 90 bundled source modules verified; original installation preserved. Locked launch completed without observed startup errors. Evidence: `.codex-local-evidence/history-touch-{tests.log,android-build.log,source-hashes.json,device-update.json}`.

## Home balance labels and responsive history — 23 September 2026

Home shows “Balance” instead of “Bitcoin balance” and removes the small valuation footnote. The HBAR Mainnet badge is hidden on Home; development-network badges and loading/stale/error states remain. The displayed balance calculation is unchanged.

Refreshing an already visible total keeps the amount and “Balance” label, with a small muted spinner next to the amount. An unknown balance still uses a placeholder; errors and unavailable rates remain explicit. A refresh of a known Bitcoin balance no longer closes/reopens the readiness gate for optional data and pending-payment watchers. HBAR disclosure shares in-flight reads and reuses successful data for the current Home visit; pull-to-refresh, returning to Home and retrying a failed read still fetch fresh data. Payment authorization uses its existing independent fresh-balance checks.

History disclosure no longer invalidates the focus lifecycle or starts duplicate source queries. Repeated opening within the same Home visit shares an in-flight refresh or reuses successfully loaded data. Returning to Home and explicit pull-to-refresh still refresh the history; late responses after leaving the screen are discarded. Rows and the date formatter are reused, and the previously opened list remains mounted but hidden from both layout and accessibility when collapsed. The history remains initially collapsed and lazy, with its larger paging button at the bottom.

Confirmed payment-status changes explicitly invalidate cached history and refresh it when visible, without relying on the former readiness-toggle side effect. If collapsed, the updated history loads on the next opening.

420 automated app tests, TypeScript and changed-file lint passed. Regression tests exercise rapid history/HBAR toggles during and after loading, explicit refresh, readiness stability, HBAR error retry, payment-settlement invalidation and late responses after leaving Home. Actual device responsiveness remains for owner acceptance; no payment timing capture or agent-operated payment.

Installed on Android …8690 on 23 September at 00:34:37 MESZ. SHA-256 `f2e676ee11e417717bdfa86c2d6340e79ff257e57ddef03fdba5de84da2b70cd` matches the installed APK. Release/native checks, APK-v2 signature and 89 bundled source modules verified. The update preserved the original installation, and locked launch completed without observed startup errors. Evidence: `.codex-local-evidence/home-history-{tests.log,android-build.log,source-hashes.json,device-update.json}`.

## Home navigation and history footer — 23 September 2026

The Home header now opens Security through a settings icon. The bottom navigation is removed; Send and Receive remain available through Home's existing actions. Security and Receive have accessible close buttons leading back to Home, including the receive backup gate. Existing nested payment back/cancel controls and authorization guards are preserved. Scroll content accounts for the bottom safe area.

“Load earlier” is now a full-width, 56-point-minimum button below the last visible transaction. It reveals the next 20 existing history entries, retaining the current lazy history loading and 500-entry limit. No payment preparation or sending optimizations were changed.

413 existing app tests, TypeScript and changed-file lint passed. Native visual/navigation acceptance remains for the owner; no agent-operated wallet interaction or payment. Send timing is disabled in this UI build.

Installed on Android …8690 on 23 September at 00:03:17 MESZ. SHA-256 `87cb3106f39264ce3e324d7dd1e1736766ec2a4398e47da1abf9cd1e310f5698` matches the installed APK. Release/native checks, APK-v2 signature and 89 bundled source modules verified; removed tab-bar components are absent from the bundle. First installation preserved and locked launch completed without observed startup errors. Evidence: `.codex-local-evidence/home-navigation-{tests.log,android-build.log,source-hashes.json,device-update.json}`.

## Overlap independent Lightning preparation — 22 September 2026

Installed on Android …8690 at 23:35:50 MESZ; verified APK `a59174b8d9e4bf58d247ed852fc3bca75d809629a33884fddd8e64938d1f9b3d`. Locked launch passed; owner payment/timing comparison remains pending.

The owner's native-HTLC comparison took 5.692 seconds after device approval, still above the five-second requirement. Fresh operator commitments and local normal-refund signing now run alongside HTLC transfer-package preparation. The original SDK remains responsible for the outbound request; prepared data is bound to one package/transfer and consumed once. Cancellation, cleanup, changed transaction data or incomplete commitments prevent submission. No fees, authorization, journal or proof checks were removed.

413 app tests, TypeScript and changed-file lint passed. Tests compare actual installed SDK request construction with synthetic RPC data and cover overlap, concurrency, replay, failure and cleanup. Real-device timing remains pending; no agent-operated payment.

## Native HTLC output preparation and fresh balance during approval — 22 September 2026

The owner comparison improved to 9.190 seconds after approval but still misses the required five-second target. Android now computes the public HTLC output once per hash/sender/receiver during refund preparation, using existing native Spark scalar multiplication. Transactions and sighashes match the pinned SDK byte-for-byte; the SDK still owns fresh nonces and FROST signatures. Unsupported platforms retain the original SDK path.

Bounded, non-overlapping Bitcoin balance refreshes continue during a longer approval prompt. Cancellation stops refreshes, newer failures/insufficient balances are respected, and the original five-second freshness rule still applies before submission. No authorization, durable journal, fee or proof checks were removed. 404 app tests, TypeScript and changed-file lint passed. The owner comparison subsequently measured 5.692 seconds after approval; the five-second result remains unmet. No agent-operated payment.

## Spark leaf selection and per-send derivation reuse — 22 September 2026

The owner's anonymous trace located 15.519 seconds in leaf selection/swap and 5.447 seconds in transfer preparation. A bounded exact-fit search now avoids some unnecessary swaps; required swaps select the fewest inputs. The pinned SDK retains its mutex, reservation, submission and recovery state machine. Android reuses deterministic key derivations only during a send, clearing owned cache copies on completion, failure and wallet cleanup. Random keys and signing nonces remain fresh.

390 app tests, TypeScript and changed-file lint passed, including synthetic installed-SDK reservation/swap/failure tests and cache lifecycle checks. The next internal build retains owner-approved anonymous timing for comparison. No real payment was performed by the agent; actual speed improvement and the five-second target remain unverified. Details: [Lightning send performance](LIGHTNING_SEND_PERFORMANCE.md).

## Owner-approved anonymous send timing — 22 September 2026

The native-signer candidate still took 25 seconds in the owner's test. Following explicit approval, an internal opt-in now captures relative durations of the next Send attempt, including SDK substeps, without payment or wallet contents. Observers retain original promises/results/errors; logging happens after the attempt. One capture per process, bounded to 512 spans. Normal builds keep the flag disabled. 375 app tests, TypeScript and changed-file lint passed. The owner performs the payment; diagnosis and the five-second goal remain open.

## Android Spark native public-key operations — 22 September 2026

The owner reports 23-second Opago sends versus under five seconds in Wallet of Satoshi on the same Android device/WLAN. The preceding scheduling and Bitcoin-preflight builds did not resolve that gap. A source/bundle audit confirms the production build uses the React Native SDK and native FROST, but SDK 0.7.12's default signer still performs public-key/nonce-commitment curve multiplications in JavaScript despite exposing matching Rust operations on Android.

An Android-only DefaultSparkSigner extension delegates those two operations to the existing SparkFrostModule, batching each fresh nonce pair. SDK key derivation, randomness, nonce ownership, FROST signing, route selection, native authorization, fee limit, durable journal and proof verification are retained. Bridge outputs are checked including Kotlin signed-byte conversion; transient JS bridge copies are erased. Native failures abort with a sanitized error. Unsupported platforms retain the default signer; the pinned SDK's iOS public-key bridge methods log their inputs, so this adapter deliberately never calls them.

370 app tests, TypeScript and changed-file lint passed. Correctness tests use synthetic keys and the original SDK/JavaScript arithmetic as the oracle, including deterministic key families, ECIES, random keys, nonce/FROST lookup and failure paths. They do not execute or benchmark an Android payment. Native device speed and the five-second goal remain unverified; network/leaf-swap work may still contribute. No new performance instrumentation or agent-operated payments.

## Bitcoin-only send preparation alongside device approval — 22 September 2026

The owner reported that the previous scheduling changes did not reduce the observed 15–20 second send time. Payment balance reads now use a narrow Spark-wallet extension: the pinned SDK 0.7.12 fresh AVAILABLE-leaf validation/recovery and cache refresh/eviction path, without Spark-token synchronization or token metadata. The full SDK balance API, key derivation and payment execution remain unchanged.

When Send is pressed in an unlocked foreground wallet, the fresh Bitcoin balance check starts alongside the native authorization prompt. A result older than five seconds when approval completes is read again. This is an in-flight check, not the Home balance cache. The approved invoice/amount/fee are copied before the prompt; authorization, current-screen/session, balance and expiry checks still gate the durable pending record and SDK submission. Cancellation, lock, late errors and duplicate attempts cannot submit. Spark's fresh send fee check, leaf selection and preimage verification remain in place.

363 app tests, TypeScript and changed-file lint passed. No new diagnostics or agent-operated payment measurements. Five-second device acceptance is not yet established and remains with the owner.

## Shorter Lightning send path — 22 September 2026

Review preparation now loads the fresh balance and fee quote in parallel. After authorization, the durable pending journal still precedes submission, but rebuildable SQLite history writes no longer delay submission or verified success. Terminal state and Spark request ID are persisted together; unresolved results and terminal-write failures retain the separate request-ID recovery path. The journal returns its saved record, removing an extra storage read.

348 app tests, TypeScript and changed-file lint passed, including stalled/failed history indexing, durable-write ordering, restart duplicate protection and fallback after a failed terminal write. Fresh pre-submit balance, exact fee ceiling, authorization/expiry checks and proof verification remain intact. No new timing instrumentation or agent-operated payment measurements; real-device speed comparison remains with the owner.

## Direct review for fixed-amount invoices — 22 September 2026

Scanning a Lightning invoice with an amount now opens payment review preparation immediately, including while Spark or fee lookup is pending. The amount-entry keypad no longer flashes before review. The verified amount appears when resolved; no zero balance, placeholder fee or enabled Send action is shown before fee preparation completes. Amountless requests still lead to the keypad after resolution, and onchain signing preparation retains its explicit action.

Read-only preparation can be cancelled. A cancelled or superseded lookup cannot overwrite or unblock a newer scan. 341 app tests, TypeScript and changed-file lint passed, including delayed invoice/fee responses through both scanner entry points and cancel/rescan races. Native visual acceptance remains with the owner.

## Full-screen payment flow and live sending state — 22 September 2026

Amount entry and review now use opaque full-screen views with safe-area spacing and a pinned action footer, replacing the scanner backdrop and bottom sheets. Large in-app digit keys and Cancel remain. The final action is simply Send in all supported languages.

Send immediately opens an authorization state, followed by a rotating gold Bitcoin indicator while the real payment operation is pending. Confirmed Lightning success uses the same composition with a green checkmark, the amount, Done and optional receipt details. Reduced-motion preferences disable rotation. No simulated completion timer is used: authorization cancellation, failure and unresolved submissions preserve their existing error/pending handling. Onchain broadcast remains distinct from network confirmation. Camera lifecycle, fee limits, journals, device authorization and duplicate protection remain in place.

337 app tests, TypeScript and changed-file lint passed. Added coverage checks authorization/progress/success sequencing, double tapping, PIN cancellation, unresolved/failing submissions, stale completion after navigation, onchain broadcast status and reduced motion. Device visual and payment acceptance remains with the owner.

## Custom amount keypad and clear cancellation — 22 September 2026

Bitcoin amount entry uses large in-app digit and delete keys, with a locale-specific decimal key for EUR and whole-number entry for SAT. The amount is displayed above the keypad; no native keyboard is opened. Fixed invoice amounts remain read-only. Existing precise amount parsing, quote preparation, fee limits and device authorization remain unchanged.

Amount entry and review replace header back icons with a prominent Cancel action beside Continue/Confirm in a separate footer. Cancellation clears the draft and returns to scanning; it is blocked during submission. Native keyboard overlap handling remains available for manual address entry and accounts for Android's already-resized modal viewport.

331 app tests, TypeScript and changed-file lint passed. New coverage checks localized digits/decimals/deletion, disabled editing, fixed invoices, cancellation and modal keyboard geometry. Native visual/accessibility acceptance remains with the owner.

## Direct scan continuation and Buy label — 22 September 2026

Home's middle action now says Buy (EN/DE/FR/ES) with a card icon; it remains a coming-soon placeholder. Validated scan, paste and manual-entry results immediately enter the existing payment flow without the redundant recognition confirmation: amountless requests ask for an amount, fixed Lightning requests proceed to cost review. Final payment confirmation and device authorization remain mandatory; onchain signing/fee preparation still requires its separate explicit action. Shared scanner-success background and duplicate/stale-session guards remain intact.

40 affected tests, TypeScript and changed-file lint passed, including automatic one-time handoff, amountless entry followed by a single Continue, rejected late/locked results, handoff failure recovery and explicit onchain preparation. Device acceptance remains with the owner.

## Keep the recognized-scanner background — 22 September 2026

Recognition, Bitcoin amount entry and payment review now share the same scanner-success scene: original header, gradient, green corner frame and checkmark. Remove the separate Bitcoin-logo backdrop from the amount/review sheets. Camera capture/release behavior is unchanged. Inline scan handoff selects its destination/source together to avoid briefly rendering the legacy address form. Only the bottom-sheet content changes between these steps.

33 affected regression tests, TypeScript and changed-file lint passed. Native visual acceptance remains with the owner.

## Receive currency symbols and matching asset cards — 22 September 2026

Receive's EUR/SAT selectors now include a euro symbol and the existing Bitcoin logo, with explicit accessible currency labels. Home's HBAR card matches the Bitcoin layout: asset name, unit exchange rate (`1 HBAR = … €`) and balance. Cached/missing rates retain their last-known/loading/unavailable states; no extra network request. The previous account-copy icon and separate fiat-total line are removed from this card. Remove the hidden-entry reveal/conceal toggle while preserving existing hidden records, reconciliation and duplicate-send protection.

30 affected regression tests, TypeScript and changed-file lint passed. Device visual acceptance remains with the owner.

## Compact Bitcoin payment sheets — 22 September 2026

Bitcoin amount entry and review now continue in native bottom sheets matching the scanner. Amount entry shows a compact recipient, large amount field, SAT/EUR selector and one Continue action. Review prioritizes exact SAT amounts, maximum fee and maximum total; request strings, unverified descriptions and technical details expand from the recipient row. A short relative-fee notice replaces the incorrect suggestion to ask for Lightning when already paying over Lightning. The tab bar stays hidden through these steps. Back navigation, device authorization, quote preparation and duplicate-send protections remain; onchain preparation still requires separate explicit approval. Sheets hide on blur/background and cannot be dismissed during submission. English, German, French and Spanish supported.

324 automatic tests, TypeScript and changed-file lint passed. The owner confirmed the previous scanner lifecycle correction works well; camera behavior is unchanged by this update. Native payment-sheet layout, keyboard and device authorization acceptance remain with the owner.

## Scanner camera lifecycle restored — 22 September 2026

Following the owner's report of unreliable QR detection after the redesign, restore the earlier scanner's simple camera lifecycle while retaining the full-screen design, torch, Paste/Type dock and review sheets. QR detection stays enabled for the lifetime of each mounted camera; capturing a code releases the camera and retrying mounts it afresh. Remove imperative preview pause/resume and barcode-handler enable/disable transitions. Session validation, duplicate-event protection and explicit payment review remain intact.

320 automated tests, TypeScript and changed-file lint passed, including cancellation during Lightning-address recognition and returning from manual entry. The lifecycle race is a suspected cause, not a device-confirmed diagnosis; physical QR acceptance remains with the owner.

## Full-screen scanner and recognized-payment step — 22 September 2026

Implement the supplied scanner concept with a full-screen camera, soft dark overlays, open yellow corners, a hardware-gated torch and a shared Paste/Type action bar. Manual entry opens a native bottom sheet. Validated codes show a green confirmation and genuine request details, then require a separate Review payment action. Recognition cannot send, request a signing quote or create a Lightning invoice. Existing payment validation, fees, authentication and duplicate protection remain intact. The tab bar is hidden only during scanning and restored with the existing layout afterward. All copy is available in EN/DE/FR/ES.

319 app tests, TypeScript, lint, native crypto tests and Android build passed. Verified regular wallet update installed at 16:17:18 on Android …8690 with the original first-install timestamp preserved. Further native interaction/camera tests are explicitly left to the owner. Final keyboard-focus corrections passed static checks but have no post-fix device acceptance. Artifact and test limitations are recorded in PUBLIC_RELEASE_READINESS.md and TEST_ACCEPTANCE_2026-09-22.md.

## Scanner presentation refined — 22 September 2026

Replace the two small scanner tiles with full-width actions: a yellow **Paste address** action with a clipboard explanation and a quiet **Enter address** action with a typing explanation. Use a compact camera preview with corner markers, a short scan instruction and a reminder that amount and fees are reviewed before sending. Manual entry now has a larger address field, an integrated paste action and a visible return to the scanner. Copy is translated into all four supported languages; text can wrap and controls grow with system text size.

311 app tests, TypeScript, changed-file lint, native crypto unit tests and the Android build passed. Synthetic scanner layouts inspected at 360×740 and 320×568; manual entry and back navigation checked in the browser. Verified update installed at **15:42:48** on Android ending **8690**, with original first-install timestamp preserved. Locked startup succeeded without observed runtime errors. Live camera and native large-text acceptance remain owner checks; no payment was sent.

## Scanner as the Send entry — 22 September 2026

Send now opens the camera directly, with visible **Enter manually** and **Paste** actions. The Home scanner uses the same component and controls. Camera denial or failure leaves both alternatives available; the clipboard is read only after a tap. The camera unmounts on tab changes/backgrounding, duplicate detections are consumed once, and late clipboard reads cannot populate another screen or a locked session.

Scanned and pasted requests enter the existing session-bound input queue; manual requests use the same asset detection. Lightning, Bitcoin onchain and numeric Hedera recipients retain their existing amount, fee, network, expiry and authorization checks. Onchain recognition never signs or sends; fee preparation and final payment still require their explicit approvals. Manual entry has a visible back-to-scanner action, including the HBAR form. Translations cover English, German, French and Spanish.

311 app tests, TypeScript and changed-file lint passed. Synthetic browser views were inspected at 360×740 and 320×568; this does not replace a live-camera/real-payment device check. Verified Android update installed at 15:26:53 on device ending 8690 with wallet data preserved; locked startup succeeded without observed runtime errors. Live-camera acceptance remains with the owner. Artifact evidence: PUBLIC_RELEASE_READINESS.md.

## Pending Lightning recovery — 22 September 2026

After an interrupted send loses its provider request ID, reconciliation now also searches Spark's paginated payment-request index. Transfer history alone can miss a request that has not yet appeared there. Newly discovered request IDs remain persisted even if history is unavailable; absence never implies failure, and success still requires a matching payment proof. Request searches are shared per reconciliation pass and only run for pending payments after Bitcoin balances load.

Home makes pending-payment status easier to see. Unresolved or failed history entries use neutral incoming/outgoing titles instead of claiming payment success, and display date and time. The update passed 287 app tests, TypeScript and changed-file lint and was installed without clearing wallet data. The real 20-SAT interruption case still awaits final device resolution; P05 remains yellow.

The owner recheck still found no matching provider request or history entry. A further correction adds a read-only Spark-operator lookup by payment hash and sender role. It confirms only a verified payment preimage; missing data never marks an uncertain send as failed or permits a duplicate. Home and outgoing Lightning history now say the status is unknown rather than claiming active processing. 292 app tests, TypeScript and changed-file lint passed. The verified Android update was installed at 12:51 without clearing wallet data; real P05 resolution is still open.

The operator follow-up also found no matching remote record. Final balance checks now run before an outgoing attempt is persisted; persistence and reauthorization still precede any SDK send. This prevents preparation-only failures from creating new unresolved records, without clearing older ambiguous attempts. Four additional regression cases bring the suite to 296 passing tests. The verified preparation fix was installed at 13:05:57 without clearing wallet data. The historical 20-SAT outcome remains a documented integration blocker; no repeated payment was sent.

Pending Lightning entries can be hidden from normal history together with their persistent notice. This changes presentation only: the journal, status checks and same-invoice duplicate guard remain intact. Hidden entries can be shown again, and a final outcome automatically becomes visible. 301 app tests, TypeScript and lint passed. Verified Android update installed at 13:26:05 with wallet data preserved. Device acceptance of the requested existing entry remains open after the owner reported the unclear status again. The existing P05 outcome remains unknown.

## Home layout restored — 21 September 2026

At the owner's request, Home again uses the earlier compact logo, balance layout, Bitcoin asset card and three circular actions: Send, Swap and Receive. Remove the extra Bitcoin heading/BTC line, explanatory disclosure and two large rectangular actions from Home; Swap is again immediately visible and still shows its existing coming-soon notice. Keep the available-balance correction, loading/stale states, incoming/pending-payment notices, automatic reconciliation, Advanced options and lazy shared history. Other payment screens are unchanged.

The Bitcoin card now replaces its route-description subtitle with the existing market feed's BTC/EUR unit price (`1 BTC = …`). Cached or older-than-five-minute quotes are explicitly labelled; missing quotes show loading/unavailable, never zero. Existing balance-loading/error notices retain priority. Translated in all four supported languages; no extra startup network call.

Hide empty network badges instead of leaving an unlabelled dark pill beside Bitcoin. The shared Bitcoin asset icon now renders the public-domain Bitboy vector from the [Bitcoin Design Guide](https://bitcoin.design/guide/getting-started/visual-language/) at its original proportions, without the previous pale border or small font glyph. HBAR styling and labelled test-network badges are retained.

## One Bitcoin balance and native payment UI — 21 September 2026

- Replace route-based Bitcoin presentation with one Bitcoin asset and prominent EUR valuation/BTC amount. Keep HBAR and its existing payment/security flows under Advanced options. Send recognises the payment route; both routes share a cost review. Receive offers an actual Lightning request and a separate reusable Bitcoin deposit address.
- Use only validated Spark `available` funds for display and spending. Pending incoming funds are separate. Invalidate only old Bitcoin cache values whose definition could include incoming transfers; do not modify wallet keys or the existing Lightning/HBAR journals.
- Implement actual Spark 0.7.12 withdrawal and static-deposit claim adapters, strict Bitcoin address/URI parsing, integer amounts, approved fee ceilings, session checks and persistent unknown-outcome reconciliation. Quoting can sign an internal Spark swap, so onchain preparation requires explicit device authorization; scan/paste alone never invokes it.
- Retain earlier/expired Lightning requests and watch shared Bitcoin addresses after restart. Avoid startup address/quote generation, and defer status work until the primary Bitcoin balance has loaded. A claim is not automatically credited as spendable.
- 270 app tests, TypeScript, lint and Android build passed. Native main views captured with synthetic data in all four languages, including keyboard and large-text review. No real payment was sent. Combined receive URI, external sender/claim tests, provider failure recovery, full onchain-history reconstruction and iOS remain open. See [Bitcoin implementation and acceptance](BITCOIN_PAYMENT_ACCEPTANCE.md) for exact limits, migration, SDK behavior and the concrete partner test matrix.
- The final candidate updated Android ending 8690 at 13:00:05; installed hash and 65 bundled source modules verified, wallet data preserved, cold locked launch without observed runtime errors. Exact evidence is recorded in release readiness.

## Lightning completion work P01–P05 — 21 September 2026

- Validate BOLT11 signatures, exact network prefixes and the one-hour default expiry. LNURL review shows the endpoint domain and description; callbacks must match the selected amount and any h-tag must match the original metadata bytes.
- Recheck the balance, invoice expiry and device authorization before sending; retain the exact approved fee ceiling. Bound SDK waits. A timed-out/ambiguous submission remains pending, blocks another submission of the same invoice and can reconcile after restart. Transfer/preimage errors alone do not mean the recipient was unpaid.
- Recognize the pinned SDK's specific local fee-ceiling rejection before leaf selection as a definite non-submission. Ask for a new review instead of leaving that request pending. Similar transport-error text without the SDK's structured validation context remains ambiguous.
- Preserve expired receive requests for status reconciliation while hiding their QR. Show waiting, processing, expired and interrupted-connection states in all four languages. A verified receipt stays successful even if the optional local activity index fails. The success view dismisses after three seconds. Late completion cannot overwrite a newer request or a locked session.
- Check only pending sends automatically on Home, after the primary Bitcoin balance settles. With no pending sends there is no automatic remote history query; normal shared history stays collapsed and opt-in. Journal network reads no longer block durable writes, and stale failures cannot downgrade a confirmed payment.
- A scan made before Spark is ready now waits for initialization and prepares once. Leaving Send invalidates an unfinished review preparation.
- 245 app tests passed, with TypeScript and changed-file ESLint. New cases use synthetic invoices, an independent published signature vector, fake services, restartable storage and controlled timers. Real Mainnet payments, native authentication/QR repetition, connectivity/process-death acceptance and second-device/iOS checks remain open; see the acceptance runbook. No payment was sent by automation.
- Final candidate installed on Android ending 8690 at 11:52:35 with wallet data preserved. APK signature/hash and 48 source-map modules verified; locked launch passed with zero observed runtime errors. See release readiness for exact artifact evidence.

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
