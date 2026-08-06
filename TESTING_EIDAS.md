# eID / Travel Rule demo test

This is an explicit development demo. It is not an eIDAS certification, legal opinion, production VASP service, or authorization to process identity data.

## 1. Configure the app

Use private LAN addresses when testing on a physical device:

~~~text
EXPO_PUBLIC_EID_BACKEND_URL=http://192.168.1.20:5555
EXPO_PUBLIC_ALLOW_INSECURE_HTTP=true
~~~

Restart Expo after changing EXPO_PUBLIC_* values. Never enable local HTTP in a production build.

## 2. Start the reference backend

~~~powershell
$env:EID_DEMO_MODE='true'
$env:EID_DEMO_SECRET='replace-with-a-long-random-secret'
$env:EID_BIND_HOST='0.0.0.0'
npm run eid-backend
~~~

The service uses an ephemeral Ed25519 key in demo mode. It creates sessions in PENDING state and does not auto-approve them.

## 3. Start the merchant

The merchant must receive a real, unexpired invoice from your own regtest/demo setup. Choose one option:

~~~powershell
$env:EIDAS_DEMO_INVOICE='YOUR_CURRENT_REGTEST_BOLT11_INVOICE'
~~~

or:

~~~powershell
$env:EIDAS_DEMO_INVOICE_URL='https://your-controlled-invoice-provider.example/callback'
~~~

Then expose the LAN callback and start the server:

~~~powershell
$env:EIDAS_DEMO_BIND_HOST='0.0.0.0'
$env:EIDAS_DEMO_PUBLIC_BASE_URL='http://192.168.1.20:4444'
$env:EIDAS_BACKEND_URL='http://127.0.0.1:5555'
npm run demo:travel-rule
~~~

The server prints an LNURL and QR code.

## 4. Run the flow

1. Scan the merchant LNURL in the Send screen.
2. Enter the exact LNURL amount and continue.
3. Start identity verification. The app creates a PENDING backend session and opens AusweisApp.
4. Copy the session ID printed by the backend.
5. Complete only that session with the configured bearer secret:

~~~powershell
$headers = @{ Authorization = 'Bearer replace-with-a-long-random-secret' }
Invoke-RestMethod -Method Post -Headers $headers -Uri 'http://127.0.0.1:5555/api/eid/session/SESSION_ID/demo-complete'
~~~

6. Return to Opago Wallet. If necessary in an emulator, trigger the normal app deep link:

~~~powershell
npx uri-scheme open opagowallet://eid-success --android
~~~

The app polls the exact session. Only SUCCESS with signed payer data continues. The merchant reconstructs the canonical payload, verifies the Ed25519 signature and expiry, rejects replay, and then returns the configured invoice. The app independently decodes that invoice, checks network, expiry, and exact amount, and only then requests payment.

## Expected failure cases

- Wrong or absent demo bearer secret: 401.
- Unknown, expired, or already completed session: 404/409.
- Missing or modified payer data: merchant returns ERROR.
- Replayed identity proof: merchant returns ERROR.
- Missing invoice configuration: merchant returns ERROR; no placeholder invoice is emitted.
- Mainnet invoice in the default safe build: wallet rejects it.
- Public HTTP or local HTTP without the explicit development flag: wallet rejects it.

For provider-connected testing, use the authenticated session callback instead of demo-complete and supply verifiedData from the configured eID provider. The bundled backend remains in-memory and is not a production identity system.
