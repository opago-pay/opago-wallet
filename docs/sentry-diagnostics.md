# Optional crash diagnostics

Sentry project: `opago-gmbh/react-native`. The public DSN uses the German ingestion endpoint provided by the owner. This integration is independent of wallet authentication, balances, signing and payment services.

## Runtime behavior

- Enabled in native release builds; disabled in development and web builds.
- Set `EXPO_PUBLIC_SENTRY_ENABLED=false` before building to disable initialization entirely.
- SDK loading/initialization and screen-tag updates are guarded. No wallet operation waits for a Sentry request, checks subscription status or requires Sentry credentials.
- Native SDK transport stores already-filtered JavaScript events for later delivery, with at most 10 cached envelopes and 10 pending transport items. SDK handling of an already-fatal JS exception has a bounded 500 ms flush window.
- A disabled DSN, quota exhaustion or a service outage can lose diagnostics; these do not become wallet errors.
- No Sentry wrapper or error recovery UI changes the payment flow. Diagnostic capture does not retry payments or reinterpret payment results.

## Data boundary

`lib/sentry-privacy.ts` constructs a new event from an allowlist. It retains a standard JS error class, fixed error-category text, bundle line/column offsets, source-map debug IDs, release/build identifiers, OS version and a coarse screen label. Source maps reconstruct function names on Sentry's side. Arbitrary error messages and original function names are withheld.

Requests, headers, response bodies, free-form context, local variables, user identity, payment identifiers, values, breadcrumbs, attachments, screenshots and view hierarchies are excluded. Console/network instrumentation, tracing, replays, logs, session tracking and global Promise replacement are disabled. The event uses a fixed placeholder IP; like any HTTPS service, the ingestion service still receives the connecting network address.

Native crash collection, ANR/app-hang and watchdog reports are deliberately disabled: native events bypass the JavaScript `beforeSend` privacy filter. Apple crash reports remain available for native crashes. The initial scope is the unhandled JavaScript exception class observed in TestFlight build 17. Do not enable native capture without adding and verifying equivalent native filtering.

## EAS setup still required

1. In Sentry, create an organization upload token for source maps/releases for `opago-gmbh/react-native`.
2. In the Expo project, add `SENTRY_AUTH_TOKEN` to the **production** EAS environment with secret or sensitive visibility. Keep it out of chat, source control, `app.json`, and all `EXPO_PUBLIC_*` variables.
3. Create a new native release build. The Sentry Expo plugin configures source-map and debug-symbol uploads when the token is available. Existing TestFlight builds do not acquire the SDK retroactively.
4. Confirm upload success in build logs, then generate a controlled synthetic JavaScript exception on a test device and verify the original source location in Sentry. Never use real wallet data for this check.

Without an upload token, configuration disables automatic uploads. EAS profiles set `SENTRY_ALLOW_FAILURE=true`, a 10-second upload HTTP timeout and one HTTP retry: an unavailable service does not intentionally fail the build. A successful build alone does **not** prove successful source-map upload. For a local native build with uploads enabled, set these same environment variables. `SENTRY_DISABLE_AUTO_UPLOAD=true` explicitly disables uploads during prebuild.

The current custom Metro resolver and its Spark/router compatibility fixes remain in place. Generated native directories must be regenerated through the normal native build process to include Sentry; do not delete a development checkout's native changes blindly.

## Verification

`tests/sentry-diagnostics.test.cjs` covers secret stripping, preserved source-map offsets, attachments, disabled instrumentation, startup without the SDK, partial initialization failure, disabled builds, and upload configuration. A local bundle export checks the Metro integration. Native queue delivery, symbolication and startup on a physical iPhone require the next native build; Windows cannot establish those results.
