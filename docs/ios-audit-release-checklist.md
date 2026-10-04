# iOS audit fixes and release acceptance

Status: 4 October 2026. Code changes are implemented; native acceptance and external publication remain open. This is not an App Store approval guarantee.

## Scope and integration

This branch starts from current main. Existing local pilot/account-activation work remains separate. The diagnostics-consent implementation is included because main's privacy policies already promise opt-in diagnostics. The activation translations are complete for the separately developed API; this PR does not enable that API or include pilot credentials.

| Audit finding | Implementation | Remaining acceptance |
| --- | --- | --- |
| Unavailable purchase | Home has Receive/Send only; old /buy links redirect Home | Capture new Home screenshots; confirm no purchase claim in App Store Connect |
| Privacy mismatch | Consent gates JS and native diagnostics; one canonical policy URL; conditional activation flow documented in DE/EN policies | Operator approves and publishes updated policies; verify actual EAS environment, network traffic, recipients, retention and deletion |
| Timed receive result | Success remains until Done or Request another payment | Wait 30 seconds with VoiceOver and follow both actions |
| VoiceOver | iOS status announcements, heading focus, default button roles/disabled state, recovery errors | End-to-end device reading/focus, including receipt return and native authentication |
| Large text | Scrollable inset-aware results and payment actions, stacked receive actions, nonshrinking primary amounts | Smallest supported iPhone at maximum accessibility text and all five languages |
| Keyboard | Automatic iOS insets, interactive dismissal, Done accessories | Recipient/amount/account input and errors remain reachable |
| Localization | Complete activation catalogs and five native permission localizations | First permission prompt under each iOS app language; long translations |
| Contrast | Shared inputs use semantic muted color | Real dark/light/increased-contrast rendering |
| Native navigation | Route removal guarded during preparation/review/submission; reviewed draft can return to input | iOS edge swipe, cancel, repeated gestures and app interruption; single submission |

## Required iPhone checks — not completed in this environment

- [ ] Smallest supported iPhone and a large current iPhone; minimum supported iOS and current iOS. No clipped text or controls under safe areas.
- [ ] All five languages, maximum Dynamic Type, Bold Text, VoiceOver, light/dark/system appearance, Increase Contrast and Reduce Motion.
- [ ] Create/restore, unlock, verify backup, reveal protected recovery words and remove local wallet; no secret announcements or background exposure.
- [ ] Scan permission allowed/denied/permanently denied; manual paste and typing remain available. Face ID cancellation and failure do not submit.
- [ ] Send Bitcoin on-chain, Lightning and HBAR using isolated test wallets; review exact amount, recipient and fee before authentication.
- [ ] Rapid taps, edge swipe during authentication/submission, foreground/background, network timeout and process restart: at most one send; uncertain results stay pending and remain findable.
- [ ] Receive: durable result after 30 seconds; Done, receipt and another request; foreground return from browser.
- [ ] Large text and keyboard together: every field, error and action reachable. Numeric keyboards have a usable Done action.
- [ ] Diagnostics off on clean installation; opt in, restart, revoke and restart. Confirm JS and pre-JS native handling match the saved choice. Revocation must not break wallet functions.

## Signed archive and operator checks — not completed

- [ ] Build with Apple's required Xcode/iOS SDK versions. Inspect generated Info.plist, entitlements, native permission strings and SDK privacy-manifest aggregation, including required-reason APIs and SDK signatures.
- [ ] No NSMicrophoneUsageDescription or microphone entitlement/request for QR scanning. All five InfoPlist.strings variants are bundled.
- [ ] Validate encryption/export answers for the actual dependencies; do not infer an exemption from the existing configuration flag.
- [ ] Verify organization developer account and actual countries/features. Account deletion requirements depend on any service account actually created; removing keys cannot erase public blockchain history.
- [ ] Compare App Privacy answers with the release build's traffic, including SDKs, optional diagnostics and any separately introduced activation API.
- [ ] Before enabling an activation service, document public-key/proof processing, IP logging, purpose/legal basis, retention, operator access and deletion. No guessed retention period or backend deletion claim.
- [ ] Approve and publish the updated DE/EN policies at https://www.opago.com/wallet/privacy/ and verify public access before wallet creation. Repository updates do not publish the website.
- [ ] Replace historical screenshots from the final signed build. Images 01 and 07 contain the removed Buy action and must not be submitted. Verify remaining images against current UI too.
- [ ] Review metadata, age-rating questionnaire, reviewer access and funded test cases in App Store Connect. Accessibility labels require successful device evaluation.

## Sources and classification

Mandatory review requirements: [2.1 completeness](https://developer.apple.com/app-store/review/guidelines/#app-completeness), [2.3 metadata](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata), [5.1.1 privacy](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage), [3.1.5 cryptocurrency](https://developer.apple.com/app-store/review/guidelines/#cryptocurrencies).

Design recommendations: [VoiceOver](https://developer.apple.com/design/human-interface-guidelines/voiceover), [layout](https://developer.apple.com/design/human-interface-guidelines/layout), [entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data), [gestures](https://developer.apple.com/design/human-interface-guidelines/gestures), [dark mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode).

Shared React Native helpers are an implementation choice, not an Apple framework requirement. Passing automated tests does not establish native accessibility or review acceptance.
