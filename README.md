# Opago Wallet

## App Store listing

The images below are historical previews, not verified screenshots of the current iOS release. Replace them from the signed build before submission; see [iOS release acceptance](docs/ios-audit-release-checklist.md).

**Send, receive and pay with Bitcoin. Your everyday wallet.**

<p align="center">
  <img src="docs/app-store-assets/OPAGO_02_Scan_a_QR_Code_6_5.png" alt="Scan a Bitcoin payment QR code" width="168" />
  <img src="docs/app-store-assets/OPAGO_03_Check_Your_Payment_6_5.png" alt="Review the payment amount and fees" width="168" />
  <img src="docs/app-store-assets/OPAGO_04_Paid_Next_6_5.png" alt="Confirmed Bitcoin payment" width="168" />
  <img src="docs/app-store-assets/OPAGO_05_Fund_Your_Bitcoin_Wallet_6_5.png" alt="Top up through the Bitcoin network" width="168" />
  <img src="docs/app-store-assets/OPAGO_06_Top_Up_Lightning_6_5.png" alt="Top up over Lightning" width="168" />
</p>

### Description

Make Bitcoin part of your everyday life. With OPAGO Wallet, you can send, receive and pay with Bitcoin right from your phone. Simple and easy to use, even if you're new to Bitcoin.

**SCAN. CHECK. PAY.**

From a coffee on the go to shopping at a store that accepts Bitcoin: scan the QR code, check the payment details and confirm.

**SEND AND RECEIVE BITCOIN**

Send Bitcoin to friends and family or receive it from others. To get paid, simply share your QR code or payment request.

**FAST PAYMENTS WITH LIGHTNING**

OPAGO supports Lightning for fast Bitcoin payments, making it easy to send and receive even small amounts. You can also transfer Bitcoin over the Bitcoin network.

**EVERYTHING AT A GLANCE**

See your Bitcoin balance and its value in euros. Keep track of past payments and their status, and review the amount and fees before you send.

**YOUR BITCOIN. YOUR CONTROL.**

With OPAGO, you control your Bitcoin. Your recovery words let you restore your wallet on a new device. Keep them somewhere safe.

Alongside Bitcoin, OPAGO also supports HBAR, available under additional coins.

Whether it's your first Bitcoin payment or already part of your daily routine, OPAGO Wallet keeps it simple.

Download OPAGO Wallet and start using Bitcoin in everyday life.

## About this repository

Opago Wallet is a Bitcoin-first mobile wallet built with Expo and React Native. Bitcoin Lightning is the default on Home, Send and Request. HBAR remains available through collapsed **Advanced options**, using the same existing protected recovery phrase and keys.

The default mobile build is intended for development and test networks. The verified Hedera Mainnet contract does not by itself make the Android app an audited production wallet, a licensed financial service, or evidence of regulatory compliance. See [SECURITY.md](SECURITY.md) before using the code with identities or funds.

## Project status

| Capability | Network | Status |
| --- | --- | --- |
| HBAR balance, send, receive, history, and recovery | Hedera testnet | Phase 2 complete; physical-device acceptance verified |
| Contract-bound HBAR checkout and merchant QR demo | Hedera testnet | Phase 3 complete; deployed, source-verified, and physically accepted |
| HBAR checkout contract and release isolation | Hedera mainnet | Contract `0.0.10850063` deployed and source-verified; physical Android canary and Thrive submission completed |
| Lightning send and receive | Spark regtest by default; explicit Mainnet release profile available | Review/authentication, crash-safe journal, receive recovery, paginated history, and local health diagnostics implemented; physical Mainnet acceptance pending |
| Payment-method negotiation | OpenCryptoPay-style local reference service | Prototype |
| eID and Travel Rule hand-off | Local reference services | Disabled in the first-release wallet; reference code only |

Mainnet payments remain disabled in the default build. Hedera Mainnet code paths require the Hedera-specific real-fund flag, a matching build profile, an explicit transfer policy, and the pinned verified contract `0.0.10850063`. The grant candidate enables real HBAR while Lightning remains on regtest.

## Interface readiness

The app supports English, French, Spanish, German and Italian. Choose a language under **Settings → Language**; the selection applies immediately and survives app restarts. On first use, a supported device language is selected, with English as the fallback. Recovery words, addresses, payment identifiers and signing data are never translated.

Unknown balances show a loading indicator and a placeholder instead of zero. Refreshes keep the last known amounts, and failures are labeled explicitly. On Home, Bitcoin balance loading takes priority over an early expansion of HBAR or the shared history. Optional reads wait for that balance attempt, yield a UI frame, and only run for sections the user opened. A failed balance attempt or a 20-second stalled-startup deadline releases optional data without marking Bitcoin ready. Toggling HBAR does not refetch Bitcoin. Pull-to-refresh follows the same priority. The Home QR action opens a dedicated camera screen; an already granted camera permission is read without requesting it again.

