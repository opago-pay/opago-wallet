# Opago Wallet

Opago Wallet is an Expo/React Native proof of concept for Lightning, Solana, USDC-on-Solana, OpenCryptoPay-style checkout negotiation, and an eID/Travel-Rule hand-off.

This repository is not a bank, licensed VASP, audited wallet, or proof of legal compliance. The bundled eID service and merchant servers are reference/demo components. Obtain independent security, privacy, and regulatory review before handling real identities or funds.
See SECURITY.md for the current dependency-audit status and release blockers.

## Safety model

The application starts on safe development networks:

- Spark uses REGTEST.
- Solana uses devnet.
- Bitcoin mainnet invoices are rejected in this mode.
- Solana RPC responses are checked against the expected cluster genesis hash.
- Mainnet is enabled only when EXPO_PUBLIC_ENABLE_MAINNET=true is explicitly built into the app.
- Public HTTP endpoints are rejected. Local/private HTTP additionally requires the development-only EXPO_PUBLIC_ALLOW_INSECURE_HTTP=true flag.
- OCP quotes have an ID and expiry; execution responses must exactly match the reviewed method, asset, and amount.
- Lightning invoices are decoded, checked for expiry and exact amount, and paid with an idempotency key and bounded fee.
- Receive confirmations are matched to the expected Lightning payment hash and amount, or to a confirmed incoming Solana balance delta.
- Recovery phrases are native-only, stored with SecureStore, protected by device authentication when available, hidden on background/after 30 seconds, and screen capture is blocked while shown.
- Wallet data is deliberately unavailable on web because browser storage is not accepted for seed material.

EXPO_PUBLIC_* values are part of the client bundle. Never put secrets in them.

## Requirements

- Node.js 20.19 or newer
- npm
- Expo development tooling
- A native Android or iOS build for wallet-key storage

## Setup

~~~powershell
Copy-Item .env.example .env
npm ci
npm run typecheck
npm run lint
npm test
npm start
~~~

Fill in EXPO_PUBLIC_PRIVY_APP_ID and EXPO_PUBLIC_PRIVY_CLIENT_ID before starting. For local HTTP demo servers, set EXPO_PUBLIC_ALLOW_INSECURE_HTTP=true only in a development build.

USDC transfers on devnet require an explicit EXPO_PUBLIC_USDC_MINT. The mainnet USDC mint is selected only in an explicitly enabled mainnet build.

## Hedera Phase 1 testnet

The app derives a Hedera Ed25519 key at m/44'/3030'/0'/0', looks up its testnet account through the Mirror Node, and signs bounded HBAR test transfers on-device. Open Settings in the app and copy the displayed Hedera public key.

Account lookup/creation and initial funding are deliberately separate from the app. Run the provisioning script only on the local development machine. Operator credentials must never be prefixed with EXPO_PUBLIC_, committed, or copied into the app configuration:

~~~powershell
$env:HEDERA_WALLET_PUBLIC_KEY='PUBLIC_KEY_COPIED_FROM_THE_APP'
$env:HEDERA_OPERATOR_ID='0.0.YOUR_TESTNET_OPERATOR_ACCOUNT'
$env:HEDERA_OPERATOR_KEY = [System.Net.NetworkCredential]::new(
  '',
  (Read-Host 'Hedera testnet operator key' -AsSecureString)
).Password
$env:HEDERA_INITIAL_BALANCE_HBAR='2'
npm run hedera:provision
~~~

If the public key already has an account, the script reports it without requiring operator credentials. After provisioning, remove all sensitive process variables:

~~~powershell
Remove-Item Env:HEDERA_OPERATOR_KEY -ErrorAction SilentlyContinue
Remove-Item Env:HEDERA_OPERATOR_ID -ErrorAction SilentlyContinue
Remove-Item Env:HEDERA_WALLET_PUBLIC_KEY -ErrorAction SilentlyContinue
Remove-Item Env:HEDERA_INITIAL_BALANCE_HBAR -ErrorAction SilentlyContinue
~~~

Return to Settings, tap Refresh, enter a different numeric testnet account ID, and confirm the transfer. Phase 1 is hard-limited to testnet and at most 1 HBAR per transfer by default.


## Mainnet builds

Treat mainnet enablement as a release decision, not a runtime convenience:

~~~text
EXPO_PUBLIC_ENABLE_MAINNET=true
EXPO_PUBLIC_SOLANA_RPC_URL=https://your-authenticated-mainnet-rpc.example
EXPO_PUBLIC_EID_BACKEND_URL=https://your-eid-backend.example
~~~

Before releasing, replace the public exchange-rate API, configure monitored RPC infrastructure, validate the complete Spark/Atomiq deployment, run native device tests, and obtain an external audit.

## Demo services

The scripts fail closed instead of manufacturing successful payments.

### OCP merchant

Configure at least one real destination for the chosen development network:

~~~powershell
$env:OCP_DEMO_SOLANA_DESTINATION='YOUR_DEVNET_ADDRESS'
$env:OCP_DEMO_BIND_HOST='0.0.0.0'
$env:OCP_DEMO_PUBLIC_URL='http://192.168.1.20:3333/ocp'
npm run demo:ocp
~~~

A quote expires after 60 seconds by default and can be executed once. Lightning is offered only when OCP_DEMO_LIGHTNING_INVOICE is supplied.

### eID reference backend

Explicit demo mode requires a bearer secret and never auto-completes:

~~~powershell
$env:EID_DEMO_MODE='true'
$env:EID_DEMO_SECRET='replace-with-a-long-random-secret'
npm run eid-backend
~~~

The backend prints the demo session ID after the app starts a verification. Complete that exact session manually:

~~~powershell
$headers = @{ Authorization = 'Bearer replace-with-a-long-random-secret' }
Invoke-RestMethod -Method Post -Headers $headers -Uri 'http://127.0.0.1:5555/api/eid/session/SESSION_ID/demo-complete'
~~~

Non-demo use is intentionally blocked unless EID_ALLOW_IN_MEMORY_REFERENCE_BACKEND=true is set, a persistent Ed25519 key is provided, and the provider callback and tcToken URL are configured. Even then, this script remains an in-memory reference service and needs production storage, rate limiting, observability, key management, data-retention controls, and an actual eID provider integration.

### Travel Rule merchant

The merchant verifies the exact signed payload, proof lifetime, and one-time use. It returns no placeholder invoice. Configure EIDAS_DEMO_INVOICE or a JSON invoice provider through EIDAS_DEMO_INVOICE_URL, then run:

~~~powershell
npm run demo:travel-rule
~~~

See TESTING_EIDAS.md for the complete local sequence.

## Project checks

- npm run typecheck: strict TypeScript compilation
- npm run lint: Expo ESLint checks
- npm test: payment success/failure, amount binding, wallet derivation, Solana parsing, OCP/eID replay, and URL-policy tests
- node --check server/eid-backend.js: backend syntax check

Payment code is concentrated in lib/lightning.ts, lib/payments.ts, lib/solana.ts, lib/lnurl-safe.ts, lib/ocp-safe.ts, and lib/eid.ts. UI screens should orchestrate these services and must not reintroduce payment fallbacks. The reference eID service lives under server/, while presentation-only merchants live under demo/.
