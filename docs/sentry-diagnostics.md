# Optional crash diagnostics

Sentry project: `opago-gmbh/react-native`. The public DSN uses the German ingestion endpoint provided by the owner. This integration is independent of wallet authentication, balances, signing and payment services.

## Runtime behavior

- Enabled in native release builds; disabled in development and web builds.
- Set `EXPO_PUBLIC_SENTRY_ENABLED=false` before building to disable initialization entirely, including early iOS startup. The native switch is baked into Info.plist; a JS-only OTA update cannot change the native switch.
- iOS starts through `OpagoNativeCrashDiagnostics` at the beginning of AppDelegate's launch method, before the React Native factory. JS sets `autoInitializeNativeSdk=false` on iOS so its native filter is never replaced. Android retains the existing JavaScript-only capture.
- Native options are constructed with `SentryOptions.init`, validated for a DSN and the default scope callback, then passed to `RNSentryStart` with its React Native defaults and duplicate suppression. This does not depend on a bundled `sentry.options.json`. The previous `RNSentrySDK.startWithConfigureOptions` file loader passed nil options to Cocoa when that file was absent, causing Build 22 to crash in `SentrySDKInternal.startWithOptions` before the crash handler or JavaScript started. An Objective-C `@catch` cannot catch that SIGSEGV.
- SDK loading/initialization and screen-tag updates are guarded. No wallet operation waits for a Sentry request, checks subscription status or requires Sentry credentials.
- Native SDK transport stores already-filtered JavaScript events for later delivery, with at most 10 cached envelopes and 10 pending transport items. SDK handling of an already-fatal JS exception has a bounded 500 ms flush window.
- A disabled DSN, quota exhaustion or a service outage can lose diagnostics; these do not become wallet errors.
- No Sentry wrapper or error recovery UI changes the payment flow. Diagnostic capture does not retry payments or reinterpret payment results.

## Data boundary

`lib/sentry-privacy.ts` constructs a new event from an allowlist. It retains a standard JS error class, fixed error-category text, bundle line/column offsets, source-map debug IDs, release/build identifiers, OS version and a coarse screen label. Source maps reconstruct function names on Sentry's side. Arbitrary error messages and original function names are withheld.

Requests, headers, response bodies, free-form context, local variables, user identity, payment identifiers, values, breadcrumbs, attachments, screenshots and view hierarchies are excluded. Console/network instrumentation, tracing, replays, logs, session tracking and global Promise replacement are disabled. The event uses a fixed placeholder IP; like any HTTPS service, the ingestion service still receives the connecting network address.

iOS native crash collection now has its own native `beforeSend` filter in `plugins/native/OpagoNativeCrashDiagnostics.m`. It constructs fresh event/exception/thread/frame/image objects, retaining known crash classes, numeric thread IDs, code addresses, Mach-O UUIDs and image sizes/VM addresses for dSYM symbolication. Native function names, binary paths, registers, memory contents and exception text are withheld. A coarse screen label and the fixed `diagnostic_test=native` tag may be retained. Memory introspection, attachments, screenshot/view-hierarchy capture and automatic breadcrumbs are disabled before the SDK starts. Sentry's local raw crash cache may still contain OS crash details before filtering; it is not an Opago wallet log or an upload of the original report.

App-hang, watchdog and MetricKit reports remain disabled. Apple reports remain available alongside Sentry. This does not promise capture of uncatchable OS kills (including memory pressure), crashes before this startup hook, or delivery while the service is unavailable. Native reports generally upload after the app is reopened. The RNSentry native wrapper suppresses duplicate React Native JS exceptions; fatal JS diagnostics still use the existing JS filter and queue.

## EAS setup still required

1. In Sentry, create an organization upload token for source maps/releases for `opago-gmbh/react-native`.
2. In the Expo project, add `SENTRY_AUTH_TOKEN` to the **production** EAS environment with secret or sensitive visibility. Keep it out of chat, source control, `app.json`, and all `EXPO_PUBLIC_*` variables.
3. Create a new native release build. The Sentry Expo plugin configures source-map and debug-symbol uploads when the token is available. Existing TestFlight builds do not acquire the SDK retroactively.
4. Confirm successful **source-map and dSYM** upload in build logs. A successful build alone does not prove these uploads succeeded.

No new secret is needed: the existing `SENTRY_AUTH_TOKEN` in **production** uploads both source maps and native debug symbols. Do not set `SENTRY_DISABLE_AUTO_UPLOAD=true` or `SENTRY_DISABLE_XCODE_DEBUG_UPLOAD=true` for a build that should upload symbols. Native changes require a new binary; an OTA update is insufficient. Builds must regenerate the ignored native directories from app.config.js; committed/pre-existing native projects require running prebuild before building.

### Optional manual iPhone acceptance test

For the acceptance build, set the non-secret **plain text** EAS production variable `EXPO_PUBLIC_SENTRY_TEST_CONTROLS=true` before the manual build. The default is false. This reveals **Settings → Advanced → Crash diagnostics test** in an iOS release build. It requires an explicit destructive confirmation and is never invoked on startup, by a URL, or by a payment.

1. Build/install manually, open the app, go to that button, confirm the deliberate crash, then reopen the app with internet access.
2. In `opago-gmbh/react-native`, inspect the new native report (`diagnostic_test=native` when the native scope has persisted). Verify native frames resolve to functions using uploaded dSYMs, rather than only raw addresses. The deliberately triggered error text is replaced with the fixed privacy summary.
3. Confirm the report has no wallet identifiers, amounts, seed/key material, request/response content, device name, attachments, registers or screenshots. Confirm navigation and wallet use work again after reopening.
4. Set `EXPO_PUBLIC_SENTRY_TEST_CONTROLS=false` (or remove it) before the later public release build. Leave `EXPO_PUBLIC_SENTRY_ENABLED` unset or true for capture.

Use a dedicated test wallet and perform no payment during the deliberate crash check. The test does not send a transaction.

Without an upload token, configuration disables automatic uploads. EAS profiles set `SENTRY_ALLOW_FAILURE=true`, a 10-second upload HTTP timeout and one HTTP retry: an unavailable service does not intentionally fail the build. A successful build alone does **not** prove successful source-map upload. For a local native build with uploads enabled, set these same environment variables. `SENTRY_DISABLE_AUTO_UPLOAD=true` explicitly disables uploads during prebuild.

The current custom Metro resolver and its Spark/router compatibility fixes remain in place. Generated native directories must be regenerated through the normal native build process to include Sentry; do not delete a development checkout's native changes blindly.

## Verification

`tests/sentry-diagnostics.test.cjs` covers JS secret stripping, source-map offsets, attachments, disabled instrumentation, startup without the SDK, partial initialization failure, disabled builds, platform-specific initialization, opt-in test controls and upload configuration. `tests/native-crash-project.test.cjs` verifies the generated iOS project's early hook, linked Objective-C source, bridging header, native kill switch and dSYM build phase. `tests/ios/OpagoNativeCrashPrivacyTests.m` supplies native privacy regression cases, including options construction without a JSON resource, a callable default scope, missing/invalid DSN handling and React Native duplicate suppression; run it in an iOS XCTest target hosted by the generated app on macOS, with the generated app source folder in the header search path. Those XCTest cases cannot be executed on Windows.

SDK is pinned to React Native 8.28.0 / Cocoa 9.29.0. Any SDK or Expo template upgrade must recheck native model/option APIs and filter wiring. Project generation and JS checks on Windows do not establish Objective-C compilation, iPhone delivery or symbolication; these remain acceptance checks for the user's later manual build.