Authenticated startup derives the BIP39 seed once for both assets. Android uses a local Expo module and background system PBKDF2; iOS/web retain asynchronous JavaScript derivation. Spark receives seed bytes through its supported API, with the same network and account defaults. Native builds must include `modules/opago-wallet-crypto`; an Android build missing the module fails explicitly. The performance target is a current Bitcoin balance under 7.5 seconds, preferably 5 seconds, measured after authentication on actual devices; a cached preview does not count toward that target.

Home’s main EUR value covers Bitcoin only. HBAR has its own balance and EUR estimate under Advanced options. Directly below those options, one shared transaction history shows Bitcoin and HBAR payments in date order. It starts collapsed and loads both assets only when opened, independently of the advanced asset list; ordinary Bitcoin balance startup does not query HBAR. Send and Request hide the HBAR choice until Advanced options is opened. Explicit HBAR QR codes still lead to clearly labeled HBAR forms and reviews. Security uses the same disclosure for network/key details. Both assets retain one consistent identity system. The consumer flow leads with recipient, amount, balance, and clear actions; long addresses, transaction signatures, payment IDs, and contract details stay available behind explicit copy or details controls. Scalable asset icons and compact network badges make regtest, testnet, and mainnet unambiguous. Long forms remain scrollable on smaller Android screens, and selection, copy, scan, success, and receipt actions expose accessible roles or labels.

See the [native release acceptance checklist](docs/native-release-acceptance.md) and the [dated usability review](docs/design-usability-recheck-2026-09-24.md) for release checks and recorded findings.

## Documentation

See the [documentation index](docs/README.md) for implementation guides, operations runbooks, release checklists, and historical milestone evidence. The [Hedera activation service requirements](docs/hedera-activation-service-requirements.md) describe the planned Opago-funded account activation service.

## Wallet and safety model

- Recovery phrases are available only in native builds and are stored with Expo SecureStore using device-bound, when-unlocked access.
- Device authentication is requested for recovery-phrase access when supported.
- Recovery phrases are hidden when the app backgrounds or after 30 seconds, and screen capture is blocked while they are visible.
- Local wallet deletion remains disabled until three randomly selected words from the paper backup match; that authorization is cleared whenever the app backgrounds.
- Recovery entry stays above the software keyboard, reports only the entered word count, blocks screen capture, and clears phrase state when the app backgrounds.
- Hedera uses a deterministic Ed25519 derivation path from the BIP39 phrase.
- Browser storage is not accepted for seed material; wallet-key operations are disabled on web.
- Public remote endpoints must use HTTPS. Local/private HTTP requires an explicit development-only flag.
- Lightning invoices are checked for network, expiry, payment hash, exact amount, available balance, and bounded fees.
- Lightning payments show a separate review screen and require device authentication in Mainnet builds.
- Outgoing Lightning state is persisted before submission. Timeouts and process death remain pending until Spark returns an explicit failure or a preimage that matches the invoice hash.
- Unexpired incoming Lightning requests survive navigation and restart; Spark history is loaded in bounded pages with a user-controlled activity expansion.
- OCP execution payloads must match the reviewed quote, asset, method, amount, identifier, and expiry.
- Incoming payment confirmations are matched to an expected Lightning payment hash and amount or a new Hedera Mirror Node transaction.

`EXPO_PUBLIC_*` variables are compiled into the client bundle. Never place recovery phrases, private keys, operator keys, faucet keys, bearer secrets, or other credentials in them.

## Technology

- Expo 54 and React Native 0.81
- TypeScript
- Hiero JavaScript SDK for Hedera
- Spark SDK for Lightning
- Expo SecureStore and SQLite

## Requirements

- Node.js `22.23.1` (matching `package.json` and EAS build profiles)
- npm
- Android Studio with a compatible Android SDK and JDK
- A physical Android device with USB debugging, or an Android emulator

Wallet-key storage requires a native Android or iOS build. Device and release evidence is linked from the [documentation index](docs/README.md).

## Quick start

```powershell
git clone https://github.com/opago-pay/opago-wallet.git
Set-Location opago-wallet
Copy-Item .env.example .env
npm ci
```

Run the complete local quality gate:

```powershell
npm run phase5:verify
```

To build, install, and launch the development client on a connected Android device:

```powershell
npm run phase5:android
```

The Windows acceptance command performs the clean install and quality gates, requires exactly one authorized arm64 device, creates the native project, builds and installs the APK, starts Metro, launches the app, and records non-secret commit/lockfile/APK hashes under ignored `.codex-local-evidence/`. The generated `android/` and `ios/` directories are intentionally not committed.

