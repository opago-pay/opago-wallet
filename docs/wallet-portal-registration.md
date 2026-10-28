# Wallet registration through the Portal

The account screen uses the same discovered Broker authorization endpoint for
sign-in and registration. It never guesses a Portal URL or sends a native signup
request. The Portal must preserve the original opago-wallet client, callback,
state, nonce and S256 challenge while offering its private-account signup form.
The Wallet never receives or stores the browser password or Turnstile token.

## Delivery order

1. Merge Dashboard [#181](https://github.com/opago-pay/opago-dashboard/pull/181),
   then [#182](https://github.com/opago-pay/opago-dashboard/pull/182), and deploy
   the combined Portal before distributing this Wallet build.
2. Operations must point the Broker website login URL at the deployed Portal
   login route and verify that public API authorization, token, JWKS and the
   required discovery routes are accessible to the native client.
3. Build an Android preview from the merged MVP revision and record build ID,
   revision and version code. A previous APK does not include these changes.
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
