# Opago Wallet

Opago Wallet is a mobile wallet built with Expo and React Native. It explores a single protected recovery phrase across Hedera, Solana, and Bitcoin Lightning while keeping network selection, transaction validation, and test provisioning explicit.

The current release is intended for development and test networks. It is not an audited production wallet, a licensed financial service, or evidence of regulatory compliance. See [SECURITY.md](SECURITY.md) before using the code with identities or funds.

## Project status

| Capability | Network | Status |
| --- | --- | --- |
| HBAR balance, send, receive, history, and recovery | Hedera testnet | Phase 2 complete; physical-device acceptance verified |
| Contract-bound HBAR checkout and merchant QR demo | Hedera testnet | Phase 3 complete; deployed, source-verified, and physically accepted |
| Native SOL send, receive, balance, and history | Solana devnet | Implemented |
| SPL USDC balance and transfer | Solana devnet | Implemented; requires an explicit devnet mint |
| Lightning send and receive | Spark regtest | Implemented; mainnet validation pending |
| SOL/USDC-to-Lightning quotes | Explicitly enabled mainnet build | Experimental; disabled by default |
| Payment-method negotiation | OpenCryptoPay-style local reference service | Prototype |
| eID and Travel Rule hand-off | Local reference services | Demo only; not legal identity verification |

Mainnet payments are disabled by default. Hedera remains testnet-only even when other mainnet features are explicitly enabled.

## Delivery phases

### Phase 0 - security and Android baseline

**Status: complete.** The wallet fails closed for unsupported networks and malformed payment data, keeps recovery material in native secure storage, blocks accidental real-fund execution by default, and builds and installs as an Expo 54 development client on a physical Android device.

### Phase 1 - Hedera SDK spike

**Planned window: 8-10 August 2026. Status: complete and physically verified.**

- `@hiero-ledger/sdk` is pinned to the Expo-compatible version `2.84.0`.
- Hedera is restricted to testnet.
- The Ed25519 key is deterministically derived from the existing recovery phrase at `m/44'/3030'/0'/0'`.
- The app discovers the matching account through the Mirror Node.
- A small HBAR transfer is signed on-device and its receipt is validated.
- Faucet/operator credentials exist only in the local provisioning process and never in `EXPO_PUBLIC_*` or the app bundle.

### Phase 2 - HBAR as a complete wallet asset

**Planned window: 10-15 August 2026. Status: complete and physically verified.**