## Hedera testnet provisioning

Open **Settings** in the app and copy the displayed Hedera public key. Account creation and initial funding are deliberately kept outside the app.

Run the following only on a trusted local development machine. Use a disposable, funded Hedera testnet operator account:

```powershell
$env:HEDERA_WALLET_PUBLIC_KEY='PUBLIC_KEY_COPIED_FROM_THE_APP'
$env:HEDERA_OPERATOR_ID='0.0.YOUR_TESTNET_OPERATOR_ACCOUNT'
$hederaOperatorSecret = Read-Host 'Hedera testnet operator key' -AsSecureString
$env:HEDERA_OPERATOR_KEY = [System.Net.NetworkCredential]::new(
  '',
  $hederaOperatorSecret
).Password
$env:HEDERA_INITIAL_BALANCE_HBAR='2'

try {
  npm run hedera:provision
} finally {
  Remove-Item Env:HEDERA_OPERATOR_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:HEDERA_OPERATOR_ID -ErrorAction SilentlyContinue
  Remove-Item Env:HEDERA_WALLET_PUBLIC_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:HEDERA_INITIAL_BALANCE_HBAR -ErrorAction SilentlyContinue
  Remove-Item Env:HEDERA_OPERATOR_KEY_TYPE -ErrorAction SilentlyContinue
  Remove-Variable hederaOperatorSecret -ErrorAction SilentlyContinue
}
```

A `0x`-prefixed, 32-byte MetaMask key is parsed as ECDSA. For an unprefixed 32-byte raw key, set `HEDERA_OPERATOR_KEY_TYPE` to `ECDSA` or `ED25519`; DER-encoded Hedera keys are detected directly.

If the public key already controls one testnet account, the script reports that account without requesting operator credentials. After provisioning, return to the dashboard to refresh the HBAR balance, then select **Hedera** in Send or Receive.

Relevant implementation files:

