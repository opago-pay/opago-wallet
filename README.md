# Opago Wallet

Opago Wallet is a mobile wallet prototype built with Expo and React Native. It explores a single protected recovery phrase across Hedera, Solana, and Bitcoin Lightning while keeping network selection, transaction validation, and test provisioning explicit.

The current release is intended for development and test networks. It is not an audited production wallet, a licensed financial service, or evidence of regulatory compliance. See [SECURITY.md](SECURITY.md) before using the code with identities or funds.

## Project status

| Capability | Network | Status |
| --- | --- | --- |
| HBAR account discovery and transfer | Hedera testnet | Phase 1 complete; verified on a physical Android device |
| Native SOL send, receive, balance, and history | Solana devnet | Implemented |
| SPL USDC balance and transfer | Solana devnet | Implemented; requires an explicit devnet mint |
| Lightning send and receive | Spark regtest | Prototype |
| SOL/USDC-to-Lightning quotes | Explicitly enabled mainnet build | Experimental; disabled by default |
| Payment-method negotiation | OpenCryptoPay-style local reference service | Prototype |
| eID and Travel Rule hand-off | Local reference services | Demo only; not legal identity verification |

Mainnet payments are disabled by default. Hedera remains testnet-only for Phase 1 even when other mainnet features are explicitly enabled.

## Hedera Phase 1

The Hedera integration uses [`@hiero-ledger/sdk`](https://github.com/hiero-ledger/hiero-sdk-js) `2.84.0` and is implemented directly in the React Native client:

- deterministic Ed25519 derivation from the wallet recovery phrase at `m/44'/3030'/0'/0'`;
- account discovery through the Hedera testnet Mirror Node;
- exact tinybar amount parsing without floating-point arithmetic;
- on-device transaction signing and receipt validation;
- an app-level transfer limit of at most `1 HBAR` per test transaction by default;
- isolated local account provisioning without operator credentials in the app bundle.

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
- Incoming payment confirmations are matched to an expected Lightning payment hash and amount or to a confirmed incoming Solana transfer.

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

Wallet-key storage requires a native Android or iOS build. The Hedera Phase 1 device verification was performed on Android; iOS verification is outside the current milestone.

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

If the public key already controls one testnet account, the script reports that account without requesting operator credentials. After provisioning, return to Settings, select **Refresh**, enter a different numeric testnet account ID, and review the transfer before signing.

Relevant implementation files:

- [`lib/hedera.ts`](lib/hedera.ts) - account discovery, amount validation, transaction signing, and receipt checks;
- [`lib/wallet-keys.ts`](lib/wallet-keys.ts) - deterministic Hedera and Solana derivation;
- [`components/hedera-testnet-spike.tsx`](components/hedera-testnet-spike.tsx) - Android testnet interface;
- [`scripts/hedera-provision-testnet.cjs`](scripts/hedera-provision-testnet.cjs) - local-only account creation and funding;
- [`tests/hedera.test.cjs`](tests/hedera.test.cjs) - key, lookup, transfer-shape, amount, and secret-boundary tests.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_ENABLE_MAINNET` | `false` | Explicitly enables supported real-fund networks at build time |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | Solana devnet public RPC | Selects the Solana RPC endpoint |
| `EXPO_PUBLIC_USDC_MINT` | empty | Enables the intended six-decimal USDC mint on the selected cluster |
| `EXPO_PUBLIC_HEDERA_NETWORK` | `testnet` | Phase 1 accepts only `testnet` |
| `EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL` | Hedera testnet Mirror Node | Resolves the account for the derived public key |
| `EXPO_PUBLIC_HEDERA_MAX_TEST_TRANSFER_HBAR` | `1` | Upper bound for a single app-initiated Phase 1 transfer |
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

Hedera mainnet is not enabled by this flag. The Phase 1 implementation rejects any Hedera network other than testnet.

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
node --check server/eid-backend.js
```

The test suite covers deterministic wallet derivation, Hedera key parsing and transaction construction, Solana transfer parsing, Lightning invoice and preimage validation, payment amount binding, OCP quote integrity, eID proof verification, replay protection, and remote URL policy.

## Security reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw sensitive transaction data. Use redacted reproduction details and contact the project owner through a private channel. Current audit status and known release blockers are documented in [SECURITY.md](SECURITY.md).