- HBAR balance, numeric account ID, receive request, send flow, transaction status, history, and HashScan links are integrated.
- Dashboard, Send, and Receive expose HBAR as a first-class asset with prominent `HEDERA TESTNET` labels.
- Every HBAR payment has a dedicated review screen before signing and a success screen containing its transaction ID.
- Recovery from the same BIP39 phrase derives the same Hedera key and rediscovers the matching testnet account.
- All HBAR monetary values remain `bigint` tinybars. JavaScript floating-point numbers are never used for HBAR accounting.
- Mirror Node account, balance, and history data use the official [Account API](https://docs.hedera.com/api-reference/accounts/get-account-by-alias-id-or-evm-address) and [Transaction API](https://docs.hedera.com/api-reference/transactions/list-transactions).

### Phase 3 - contract and merchant demo

**Planned window: 15-19 August 2026. Status: complete and physically verified on Hedera testnet.**

- `OpagoHbarCheckout.sol` is a non-custodial, non-upgradeable checkout contract with no owner, fee, or withdrawal path.
- Each `paymentId` is a domain-separated hash of the testnet chain, deployed contract, random request nonce, merchant EVM address, exact tinybar amount, and expiry.
- The contract forwards the exact `msg.value` to the merchant atomically. Expired, altered, duplicate, replayed, invalid-recipient, and failed-forwarding calls revert.
- Hardhat tests cover the successful payment and all seven required failure/replay scenarios.
- The local merchant demo creates five-minute payment requests and scanner-ready QR codes.
- The Android wallet verifies the merchant alias and exact pinned runtime-bytecode SHA-256 with the Mirror Node, shows contract details before signing, invokes `pay` directly through the Hiero SDK, and displays both transaction and payment IDs on success.
- `deployments/hedera-testnet.json` is the versioned evidence record for contract `0.0.9972670`, its deployment transaction, compiler, timestamps, and bytecode hashes.

The contract was deployed on 8 August 2026. Mirror Node runtime bytecode exactly matches the locked artifact, Sourcify reports an exact runtime match, and the merchant QR checkout was signed and confirmed on a physical Android device on 10 August 2026.

### Phase 4 - end-to-end and security acceptance

**Planned window: 19-22 August 2026. Status: in progress.**

Completed evidence:

- Separate Hedera testnet wallet and merchant accounts are active.
- Direct HBAR transfer and contract checkout transactions were signed on a physical Android device and reached consensus with `SUCCESS`.
- App restart, deterministic key derivation, and account rediscovery were exercised without exposing the recovery phrase or private key.
- Automated tests cover testnet enforcement, network/configuration rejection, secret boundaries, checkout tampering, expiry, replay, duplicate payment IDs, wrong amounts, invalid merchants, failed forwarding, and reentrancy.

Remaining acceptance gates:

- receive HBAR through a wallet-generated QR code and record the incoming physical-device flow;
- clear app data, restore the wallet from its recovery phrase, and verify the same Hedera account and history;
- exercise offline, timeout, pending-transaction, and restart-during-payment behavior on the Android device;
- physically reject expired, altered, replayed, and wrong-amount checkout requests;
- archive a redacted Logcat review proving that seeds, private keys, and complete signed transactions are not logged;
- verify that failed or unresolved payments are never stored or displayed as successful.

### Phase 5 - milestone evidence

**Planned window: 22-24 August 2026. Status: in progress.**

The repository already contains the Hedera testnet setup, architecture, reproducible quality commands, deployment manifest, contract and transaction links, source-verification record, and physical-device transaction evidence.

Remaining milestone gates:

- verify a clean clone with `npm ci`, all quality gates, a fresh Android development-client build, installation, and launch;
- archive the final Phase 4 test matrix and redacted evidence;
- prepare the final one-to-five-minute demo script and video showing balance, merchant QR scan, payment review, confirmation, success, and HashScan verification;
- package the exact commit, lockfile, compiler metadata, deployment manifest, links, and release notes used for submission.

25 August 2026 remains the submission and contingency day.

| Public testnet evidence | Link |
| --- | --- |
| Contract `0.0.9972670` | [View on HashScan](https://hashscan.io/testnet/contract/0.0.9972670) |
| Deployment transaction | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.9959245%401786181037.989721534) |
| Physical-device checkout transaction | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.9960666%401786350735.994979380) |
| Sourcify exact runtime match | [View verification record](https://sourcify.dev/server/v2/contract/296/0x0000000000000000000000000000000000982bbe) |

#### Contract quality gates

```powershell
npm run contract:compile
npm run contract:test
npm run typecheck
npm run lint
npm test
```

The Solidity compiler is pinned through `package-lock.json` and Hardhat uses that local compiler with the `paris` EVM target. Compiler input is normalized to the CRLF line endings used by the verified deployment, so Linux, macOS, and Windows builds reproduce the versioned creation and runtime bytecode hashes.

#### Hedera testnet deployment and source verification

Run this only on a trusted development machine with a disposable funded testnet operator. The key is read into a process-local variable and is never written to the app, manifest, source tree, or an `EXPO_PUBLIC_*` variable.

```powershell
$env:HEDERA_OPERATOR_ID='0.0.YOUR_TESTNET_OPERATOR'
$hederaDeploySecret = Read-Host 'Hedera testnet operator key' -AsSecureString
$env:HEDERA_OPERATOR_KEY = [System.Net.NetworkCredential]::new(
  '',
  $hederaDeploySecret
).Password

try {
  npm run contract:compile
  npm run contract:deploy:testnet
  npm run contract:verify:testnet
} finally {
  Remove-Item Env:HEDERA_OPERATOR_ID -ErrorAction SilentlyContinue
  Remove-Item Env:HEDERA_OPERATOR_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:HEDERA_OPERATOR_KEY_TYPE -ErrorAction SilentlyContinue
  Remove-Variable hederaDeploySecret -ErrorAction SilentlyContinue
}
```

Use the public verified deployment values below in the client build configuration, then rebuild the native app:

```dotenv
EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID=0.0.9972670
EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256=18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8
```

`npm run contract:verify:testnet` checks Mirror Node runtime bytecode and the Hedera consensus creation timestamp against the locked artifact, submits the standard compiler input to Sourcify for chain ID `296`, and follows the verification job to an exact runtime match.

#### Merchant checkout demo

Set a testnet merchant account, start the local server, open the shown URL on the development computer, and scan the displayed QR code in the wallet's Hedera Send flow.

```powershell
$env:HEDERA_MERCHANT_ID='0.0.YOUR_TESTNET_MERCHANT'
npm run demo:hedera-checkout
```

The demo obtains the merchant EVM alias from the official Mirror Node instead of deriving a possibly incorrect long-zero address. Each page load creates a random nonce, derives a field-bound `paymentId`, and sets a five-minute expiry.

## Hedera implementation

The Hedera integration uses [`@hiero-ledger/sdk`](https://github.com/hiero-ledger/hiero-sdk-js) `2.84.0` directly in the React Native client. Private keys remain in runtime memory while account data and transaction history come from the Hedera testnet Mirror Node.

The app enforces an app-level limit of at most `1 HBAR` per test transaction by default. Account provisioning remains isolated from the app so no operator credential enters the client bundle.

### Verified Android testnet transaction

| Field | Result |
| --- | --- |
| Date | 2026-08-07 |
| Device | Physical Android device |
| Network | Hedera testnet |
| Transfer | `0.01 HBAR` |
| Source | `0.0.9960666` |
| Destination | `0.0.9958415` |
| Consensus status | `SUCCESS` |
| Transaction | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.9960666%401786108189.439977724) |

Testnet assets have no monetary value. The transaction above is public evidence of the Phase 1 device flow, not a production-readiness claim.

### Phase 2 physical-device acceptance

| Field | Result |
| --- | --- |
| Date | 2026-08-07 |
| Device | Physical Android device |
| Network | Hedera testnet |
| Transfer | `0.00000001 HBAR` (`1` tinybar) |
| Source | `0.0.9960666` |
| Destination | `0.0.9958415` |
| Consensus status | `SUCCESS` |
| Transaction | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.9960666%401786122994.705663702) |

