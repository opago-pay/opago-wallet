# Security status

Last reviewed: 2026-09-17

This repository is a public hackathon and grant codebase. It has not received an independent mobile, key-lifecycle, dependency, or smart-contract audit. A capped, standalone Android candidate has completed internal real-HBAR Mainnet acceptance, but that evidence is not a public-production, custody, regulatory, or app-store readiness claim. Do not distribute it as a production wallet or process third-party funds or identities without the dedicated reviews and release controls listed below.

## Dependency audit

The lockfile pins Hiero SDK `2.88.0` and Spark `0.7.12`. On 17 September 2026, targeted overrides updated Metro's complete `0.83` family to `0.83.8` and patched the affected build-tool dependencies. The vulnerable query-string decoder chain was replaced by `query-string 9.5.1`; a small Metro adapter preserves Expo Router 6's named CommonJS interface. Encoding compatibility is covered by regression tests. No `npm audit fix --force` was used.

Fresh `npm audit --json` and `npm audit --omit=dev --json` reports for the resulting 2026-09-17 lockfile are:

| Scope | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production dependency tree | 0 | 0 | 0 | 0 | 0 |
| Complete tree including development tools | 0 | 0 | 0 | 0 | 0 |

`npx expo install --check` passes for SDK 54. This is an advisory and declared-version check, not proof that the native artifact or wallet is secure. The Metro/query parser overrides also require Android bundling, deep-link and navigation acceptance. Rerun both audits for every public candidate; reports become stale as advisories change.

The lockfile was updated with `npm install --ignore-scripts`. A fresh isolated `npm ci --ignore-scripts` installed 1,276 packages successfully with zero advisories on 17 September 2026; the temporary dependency copy was removed afterward. An isolated native release build from a clean reviewed commit remains a separate gate. Hiero SDK `2.88.0` emits upstream peer-metadata warnings for the exact `ansi-styles` and `protobufjs` versions requested by its proto package; these have not been suppressed with older dependencies.

Contract tests now use Hardhat `3.16.0`, Ethers and Mocha as development-only dependencies. Compilation uses the exact local Solidity `0.8.28` package through `scripts/compile-contracts.cjs`, with the original CRLF source convention, optimizer 200 and Paris target. All nine contract tests pass and the generated runtime SHA-256 remains `18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8`, matching the verified deployment. No contract was changed or redeployed. Toolchain changes still require independent review.

Before any release:

- reassess every reachable production advisory against the actual native bundle;
- update upstream frameworks and SDKs when compatible patched releases exist;
- audit `OpagoHbarCheckout.sol` independently and repeat its failure-path tests;
- generate an SBOM and archive the exact lockfile, compiler version, bytecode hashes, and deployment evidence;
- do not approve unrestricted public distribution while reachable high-severity findings or independent-review blockers remain unresolved.

## Smart-contract boundaries

The internal production profile explicitly uses `EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR=balance`, approved by the owner on 17 September 2026. HBAR payment review and the refreshed pre-signing check require the amount plus the mode-specific maximum network fee to fit the available balance. Direct transfers retain their 0.1 HBAR fee ceiling; merchant checkout retains 0.75 HBAR. The amount remains an exact positive signed-int64 tinybar value. Device authorization and the final session guard remain mandatory in the app. Numeric transfer caps remain available for limited test/grant builds; an absent Mainnet policy still fails configuration.

`OpagoHbarCheckout` is designed without an owner, upgrade mechanism, fee, withdrawal path, fallback, or receive function. It domain-binds chain, contract, random request nonce, merchant, exact tinybar amount, and expiry into a single-use payment ID, and reverts if forwarding fails. These properties are covered by local Hardhat tests but are not a substitute for an independent audit or production security review.

Contract `0.0.9972670` was deployed to Hedera testnet and its runtime bytecode was matched against the locked artifact through Mirror Node and Sourcify. On 2026-08-10, a physical Android device completed a contract checkout from wallet `0.0.9960666` to merchant `0.0.9944908`; Hedera consensus and the contract result were both `SUCCESS`.

