# Wallet registration through the Portal

The account screen uses the same discovered Broker authorization endpoint for
sign-in and registration. It never guesses a Portal URL or sends a native signup
request. The Portal must preserve the original opago-wallet client, callback,
state, nonce and S256 challenge while offering its private-account signup form.
The Wallet never receives or stores the browser password or Turnstile token.

## Delivery and acceptance status — 29 October 2026

1. Dashboard [#181](https://github.com/opago-pay/opago-dashboard/pull/181) and
   [#182](https://github.com/opago-pay/opago-dashboard/pull/182) are merged. Their
   source preserves Wallet context through private-customer signup and email
   confirmation. Confirm the combined Portal is deployed before distributing
   a candidate; a merge alone does not establish deployment.
2. Operations must point the Broker website login URL at the deployed Portal
   login route and verify that public API authorization, token, JWKS and the
   required discovery routes are accessible to the native client.
3. The current audited Wallet source is main commit
   `456e284de7c09824cbff0499b411b6a84e970415` (merged #72). Build a native
   candidate from the selected release revision and record its actual build ID,
   revision and version code. No new signed APK is evidenced by this update;
   do not assume an older APK contains the current source.
4. Test registration, Turnstile rejection/success, email confirmation, HPKE login
   and the exact `com.opago.wallet:/oauth/callback` return on a device. Verify
   token signatures, account switch, cancellation, expiry and client-only logout.
5. Coordinate signup enforcement with Michael after that end-to-end test. Source
   checks and simulated HTTP tests are not evidence that production signup works.

The Wallet's two-minute lock and browser timeout remain unchanged. Signup and
email delivery can take longer: in that case confirm the email, unlock the Wallet
and start a fresh sign-in. An old callback must not reopen a locked Wallet or
reuse an abandoned PKCE transaction. No account authentication implicitly links
or authorizes spending from the local Spark wallet.