The acceptance covered account discovery, exact balance and history loading, account-ID copy, receive QR generation, review-before-signing, on-device signing, Mirror Node status verification, HashScan opening, and post-transaction refresh.

### Phase 3 physical-device checkout acceptance

| Field | Result |
| --- | --- |
| Date | 2026-08-10 |
| Device | Physical Android 14 device |
| Network | Hedera testnet |
| Checkout amount | `0.01 HBAR` (`1,000,000` tinybars) |
| Source | `0.0.9960666` |
| Merchant | `0.0.9944908` |
| Contract | `0.0.9972670` |
| Consensus and contract result | `SUCCESS` / `SUCCESS` |
| Gas used | `195095` |
| Transaction | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.9960666%401786350735.994979380) |
| Checkout payment ID | `0x912153f15b35410765fe7296c58c1956606377cf437bab9025cea1b62da8a381` |

The wallet scanned the merchant demo QR, verified the merchant EVM alias and pinned runtime bytecode through the Mirror Node, displayed the contract-bound review, signed on-device, and showed the confirmed transaction and payment IDs. An independent Mirror Node lookup reported a `CONTRACTCALL` to `0.0.9972670` and an exact `1,000,000` tinybar transfer to the merchant.

### Hedera key and transaction flow

1. The app loads or creates a BIP39 recovery phrase in native secure storage.
2. It derives the Hedera Ed25519 key and retains the private key only in runtime memory.
3. The Settings screen exposes only the public key for local testnet provisioning.
4. The provisioning script creates or finds the matching account using local operator credentials.
5. The app resolves the account through the Mirror Node, signs the HBAR transfer on-device, and validates the network receipt.

