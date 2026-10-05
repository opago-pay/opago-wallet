# iOS audit fixes and release acceptance

Status: 5 October 2026. Implemented features are already being tested by more than ten people through TestFlight and Android distribution, as confirmed by Fabian. No separate device acceptance is outstanding for this scope. External publication and operator approvals retain their own status. See [current device testing status](DEVICE_TESTING_STATUS.md).

## Scope and integration

The diagnostics-consent implementation follows the opt-in diagnostics described in the privacy policies. Main includes the verified Hedera Mainnet activation API from PR 33. Production builds include its service URL and exclude pilot credentials.

| Audit finding | Implementation |
| --- | --- |
| Unavailable purchase | Home has Receive/Send only; old /buy links redirect Home |
| Privacy mismatch | Consent gates JS and native diagnostics; one canonical policy URL; conditional activation flow documented in DE/EN policies |
| Timed receive result | Success remains until Done or Request another payment |
| VoiceOver | iOS status announcements, heading focus, default button roles/disabled state, recovery errors |
| Large text | Scrollable inset-aware results and payment actions, stacked receive actions, nonshrinking primary amounts |
| Keyboard | Automatic iOS insets, interactive dismissal, Done accessories |
| Localization | Complete activation catalogs and five native permission localizations |
| Contrast | Shared inputs use semantic muted color |
| Native navigation | Route removal guarded during preparation/review/submission; reviewed draft can return to input |

## Device testing status

The implemented features are in the ongoing user test. The former unchecked iPhone scenario list is removed as an obsolete backlog; it is not converted into invented individual pass results.

## Store and operator checks

The signed production iOS build 46 is available from current main. Store configuration, privacy-manifest declarations and operator approvals are separate from device testing.
- [ ] No NSMicrophoneUsageDescription or microphone entitlement/request for QR scanning. All five InfoPlist.strings variants are bundled.
- [ ] Validate encryption/export answers for the actual dependencies; do not infer an exemption from the existing configuration flag.
- [ ] Verify organization developer account and actual countries/features. Account deletion requirements depend on any service account actually created; removing keys cannot erase public blockchain history.
- [ ] Compare App Privacy answers with the release build's traffic, including SDKs, optional diagnostics and any separately introduced activation API.
- [ ] Before enabling an activation service, document public-key/proof processing, IP logging, purpose/legal basis, retention, operator access and deletion. No guessed retention period or backend deletion claim.
- [ ] Approve and publish the updated DE/EN policies at https://www.opago.com/wallet/privacy/ and verify public access before wallet creation. Repository updates do not publish the website.
- [ ] Replace historical screenshots from the final signed build. Images 01 and 07 contain the removed Buy action and must not be submitted. Verify remaining images against current UI too.
- [ ] Review metadata, age-rating questionnaire, reviewer access and funded test cases in App Store Connect.

## Sources and classification

Mandatory review requirements: [2.1 completeness](https://developer.apple.com/app-store/review/guidelines/#app-completeness), [2.3 metadata](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata), [5.1.1 privacy](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage), [3.1.5 cryptocurrency](https://developer.apple.com/app-store/review/guidelines/#cryptocurrencies).

Design recommendations: [VoiceOver](https://developer.apple.com/design/human-interface-guidelines/voiceover), [layout](https://developer.apple.com/design/human-interface-guidelines/layout), [entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data), [gestures](https://developer.apple.com/design/human-interface-guidelines/gestures), [dark mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode).

Shared React Native helpers are an implementation choice, not an Apple framework requirement. App Store review and operator approvals are separate from the confirmed user device testing.