The same locked runtime was deployed to Hedera Mainnet as contract [`0.0.10850063`](https://hashscan.io/mainnet/contract/0.0.10850063) and source-verified. The internal Android candidate completed real-HBAR checkout transactions, including the [transaction shown in the submitted grant video](https://hashscan.io/mainnet/transaction/0.0.10861984%401789541018.595289764). This establishes deployment and functional integration only. It does not replace an independent audit or establish public-production readiness.

The versioned deployment manifest contains only public evidence. Operator credentials remain local and must never be committed or exposed through `EXPO_PUBLIC_*`.

## Merchant-request boundary

The checkout contract cryptographically binds the network, contract, merchant address, exact amount, nonce, expiry, and payment ID after a request is created. It does **not** prove that the party which created the QR code is an authorized Opago merchant. The local merchant page is therefore a reference demo, not an authenticated production merchant service, and the wallet must not label its requests as a verified merchant identity. A public release requires a separately reviewed merchant-authentication design such as signed requests or a trusted registry, plus HTTPS hosting, operational ownership, and abuse controls.

## Payment-state and diagnostic safeguards

Hedera SDK operations use bounded request/deadline/attempt settings. Once the SDK returns a transaction ID, the app persists a non-secret journal record as `pending` before waiting for the receipt. Only an explicit `SUCCESS` receipt or Mirror Node result promotes it to `confirmed`; known non-success results become `failed`, and unavailable or unknown results remain `pending`. This state survives process death and prevents an unresolved payment from being shown as successful.

Physical Phase 4 acceptance on 12 August 2026 covered offline operation, timeout, force-stop after submission, restart reconciliation, expired and altered checkout data, wrong amounts, and an on-chain replay rejection. The redacted app-process Logcat review found no recovery/private-key labels, complete signed-transaction payloads, or fatal exceptions. Public transaction links and aggregate counts are recorded in [PHASE4_ACCEPTANCE.md](PHASE4_ACCEPTANCE.md); raw device logs are intentionally not retained.

## Wallet recovery and provisioning safeguards

On 2026-08-12, physical Android acceptance provisioned testnet account `0.0.10030291`, displayed its `2 HBAR` balance, deleted the local wallet, restored it from the paper backup, and rediscovered the same account and balance. This is testnet evidence only.

Local wallet deletion is disabled until three randomly selected paper-backup words match the phrase held in device-bound secure storage. The challenge asks for one word at a time, blocks screen capture, never transmits the phrase, and clears deletion authorization when the app backgrounds. Recovery display and entry also block screen capture and clear phrase state on backgrounding. The explicit reveal uses numbered native text at 20 points, adapting to one column on narrow screens or large font settings. Assistive technology can read one focused word at a time after reveal; the full phrase is never automatically announced. The displayed backup status uses the persisted wallet-bound record, independently of temporary deletion permission. Until that record has loaded, Home shows no missing-backup warning; Security and Request show a neutral loading state with retry on failure.

The testnet provisioning script derives the submitted operator public key and compares it with the configured operator account's Mirror Node key before submitting an account-creation transaction. A mismatch fails locally with no transaction submitted. Operator credentials remain process-local and are removed after the script exits.

## Remaining wallet-key limitations

The recovery phrase is stored with Expo SecureStore using device-only, when-unlocked storage. Biometric access control is requested when the platform reports it is available. Existing protected keys can become inaccessible after a biometric enrollment change; users must have an offline backup before changing device security. A missing protected phrase is an error and must never silently generate a replacement wallet.

The app starts locked when a wallet exists, locks immediately on backgrounding, and expires after two minutes without interaction. Locking unmounts sensitive screens, drops the retained Hedera key and disposes Spark connections/timers. Late Spark startups are disposed before a later session can initialize. JavaScript strings and SDK internals cannot be guaranteed to be zeroized; releasing references does not make this a hardware signing wallet.

Both HBAR and Lightning require a separate payment review and system-device authentication immediately before submission. Android 11+ accepts strong biometrics or the device screen-lock credential (PIN, pattern or password); iOS and older Android retain the strong-biometric path. Approval is bound to the current unlocked session and checked again after the durable journal write, before network submission. Optional haptic failure cannot turn a confirmed payment into a failed payment.

Android 11+ devices without strong biometrics can now create, restore and authorize payments using the system credential prompt. Recovery-word reveal and backup verification also require fresh system authentication. The app never receives the PIN. Weak face recognition alone remains excluded by `biometricsSecurityLevel: strong`. A device without a configured screen lock is rejected. Android 10 and older do not support the strong-biometric/device-credential combination used here, so PIN-only users receive a compatibility error; see [Android authentication requirements](https://developer.android.com/identity/sign-in/biometric-auth).

A bounded authentication attempt can preserve an unlocked session only while its exact Android system prompt is outstanding. The wallet UI remains hidden while inactive, the two-minute idle expiry still applies, and no approval can be issued or used while the app is backgrounded. A new prompt invalidates previous action approvals. Failed/cancelled prompts that backgrounded the app lock the session; completion after a lock, another unlock, or expiry fails. Normal app backgrounding still locks and disposes SDK resources. Foreground gesture capture, keyboard edits/submission, modal interaction and accessible button/tab activation renew the inactivity deadline. Rendering, network polling and programmatic input value changes do not renew it; events cannot revive an expired session. SDK startup is tied to the wallet session rather than the action-approval generation, so a PIN prompt cannot permanently break optional Lightning startup.

On PIN-only devices, SecureStore still encrypts the phrase using the platform keystore, while access is gated by the app's system-authenticated session. This is not a claim that those keys have a hardware-enforced per-use PIN binding. Existing biometric-protected keys are not rewrapped or downgraded, so their original biometric access restrictions still apply. Physical creation/restore/payment, cancellation, Home/app switching, process death and enrollment-change acceptance remain required.

Before receiving, users must check three paper-backup words or explicitly acknowledge postponing the backup. A reminder stays visible until verification. The persisted status is bound to the wallet public key; permission to delete the local wallet still requires a fresh per-session backup check. The same phrase derives both assets; clean-device Mainnet recovery of both remains a release gate.

## First public release scope

The agreed scope is HBAR and Bitcoin over Lightning/Spark. The Home Swap action shows only a localized coming-soon notice; swap execution remains disabled and onboarding does not promise it. eID/Travel Rule payment paths fail closed before starting identity sessions or sending payer data; setting a backend URL does not enable them. Reference servers remain development code. External native links only admit bounded canonical Hedera checkout reviews, never recovery, creation or direct signing routes. Checkout explicitly does not verify merchant identity.

Implementation and outstanding external evidence are tracked in [PUBLIC_RELEASE_READINESS.md](PUBLIC_RELEASE_READINESS.md). No independent audit or public-release approval has been obtained by these code changes.

Lightning payments use a non-secret local journal before submission. Unknown SDK outcomes remain pending across process death and are reconciled through the opaque Spark request ID or paginated outgoing history when opening Send or expanding Home activity. A collapsed Home does not scan history at startup. Confirmation requires a returned preimage whose SHA-256 equals the invoice payment hash. Privacy-sensitive incoming invoice state uses device-protected SecureStore and persists only until completion, expiry, replacement, or wallet deletion. Local service health stores aggregate timestamps, failure counts, and broad categories only.

Home may display a clearly labelled last-known balance preview after unlocking and identifying the wallet key. The preview is stored in device-protected SecureStore, scoped to the public key and both networks, expires after seven days, and is deleted with the wallet. It is not used for payment preparation, authorization or signing. Local startup timing can be enabled for internal builds; its markers contain only fixed stage names and elapsed milliseconds.

Startup computes the existing BIP39 seed once and shares it between Hedera and Spark. Android uses system PBKDF2-HMAC-SHA512 with the unchanged 2048 iterations, 64-byte result and empty passphrase. The local native module validates the canonical input shape, checks its provider with a public known-answer vector, and never logs or stores seed material. JavaScript checks the phrase checksum before invoking it. Temporary app-owned seed buffers are erased after startup/failure and on lock; a late native result is erased without use. An in-flight SDK operation owns a separate input copy until it settles, and the existing session resource disposes a late wallet. Garbage-collected strings and SDK/provider-managed copies are outside explicit zeroization guarantees. Keys are neither persisted in a new cache nor retained across sessions to speed up unlocking. Synthetic regression tests compare Hedera signing and all Spark key families with the preceding derivation.

## Reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw transaction dumps. Send an initial, redacted report to `info[at]opago.com`; Opago can establish a private follow-up channel if sensitive technical detail is required. Never email wallet recovery material or private keys.