- [`lib/hedera/config.ts`](lib/hedera/config.ts) - build-bound network policy, official Mirror Node validation, account validation, chain IDs, and tinybar constants;
- [`lib/hedera/keys.ts`](lib/hedera/keys.ts) - deterministic Hedera Ed25519 derivation;
- [`lib/hedera/account.ts`](lib/hedera/account.ts) - account snapshots, exact balance, history, and status mapping;
- [`lib/hedera/payments.ts`](lib/hedera/payments.ts) - receive requests, exact amounts, signing, and receipt checks;
- [`lib/hedera/mirror.ts`](lib/hedera/mirror.ts) - bounded official Mirror Node REST access with int64 preservation;
- [`lib/hedera/explorer.ts`](lib/hedera/explorer.ts) - validated network-bound HashScan links;
- [`scripts/hedera-provision-testnet.cjs`](scripts/hedera-provision-testnet.cjs) - local-only account creation and funding;
- [`tests/hedera.test.cjs`](tests/hedera.test.cjs) - key, exact amount, Mirror Node, history, status, QR, and secret-boundary tests.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_ENABLE_MAINNET` | `false` | Explicitly enables supported real-fund networks at build time |
| `EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET` | `false` | Enables Bitcoin Lightning Mainnet independently |
| `EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE` | `regtest` | Must be `regtest` or `mainnet` and match Lightning Mainnet enablement |
| `EXPO_PUBLIC_ENABLE_HEDERA_MAINNET` | `false` | Enables Hedera Mainnet independently without activating Lightning Mainnet |
| `EXPO_PUBLIC_HEDERA_BUILD_PROFILE` | `testnet` | Must match the Hedera network; separates safe test builds from Mainnet releases |
| `EXPO_PUBLIC_HEDERA_NETWORK` | `testnet` | Selects `testnet` or `mainnet` at build time; no in-app switch exists |
| `EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL` | Official Mirror Node for selected network | Resolves accounts, balances, history, receipts, and contract runtime; wrong-network hosts are rejected |
| `EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR` | `1` on testnet; required on Mainnet | Explicit policy: `balance` for available funds minus maximum fees, or a positive HBAR cap for limited test builds |
| `EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID` | `0.0.9972670` in `.env.example` | Enables only the deployed, verified Phase 3 testnet checkout contract |
| `EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256` | verified hash in `.env.example` | Pins the exact deployed Phase 3 runtime bytecode in the app build |
| `EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS` | `100` | Additional ceiling used by Lightning fee validation |
| `EXPO_PUBLIC_ALLOW_INSECURE_HTTP` | `false` | Allows private/local HTTP only in development |
| `EXPO_PUBLIC_EID_BACKEND_URL` | empty | Reference configuration only; identity payments are disabled in the first-release scope |

See [`.env.example`](.env.example) for the complete development configuration.

## Mainnet policy

Mainnet enablement is a build-time release decision, not an in-app network switch:

```dotenv
EXPO_PUBLIC_ENABLE_MAINNET=false
EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET=true
EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE=mainnet
EXPO_PUBLIC_ENABLE_HEDERA_MAINNET=true
EXPO_PUBLIC_HEDERA_BUILD_PROFILE=mainnet
EXPO_PUBLIC_HEDERA_NETWORK=mainnet
EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL=https://mainnet.mirrornode.hedera.com
EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR=balance
EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID=0.0.10850063
EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256=18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8
```

Hedera Mainnet requires every listed Hedera value. Lightning Mainnet independently requires its explicit enable flag and matching `mainnet` profile. Partial activation, a mismatched profile, a wrong-network Mirror Node, a missing transfer policy, or missing contract evidence fails during application configuration. The grant-specific `mainnet-candidate` EAS profile deliberately keeps Lightning on regtest; the `production` profile enables both reviewed Mainnet paths while leaving the legacy global switch disabled.

On Windows, an authorized arm64 Android device can receive a standalone, locally signed internal candidate without Metro:

```powershell
npm run android:mainnet-candidate
```

The script rejects a dirty worktree, secrets in the build environment, mismatched deployment evidence, multiple devices, and non-arm64 targets. It records the exact commit and APK hash under the ignored `.codex-local-evidence/mainnet-candidate` directory. This internal APK uses a local debug certificate and is not the final Play Store release.

After code review and explicit real-funds approval, the combined internal HBAR and Lightning candidate is built with:

```powershell
npm run android:production-candidate
```

That command builds and launches the artifact but never initiates a payment. Continue with the manual real-funds gate in [LIGHTNING_MAINNET_ACCEPTANCE.md](docs/LIGHTNING_MAINNET_ACCEPTANCE.md).

For a standalone Android APK intended for direct download, use the EAS `production-apk` profile. It inherits the production Mainnet settings and release checks, builds `assembleRelease` with EAS-managed signing credentials, and needs neither Metro nor ADB on the user's device. The existing `production` profile remains the store AAB build; `preview` remains on test networks. See the [direct APK release guide](docs/DIRECT_APK_RELEASE.md) for signing, artifact verification, device acceptance, and hosting steps. Do not serve a locally built candidate signed with the Android debug certificate.

Before any public release, complete [Lightning Mainnet Android acceptance](docs/LIGHTNING_MAINNET_ACCEPTANCE.md), follow the [Lightning operations and incident runbook](docs/LIGHTNING_OPERATIONS_RUNBOOK.md), reassess the dependency tree, and obtain independent security, privacy, and regulatory reviews. Network support in source code is not authorization to use real funds; the go/no-go gates remain binding.

## Reference services

The repository contains local services for protocol exploration and testing. They fail closed and do not manufacture successful payment or identity results.

```powershell
npm run demo:ocp
npm run eid-backend
npm run demo:travel-rule
```

These services are not production backends. The eID service requires an explicit demo secret for demo mode and otherwise requires provider callback configuration, persistent signing material, and explicit acknowledgement of its in-memory reference design. See [TESTING_EIDAS.md](docs/TESTING_EIDAS.md) for the local identity sequence.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `app/` | Expo Router screens and navigation |
| `components/` | Reusable UI and payment-state views |
| `contracts/` | Solidity checkout contract and contract-only test helpers |
| `contract-tests/` | Hardhat contract behavior and failure-path tests |
| `deployments/` | Versioned public Hedera deployment evidence |
| `hooks/` | Wallet lifecycle, balances, and app-facing orchestration |
| `lib/` | Network clients, validation, signing, storage, and payment services |
| `scripts/` | Local development and testnet provisioning tools |
| `tests/` | Deterministic unit and integration-style tests with mocked remote boundaries |
| `demo/` | Local merchant reference services |
| `server/` | Local eID reference backend |
| `docs/` | Implementation guides, operations, release checks, and historical acceptance evidence |
| `RELEASE_NOTES.md` | Recorded release changes |

## Quality gates

```powershell
npm run phase5:verify
```

The gate runs TypeScript, lint, application tests, contract tests, and script syntax checks. Coverage includes wallet recovery, exact payment amounts, transaction reconciliation, secret boundaries, invoice validation, and checkout failure paths. Run the gate on the intended release commit; dated acceptance results are available in the documentation index.

## Security reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw sensitive transaction data. Use redacted reproduction details and contact the project owner through a private channel. Current audit status and known release blockers are documented in [SECURITY.md](SECURITY.md).