The operator account is used only to create and initially fund the wallet's testnet account. Its private key is never required by the mobile app.

## Solana integration

The Solana account is deterministically derived from the same BIP39 recovery phrase at `m/44'/501'/0'/0'`. The implementation currently provides:

- Solana devnet RPC access with an expected-cluster genesis-hash check;
- native SOL balances, transfers, receive detection, and parsed transaction history;
- SPL-token balance and transfer support for an explicitly configured six-decimal USDC mint;
- associated-token-account creation when required;
- confirmation-aware transaction submission;
- optional Atomiq quotes for paying Lightning invoices from SOL or USDC in an explicitly enabled mainnet build.

The default public devnet RPC is suitable for development and is rate-limited. A reviewed, monitored RPC provider is required before production use. See the official [Solana cluster documentation](https://solana.com/docs/references/clusters).

## Wallet and safety model

- Recovery phrases are available only in native builds and are stored with Expo SecureStore using device-bound, when-unlocked access.
- Device authentication is requested for recovery-phrase access when supported.
- Recovery phrases are hidden when the app backgrounds or after 30 seconds, and screen capture is blocked while they are visible.
- Hedera and Solana use separate deterministic Ed25519 derivation paths from the same BIP39 phrase.
- Browser storage is not accepted for seed material; wallet-key operations are disabled on web.
- Solana RPC responses are checked against the selected cluster.
- Public remote endpoints must use HTTPS. Local/private HTTP requires an explicit development-only flag.
- Lightning invoices are checked for network, expiry, payment hash, exact amount, available balance, and bounded fees.
- OCP execution payloads must match the reviewed quote, asset, method, amount, identifier, and expiry.
- Incoming payment confirmations are matched to an expected Lightning payment hash and amount, a confirmed incoming Solana transfer, or a new Hedera Mirror Node transaction.

`EXPO_PUBLIC_*` variables are compiled into the client bundle. Never place recovery phrases, private keys, operator keys, faucet keys, bearer secrets, or other credentials in them.

## Technology

- Expo 54 and React Native 0.81
- TypeScript
- Hiero JavaScript SDK for Hedera
- Solana Web3.js and SPL Token
- Spark SDK for Lightning
- Atomiq SDK for cross-network quotes
- Expo SecureStore and SQLite

## Requirements

- Node.js `20.19` or newer
- npm
- Android Studio with a compatible Android SDK and JDK
- A physical Android device with USB debugging, or an Android emulator
- Privy app and client IDs for the current authentication screen

Wallet-key storage requires a native Android or iOS build. Hedera Phases 1, 2, and 3 were verified on a physical Android device. The recorded Phase 3 checkout used the installed development client with the current Metro bundle; a clean-clone, fresh native build and installation remain a Phase 5 release-evidence gate. iOS verification is outside the current milestone.

## Quick start

```powershell
git clone https://github.com/opago-pay/opago-wallet.git
Set-Location opago-wallet
Copy-Item .env.example .env
npm ci
```

Set these public client identifiers in `.env`:

```dotenv
EXPO_PUBLIC_PRIVY_APP_ID=your_app_id
EXPO_PUBLIC_PRIVY_CLIENT_ID=your_client_id
```

Run the local quality gates:

```powershell
npm run typecheck
npm run lint
npm test
npm run contract:compile
npm run contract:test
```

To build, install, and launch the development client on a connected Android device:

```powershell
adb devices
npm run android
```

The generated `android/` and `ios/` directories are intentionally not committed. Expo creates the native project during the local native build.

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

- [`lib/hedera/config.ts`](lib/hedera/config.ts) - fixed testnet policy, account validation, and tinybar constants;
- [`lib/hedera/keys.ts`](lib/hedera/keys.ts) - deterministic Hedera Ed25519 derivation;
- [`lib/hedera/account.ts`](lib/hedera/account.ts) - account snapshots, exact balance, history, and status mapping;
- [`lib/hedera/payments.ts`](lib/hedera/payments.ts) - receive requests, exact amounts, signing, and receipt checks;
- [`lib/hedera/mirror.ts`](lib/hedera/mirror.ts) - bounded official Mirror Node REST access with int64 preservation;
- [`lib/hedera/explorer.ts`](lib/hedera/explorer.ts) - validated Hedera testnet HashScan links;
- [`scripts/hedera-provision-testnet.cjs`](scripts/hedera-provision-testnet.cjs) - local-only account creation and funding;
- [`tests/hedera.test.cjs`](tests/hedera.test.cjs) - key, exact amount, Mirror Node, history, status, QR, and secret-boundary tests.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_ENABLE_MAINNET` | `false` | Explicitly enables supported real-fund networks at build time |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | Solana devnet public RPC | Selects the Solana RPC endpoint |
| `EXPO_PUBLIC_USDC_MINT` | empty | Enables the intended six-decimal USDC mint on the selected cluster |
| `EXPO_PUBLIC_HEDERA_NETWORK` | `testnet` | Hedera wallet support accepts only `testnet` |
| `EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL` | Hedera testnet Mirror Node | Resolves the account for the derived public key |
| `EXPO_PUBLIC_HEDERA_MAX_TEST_TRANSFER_HBAR` | `1` | Upper bound for a single app-initiated testnet transfer |
| `EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID` | `0.0.9972670` in `.env.example` | Enables only the deployed, verified Phase 3 testnet checkout contract |
| `EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256` | verified hash in `.env.example` | Pins the exact deployed Phase 3 runtime bytecode in the app build |
| `EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS` | `100` | Additional ceiling used by Lightning fee validation |
| `EXPO_PUBLIC_ALLOW_INSECURE_HTTP` | `false` | Allows private/local HTTP only in development |
| `EXPO_PUBLIC_EID_BACKEND_URL` | empty | Enables the optional eID reference flow |

See [`.env.example`](.env.example) for the complete development configuration.

## Mainnet policy

Mainnet enablement is a build-time release decision, not an in-app network switch:

```dotenv
EXPO_PUBLIC_ENABLE_MAINNET=true
EXPO_PUBLIC_SOLANA_RPC_URL=https://your-reviewed-mainnet-rpc.example
EXPO_PUBLIC_EID_BACKEND_URL=https://your-reviewed-eid-backend.example
```

Before any release, replace public development infrastructure, validate the complete Spark and Atomiq deployment, repeat native device and failure-path testing, reassess the dependency tree, establish monitored RPC and backend services, and obtain independent security, privacy, and regulatory reviews.

Hedera mainnet is not enabled by this flag. The wallet rejects any Hedera network other than testnet.

## Reference services

The repository contains local services for protocol exploration and testing. They fail closed and do not manufacture successful payment or identity results.

```powershell
npm run demo:ocp
npm run eid-backend
npm run demo:travel-rule
```

These services are not production backends. The eID service requires an explicit demo secret for demo mode and otherwise requires provider callback configuration, persistent signing material, and explicit acknowledgement of its in-memory reference design. See [TESTING_EIDAS.md](TESTING_EIDAS.md) for the local identity sequence.

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

## Quality gates

```powershell
npm run typecheck
npm run lint
npm test
npm run contract:compile
npm run contract:test
node --check server/eid-backend.js
```

At the Phase 3 acceptance baseline recorded above, the application suite passes `44/44` tests and the checkout contract passes `9/9` Hardhat tests. The suites cover deterministic wallet derivation, exact bigint tinybar handling, Hedera account/history/status parsing, receive requests, transaction construction, secret boundaries, Solana transfer parsing, Lightning invoice and preimage validation, payment amount binding, OCP quote integrity, eID proof verification, replay protection, remote URL policy, and checkout success and failure paths.

## Security reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw sensitive transaction data. Use redacted reproduction details and contact the project owner through a private channel. Current audit status and known release blockers are documented in [SECURITY.md](SECURITY.md).
