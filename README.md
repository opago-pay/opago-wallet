# Opago Wallet

Opago Wallet is a mobile wallet built with Expo and React Native. It uses one protected recovery phrase for Hedera and Bitcoin Lightning while keeping network selection, transaction validation, and test provisioning explicit.

The default mobile build is intended for development and test networks. The verified Hedera Mainnet contract does not by itself make the Android app an audited production wallet, a licensed financial service, or evidence of regulatory compliance. See [SECURITY.md](SECURITY.md) before using the code with identities or funds.

## Project status

| Capability | Network | Status |
| --- | --- | --- |
| HBAR balance, send, receive, history, and recovery | Hedera testnet | Phase 2 complete; physical-device acceptance verified |
| Contract-bound HBAR checkout and merchant QR demo | Hedera testnet | Phase 3 complete; deployed, source-verified, and physically accepted |
| HBAR checkout contract and release isolation | Hedera mainnet | Contract `0.0.10850063` deployed and source-verified; physical Android canary and Thrive submission completed |
| Lightning send and receive | Spark regtest by default; explicit Mainnet release profile available | Review/authentication, crash-safe journal, receive recovery, paginated history, and local health diagnostics implemented; physical Mainnet acceptance pending |
| Payment-method negotiation | OpenCryptoPay-style local reference service | Prototype |
| eID and Travel Rule hand-off | Local reference services | Demo only; not legal identity verification |

Mainnet payments remain disabled in the default build. Hedera Mainnet code paths require the Hedera-specific real-fund flag, a matching build profile, a human-approved transfer cap, and the pinned verified contract `0.0.10850063`. The grant candidate enables real HBAR while Lightning remains on regtest.

## Interface readiness

Home, Send, Request, activity, and checkout selection share one asset identity system for Bitcoin Lightning and HBAR. The consumer flow leads with recipient, amount, balance, and clear actions; long addresses, transaction signatures, payment IDs, and contract details stay available behind explicit copy or details controls. Scalable asset icons and compact network badges make regtest, testnet, and mainnet unambiguous. Long forms remain scrollable on smaller Android screens, and selection, copy, scan, success, and receipt actions expose accessible roles or labels.

The implemented scope and remaining physical-device visual checks are tracked in [UI_PRODUCTION_READINESS.md](UI_PRODUCTION_READINESS.md). This is an interface-quality milestone, not a claim that the wallet is audited or ready for real funds.

## Delivery phases

### Phase 0 - security and Android baseline

**Status: complete.** The wallet fails closed for unsupported networks and malformed payment data, keeps recovery material in native secure storage, blocks accidental real-fund execution by default, and builds and installs as an Expo 54 development client on a physical Android device.

### Phase 1 - Hedera SDK spike

**Planned window: 8-10 August 2026. Status: complete and physically verified.**

- `@hiero-ledger/sdk` is pinned to the tested Expo-compatible version `2.88.0`.
- Hedera is restricted to testnet.
- The Ed25519 key is deterministically derived from the existing recovery phrase at `m/44'/3030'/0'/0'`.
- The app discovers the matching account through the Mirror Node.
- A small HBAR transfer is signed on-device and its receipt is validated.
- Faucet/operator credentials exist only in the local provisioning process and never in `EXPO_PUBLIC_*` or the app bundle.

### Phase 2 - HBAR as a complete wallet asset

**Planned window: 10-15 August 2026. Status: complete and physically verified.**

- HBAR balance, numeric account ID, HashPack-compatible receive QR, send flow, transaction status, history, and HashScan links are integrated.
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

**Planned window: 19-22 August 2026. Status: complete on 12 August 2026.**

Completed evidence:

- Separate Hedera testnet wallet and merchant accounts are active.
- Direct HBAR transfer and contract checkout transactions were signed on a physical Android device and reached consensus with `SUCCESS`.
- A wallet-generated exact-amount QR received `0.001 HBAR` from MetaMask on a physical Android device. The app accepted the payment only after the Mirror Node reported a new `SUCCESS` transaction for exactly `100,000` tinybars.
- App restart, deterministic key derivation, and account rediscovery were exercised without exposing the recovery phrase or private key.
- A physical Android recovery acceptance deleted the local wallet only after a three-word paper-backup challenge, restored from the protected entry form, and rediscovered account `0.0.10030291` with the original `2 HBAR` testnet balance.
- Automated tests cover testnet enforcement, network/configuration rejection, secret boundaries, checkout tampering, expiry, replay, duplicate payment IDs, wrong amounts, invalid merchants, failed forwarding, and reentrancy.
- Offline, bounded-timeout, pending-transaction, and force-stop/restart behavior were exercised on the physical device. A submitted transaction remained `pending` across process death and changed to `confirmed` only after Mirror Node reported `SUCCESS`.
- Expired, altered-nonce, wrong-amount, and replayed checkout requests were physically rejected. The replay reached the deployed contract and returned `CONTRACT_REVERT_EXECUTED`; the app stored it as failed and never showed success.
- A redacted 1,505-line app-process Logcat review found zero recovery/private-key labels, long signed payloads, signed-transaction labels, or fatal exceptions. Mobile application code contains no console logging calls.

The complete physical-device matrix, public transaction links, fail-closed state model, and redacted diagnostic counts are archived in [PHASE4_ACCEPTANCE.md](PHASE4_ACCEPTANCE.md).

### Phase 5 - milestone evidence

**Planned window: 22-24 August 2026. Status: complete.**

The repository contains the Hedera testnet setup, architecture, reproducible quality command, deployment manifest, contract and transaction links, source-verification record, physical-device transaction evidence, release notes, and a submission-ready video sequence. The complete evidence index and clean-room procedure are in [PHASE5_MILESTONE.md](PHASE5_MILESTONE.md); the milestone changes are summarized in [RELEASE_NOTES.md](RELEASE_NOTES.md), and the one-to-five-minute recording plan is in [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

Dashboard refreshes bound optional Lightning requests so that service can fail without leaving Android pull-to-refresh running indefinitely or blocking already available Hedera data.

The clean dependency install, quality gates, fresh Android build, installation, launch, physical-device payment evidence, video, and exact submission package were completed. Historical Testnet evidence remains below; the later Mainnet grant evidence is maintained separately in [THRIVE_MILESTONE2_MAINNET.md](THRIVE_MILESTONE2_MAINNET.md).

| Public testnet evidence | Link |
| --- | --- |
| Contract `0.0.9972670` | [View on HashScan](https://hashscan.io/testnet/contract/0.0.9972670) |
| Deployment transaction | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.9959245%401786181037.989721534) |
| Physical-device checkout transaction | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.9960666%401786350735.994979380) |
| Recovery-accepted wallet `0.0.10030291` | [View on HashScan](https://hashscan.io/testnet/account/0.0.10030291) |
| Phase 4 restart-during-payment transfer | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.10030291%401786527531.288214115) |
| Phase 4 successful checkout | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.10030291%401786528624.880688643) |
| Phase 4 rejected replay | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.10030291%401786528712.770556312) |
| Sourcify exact runtime match | [View verification record](https://sourcify.dev/server/v2/contract/296/0x0000000000000000000000000000000000982bbe) |

| Public Mainnet deployment evidence | Link |
| --- | --- |
| Contract `0.0.10850063` | [View on HashScan](https://hashscan.io/mainnet/contract/0.0.10850063) |
| Deployment transaction | [View on HashScan](https://hashscan.io/mainnet/transaction/0.0.10848889%401788856737.537500943) |
| Physical-device direct transfer | [View on HashScan](https://hashscan.io/mainnet/transaction/0.0.10861984%401789477423.490632405) |
| Initial physical-device contract checkout | [View on HashScan](https://hashscan.io/mainnet/transaction/0.0.10861984%401789478514.756946872) |
| Submitted-video contract checkout | [View on HashScan](https://hashscan.io/mainnet/transaction/0.0.10861984%401789541018.595289764) |
| Android canary acceptance | [`HEDERA_MAINNET_CANARY_ACCEPTANCE.md`](HEDERA_MAINNET_CANARY_ACCEPTANCE.md) |
| Versioned deployment manifest | [`deployments/hedera-mainnet.json`](deployments/hedera-mainnet.json) |

#### Contract quality gates

```powershell
npm run phase5:verify
```

This single cross-platform gate runs TypeScript, ESLint, all application tests, deterministic contract compilation and tests, and syntax checks for the local reference services and Hedera scripts. It disables the interactive Hardhat telemetry prompt so a clean-room verification cannot block waiting for input.

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

For the reproducible Phase 4 negative matrix, generate fresh public test fixtures without any operator credential:

```powershell
$env:HEDERA_MERCHANT_ID='0.0.YOUR_TESTNET_MERCHANT'
npm run phase4:checkout-fixtures
Remove-Item Env:HEDERA_MERCHANT_ID
```

The output contains valid/replay, expired, altered-nonce, and wrong-amount deep links. The wallet accepts `opagowallet://hedera-checkout` links directly and applies the same parser, Mirror Node checks, confirmation screen, and contract call used by the QR scanner.

## Hedera Mainnet implementation plan

The immediate target is Thrive Milestone 2 by 10 October 2026: a verified Hedera Mainnet deployment, an operational Mainnet UI/payment path, public repository evidence, and a recorded real-HBAR demonstration. A contract deployment alone is not sufficient, and this grant target is narrower than making the entire multi-chain hackathon application production-ready.

Current production-branch scope is deliberately limited to HBAR and Bitcoin Lightning. Thrive Milestone 2 makes the **Hedera Mainnet integration and checkout path** grant-ready; it does not claim that the Lightning path or the complete app is already ready for unrestricted public production. Mainnet deployment commands and evidence gates are documented in [HEDERA_MAINNET_DEPLOYMENT_RUNBOOK.md](HEDERA_MAINNET_DEPLOYMENT_RUNBOOK.md).

The critical path is:

`scope confirmation -> account model -> independent review -> Mainnet deployment -> signed release -> pilot payments -> submission evidence`

### Responsibility boundary

Codex owns repository-level technical delivery: architecture, code, tests, scripts, documentation, release checks, evidence validation, and step-by-step deployment guidance. Fabian and Opago retain every external authority: product and financial decisions, grant clarification, Mainnet funds and keys, auditors, hosting, legal review, app-store identity, real-user consent, real-fund authorization, video recording, and final submission.

Mainnet private keys must never be sent through chat, committed to Git, stored in `EXPO_PUBLIC_*`, or embedded in an app bundle. Codex prepares deterministic commands and validation; the human key holder signs locally.

### Mainnet Milestone 0 - scope and launch policy

**Estimate: 1-3 days. Status: grant scope and product decisions recorded; external audit and public-launch approvals remain deferred.**

Codex delivery:

- version the product classification, Hedera service matrix, pilot scope, ownership boundary, and release blockers in [MAINNET_SCOPE.md](MAINNET_SCOPE.md);
- maintain the Mainnet trust boundaries, abuse cases, controls, and fail-closed invariants in [MAINNET_THREAT_MODEL.md](MAINNET_THREAT_MODEL.md);
- provide a ready-to-send Guardian clarification request in [THRIVE_MAINNET_CLARIFICATION.md](THRIVE_MAINNET_CLARIFICATION.md);
- define an auditable Mainnet definition of done.

Human/Opago delivery:

- obtain written confirmation that Opago is a payment/wallet project rather than an AI, RWA, or DeFi-liquidity project;
- confirm that HSCS, native HBAR transfers, and Mirror Node satisfy the product's required-service scope and that HTS/HCS are not mandatory without a product requirement;
- select controlled beta versus unrestricted public launch and Android distribution channel;
- approve pilot user count, per-payment cap, aggregate HBAR exposure, account funding policy, support owner, incident owner, and reviewers.

Acceptance gate: the technical scope documents are versioned, and every human decision `M0-D1` through `M0-D7` in [MAINNET_SCOPE.md](MAINNET_SCOPE.md) has a recorded owner and answer.

### Mainnet Milestone 1 - network isolation and release profiles

**Estimate: 3-5 days. Status: technical implementation complete and verified.**

Codex delivery:

- support `testnet | mainnet` as build-time Hedera networks while keeping testnet as the default;
- require the Hedera-specific real-fund flag and a matching Hedera build profile before Mainnet can initialize;
- bind chain ID `296` to testnet and `295` to Mainnet payment-ID derivation;
- bind official Mirror Node and HashScan routes to the selected network;
- reject cross-network QR/deep-link requests before review or signing;
- require a human-approved Mainnet transfer cap, verified contract ID, and pinned runtime SHA-256;
- provide separate EAS testnet, Mainnet-candidate, and production profiles;
- reserve an honest `not-deployed` Mainnet evidence manifest and replace it only from a real verified receipt;
- show the active Hedera network throughout asset, send, review, success, receive, account, and settings views;
- cover valid profiles and partial/mismatched activation with isolated tests.

Human/Opago delivery:

- choose the final Mainnet transfer and aggregate pilot caps;
- approve the Mainnet merchant identity, Android package/version policy, and pilot allowlist policy;
- configure public production metadata only after the source-verified contract deployment and required independent review.

Acceptance gate: complete. A Hedera testnet profile cannot submit to Hedera Mainnet, a Hedera Mainnet profile cannot accept Hedera testnet requests or infrastructure, and no Hedera Mainnet profile succeeds without the complete release evidence tuple. The repository gates pass with TypeScript, ESLint, 113 application tests, and 9 contract tests.

### Mainnet Milestone 2 - account lifecycle and recovery

**Estimate: 5-10 days. Status: user-funded activation implemented and internally accepted; clean-device Mainnet recovery and broad third-party sender interoperability remain pending.**

Codex delivery:

- compare the existing Ed25519 lifecycle with ECDSA alias-based Mainnet account creation and record an architecture decision;
- version Hedera key derivation and preserve explicit recovery compatibility;
- add deterministic vectors, account discovery, account/network persistence, clean-device recovery, and unfunded-account UI;
- implement the selected account creation or existing-account onboarding path without an operator secret in the app.

Implemented without a physical device:

- [HEDERA_MAINNET_ACCOUNT_LIFECYCLE.md](HEDERA_MAINNET_ACCOUNT_LIFECYCLE.md) records the approved user-funded Ed25519 key-alias activation model, recovery invariants, and outstanding acceptance;
- derivation version `1`, algorithm `ED25519`, and path `m/44'/3030'/0'/0'` are immutable exported metadata, and unknown versions fail closed;
- network-separated account bindings cache only public metadata and are revalidated against the selected Mirror Node and derived key before use;
- malformed, stale, cross-network, or different-wallet bindings are discarded, and wallet wipe removes both network bindings;
- deterministic account-binding and recovery tests run without Mainnet funds or an Android device.

Physical Android regression acceptance was completed on 31 August 2026 and is recorded in [MAINNET_ANDROID_BASELINE_ACCEPTANCE.md](MAINNET_ANDROID_BASELINE_ACCEPTANCE.md). It verifies cold-start account reattachment, wrong-network rejection, a confirmed direct Hedera testnet transfer, HashScan navigation, and post-payment reconciliation. This is a Testnet safety baseline only; it does not complete Mainnet onboarding or authorize real funds.

Human/Opago delivery:

- verify the selected first-deposit auto-creation flow with a compatible external sender;
- prepare the Mainnet deployment and merchant accounts; no per-user sponsor account is required;
- approve pilot limits and user-support rules; users fund their own activation from an existing compatible HBAR wallet.

Acceptance gate: a fresh wallet can obtain or connect to a Mainnet account, receive HBAR, and recover the same account on a clean device using only its protected recovery material.

### Mainnet Milestone 3 - contract hardening and independent review

**Engineering estimate: 5-8 days. External lead time: typically 2-4 weeks. Status: automated hardening implemented; independent review not completed and remains a public-release blocker.**

Codex delivery:

- extend unit, fuzz, invariant, replay, duplicate, expiry, wrong-network, forwarding-failure, reentrancy, and unusual-merchant tests;
- add static analysis, exact compiler locking, deterministic compiler input, bytecode/runtime hashes, fee/gas review, and an audit package;
- remediate findings and rerun the complete regression suite.

Human/Opago delivery:

- commission an independent smart-contract and mobile/key-lifecycle review;
- provide the reviewer access and resolve or formally reject findings;
- approve the exact final artifact only when no critical or high finding remains open.

Acceptance gate: the reviewed source, compiler metadata, artifact, tests, and approved audit result identify one exact deployable bytecode.

### Mainnet Milestone 4 - production merchant service

**Estimate: 5-8 days. Status: planned.**

Codex delivery:

- convert the local checkout demo into a deployable HTTPS service with persistent payment state;
- enforce unique payment IDs/nonces, short expiry, exact tinybar amounts, Mainnet contract binding, idempotent status checks, rate limits, retries, timeouts, health checks, and redacted logs;
- expose pending, confirmed, expired, and failed states without any signing key in the browser or service.

Human/Opago delivery:

- provide a domain, hosting account, public merchant identity, retention decision, and approved privacy/legal text;
- authorize production deployment and own service availability.

Acceptance gate: an external user can create, scan, and verify a Mainnet request without access to Fabian's development machine.

### Mainnet Milestone 5 - signed Android release

**Estimate: 4-7 days. Status: planned.**

Codex delivery:

- separate development-client behavior from the release build and remove debug/sensitive logging;
- produce reproducible signed-build inputs, versioning, Mainnet configuration checks, user-facing network/merchant/amount/fee review, payment caps, explorer checks, lifecycle tests, store copy, and release notes;
- verify installation, launch, update, backgrounding, and restart without Metro or ADB.

Human/Opago delivery:

- own the Play Console or approved alternative distribution channel, upload key/keystore, Play App Signing, privacy policy, support URL, screenshots, branding approval, tester list, and publication action.

Acceptance gate: a new Android device can install and use the signed release without a development computer.

### Mainnet Milestone 6 - security, reliability, and operations

**Estimate: 5-8 days. Status: planned.**

Codex delivery:

- reassess reachable dependency findings, update safely, generate an SBOM, scan secrets and bundles, and verify log redaction;
- preserve pending payments across crashes, reconcile only to consensus-confirmed success, prevent double submission, and handle Mirror Node outages and timeouts;
- provide health checks, incident, release, rollback, recovery, and support runbooks.

Human/Opago delivery:

- appoint support and incident owners, select monitoring, approve data retention and privacy behavior, obtain legal/regulatory review, and define the non-custodial support boundary for lost recovery phrases.

Acceptance gate: operational ownership and failure handling are documented, tested, and capable of keeping unknown or failed transactions out of the successful state.

### Mainnet Milestone 7 - deployment and canary

**Estimate: 2-4 days. Status: complete; contract verified on 8 September and physical Android canary accepted on 15 September 2026.**

Codex delivery:

- finalize guarded Mainnet deployment and verification scripts;
- validate network, operator ID, exact approved artifact, compiler metadata, fee caps, transaction, runtime, Sourcify status, and HashScan evidence;
- populate `deployments/hedera-mainnet.json` only from verified public results and bind the release build to that exact contract.

The keyless preflight passed against deployment account `0.0.10848889`. `npm run contract:deploy:mainnet` then deployed the approved runtime as contract `0.0.10850063`, and `npm run contract:verify:mainnet` validated chain ID `295`, Mirror Node identity and runtime, consensus evidence, and Sourcify status. The versioned manifest contains the exact public evidence; no operator key was written to the repository.

Human/Opago delivery:

- fund and control the deployment account, approve the exact deployment, enter the key locally, authorize real fees, and approve the resulting contract identity.

Acceptance gate: the Mainnet contract is source-verified, its runtime matches the exact approved artifact, and the standalone candidate is pinned to it. This is not an independent audit claim.

The initial internal candidate pinned to source commit `d2501899cf30850a8f15c30771be49907f4a7605` completed a real `0.01 HBAR` checkout from consumer account `0.0.10861984` to merchant account `0.0.10848889`. The later submission-video candidate at `b955c7529d36f10464d07182ec960460b794a73d` repeated the checkout successfully in [transaction `0.0.10861984@1789541018.595289764`](https://hashscan.io/mainnet/transaction/0.0.10861984%401789541018.595289764). Contract `0.0.10850063`, the official Mirror Node, HashScan, the success screen, and refreshed wallet history reported the same result. Full public evidence and remaining release limitations are recorded in [HEDERA_MAINNET_CANARY_ACCEPTANCE.md](HEDERA_MAINNET_CANARY_ACCEPTANCE.md).

### Mainnet Milestone 8 - real-user pilot

**Estimate: 4-6 days. Status: internal single-device real-fund acceptance passed; no external public pilot is claimed.**

Codex delivery:

- provide and execute the acceptance matrix, inspect public transactions and redacted diagnostics, fix defects, rerun regressions, and prepare an anonymized technical report.

Human/Opago delivery:

- recruit three to five informed pilot users, approve the HBAR budget, obtain feedback consent, execute real-fund approvals, observe users, and collect feedback.

Required scenarios include receive, direct send, checkout, wrong amount, expired QR, duplicate/replay, disconnect before and after submission, process restart while pending, clean-device recovery, wrong network/contract, and HashScan/Mirror Node evidence.

Acceptance gate: at least one real-user Mainnet checkout succeeds; every negative or unknown case remains failed/pending and never becomes a false success.

### Mainnet Milestone 9 - submission evidence

**Estimate: 2-3 days. Status: submitted through Thrive on 16 September 2026.**

Codex delivery:

- produce the <=1,000-character summary, architecture, cleaned repository, release tag, commit/build/artifact hashes, contract and transaction links, installation steps, demo script, feedback summary, and final link checker.

Human/Opago delivery:

- grant repository access, record and host the 1-5 minute video, approve user feedback, submit the milestone form, and answer Guardian questions.

The submitted video shows the standalone internal app, visible Mainnet status, real balance, local merchant reference page, QR request, final review, signing, confirmed success, HashScan transaction and contract, and wallet history.

### Proposed schedule

| Week | Technical critical path | Human/external parallel path |
| --- | --- | --- |
| 1 | Scope package and Mainnet network isolation | Thrive clarification and auditor outreach |
| 2 | Account architecture and recovery | Mainnet accounts, pilot limits, onboarding decision |
| 3 | Contract hardening and audit package | Commission audit and select hosting |
| 4 | Merchant service and Android release | Domain, Play Console, legal/privacy material |
| 5 | Audit remediation, security, and stability | Recruit pilot users |
| 6 | Signed candidate and deployment rehearsal | Fund deployment account and approve artifact |
| 7 | Mainnet deployment and canary | Authorize real-fund transactions |
| 8 | User pilot, video, and evidence | Record and submit |
| 9 | Contingency | Guardian follow-up |

### Absolute public-production go/no-go gates

No unrestricted real-user or app-store release is allowed while any of the following remains true. The completed internal grant canary is not such a release:

- grant classification or required-service scope is unresolved;
- account and recovery architecture is not approved;
- a private key could enter the bundle, repository, diagnostics, or public environment;
- a reachable critical/high security issue or independent-review blocker is open;
- the contract artifact is not deterministic and runtime-pinned;
- the release depends on Metro, ADB, or a development client;
- clean-device recovery has not passed;
- Mainnet payment and aggregate pilot caps are absent;
- the merchant service is local-only;
- a failed, unknown, or timed-out transaction can be shown as successful;
- support and incident owners are not assigned.

## Hedera implementation

The Hedera integration uses [`@hiero-ledger/sdk`](https://github.com/hiero-ledger/hiero-sdk-js) `2.88.0` directly in the React Native client. Private keys remain in runtime memory while account data and transaction history come from the official Mirror Node selected and locked by the build profile. Testnet remains the safe default; Mainnet requires the complete release evidence tuple described above.

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

### Phase 4 physical-device receive acceptance

| Field | Result |
| --- | --- |
| Date | 2026-08-10 |
| Device | Physical Android 14 device |
| Network | Hedera testnet |
| Requested and received amount | `0.001 HBAR` (`100,000` tinybars) |
| Source | `0.0.7314364` (MetaMask) |
| Destination | `0.0.9960666` |
| Mirror Node transaction type | `ETHEREUMTRANSACTION` |
| Consensus status | `SUCCESS` |
| Transaction | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.7314364%401786354442.132871379) |

The first physical receive attempt exposed that MetaMask-originated HBAR transfers are returned as `ETHEREUMTRANSACTION`, while the wallet previously loaded only `CRYPTOTRANSFER` history. The receive flow now merges both official Mirror Node transaction types and confirms only a new, successful incoming transaction whose exact bigint tinybar amount matches the QR request. The application displayed its confirmed payment-received state for the transaction above, and an independent Mirror Node lookup verified the same status and amount.

### Phase 4 physical-device recovery acceptance

| Field | Result |
| --- | --- |
| Date | 2026-08-12 |
| Device | Physical Android 14 device |
| Network | Hedera testnet |
| Public key | `1953ffa170351ae5a33ff2f99e342090418a01905efda28116d81c3dfcbe3299` |
| Account before deletion | `0.0.10030291` |
| Balance before deletion | `2 HBAR` |
| Account after recovery | `0.0.10030291` |
| Balance after recovery | `2 HBAR` |

The wallet was provisioned for the public key above, discovered the account and balance on Android, required three randomly selected paper-backup words before enabling local deletion, and returned to the unauthenticated create/restore screen after deletion. Restoring from the paper phrase derived the same Hedera key and rediscovered the same account and balance through the Mirror Node. Recovery display, verification, and entry block screen capture; phrase state is cleared when the app backgrounds; and deletion authorization lasts only for the current foreground session. No recovery phrase or private key is included in this evidence.

### Hedera key and transaction flow

1. The app loads or creates a BIP39 recovery phrase in native secure storage.
2. It derives the Hedera Ed25519 key and retains the private key only in runtime memory.
3. The Settings screen exposes only the public key for local testnet provisioning.
4. The provisioning script creates or finds the matching account using local operator credentials.
5. The app resolves the account through the Mirror Node, signs the HBAR transfer on-device, and validates the network receipt.

The operator account is used only to create and initially fund the wallet's testnet account. Its private key is never required by the mobile app.

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

- Node.js `20.19` or newer
- npm
- Android Studio with a compatible Android SDK and JDK
- A physical Android device with USB debugging, or an Android emulator

Wallet-key storage requires a native Android or iOS build. Hedera Phases 1, 2, and 3 were verified on a physical Android device. The recorded Phase 3 checkout used the installed development client with the current Metro bundle; a clean-clone, fresh native build and installation remain a Phase 5 release-evidence gate. iOS verification is outside the current milestone.

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
| `EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR` | `1` on testnet; required on Mainnet | Human-approved upper bound for one app-initiated HBAR transfer |
| `EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID` | `0.0.9972670` in `.env.example` | Enables only the deployed, verified Phase 3 testnet checkout contract |
| `EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256` | verified hash in `.env.example` | Pins the exact deployed Phase 3 runtime bytecode in the app build |
| `EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS` | `100` | Additional ceiling used by Lightning fee validation |
| `EXPO_PUBLIC_ALLOW_INSECURE_HTTP` | `false` | Allows private/local HTTP only in development |
| `EXPO_PUBLIC_EID_BACKEND_URL` | empty | Enables the optional eID reference flow |

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
EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR=1
EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID=0.0.10850063
EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256=18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8
```

Hedera Mainnet requires every listed Hedera value. Lightning Mainnet independently requires its explicit enable flag and matching `mainnet` profile. Partial activation, a mismatched profile, a wrong-network Mirror Node, a missing transfer cap, or missing contract evidence fails during application configuration. The grant-specific `mainnet-candidate` EAS profile deliberately keeps Lightning on regtest; the `production` profile enables both reviewed Mainnet paths while leaving the legacy global switch disabled.

On Windows, an authorized arm64 Android device can receive a standalone, locally signed internal candidate without Metro:

```powershell
npm run android:mainnet-candidate
```

The script rejects a dirty worktree, secrets in the build environment, mismatched deployment evidence, multiple devices, and non-arm64 targets. It records the exact commit and APK hash under the ignored `.codex-local-evidence/mainnet-candidate` directory. This internal APK uses a local debug certificate and is not the final Play Store release.

After code review and explicit real-funds approval, the combined internal HBAR and Lightning candidate is built with:

```powershell
npm run android:production-candidate
```

That command builds and launches the artifact but never initiates a payment. Continue with the manual real-funds gate in [LIGHTNING_MAINNET_ACCEPTANCE.md](LIGHTNING_MAINNET_ACCEPTANCE.md).

Before any public release, complete [Lightning Mainnet Android acceptance](LIGHTNING_MAINNET_ACCEPTANCE.md), follow the [Lightning operations and incident runbook](LIGHTNING_OPERATIONS_RUNBOOK.md), reassess the dependency tree, and obtain independent security, privacy, and regulatory reviews. Network support in source code is not authorization to use real funds; the go/no-go gates remain binding.

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
| `PHASE4_ACCEPTANCE.md` | Physical-device security and failure-path evidence |
| `PHASE5_MILESTONE.md` / `RELEASE_NOTES.md` / `DEMO_SCRIPT.md` | Submission index, milestone changes, clean-build procedure, and video plan |

## Quality gates

```powershell
npm run phase5:verify
```

The application suite passes `109/109` tests and the checkout contract passes `9/9` Hardhat tests. The suites cover deterministic wallet derivation, recovery/deletion safeguards, exact `bigint` tinybar handling, persisted pending/confirmed/failed Hedera and Lightning states, offline and restart reconciliation, ambiguous-submission recovery, account/history/status parsing, exact receive-request matching, paginated Spark history, resumable Lightning invoices, local privacy-preserving health state, third-party-wallet-compatible Hedera QR values, handled polling retries, operator-key/account validation before provisioning, transaction construction, secret boundaries, consumer-safe identifier and status presentation, Lightning invoice and preimage validation, payment amount binding, OCP quote integrity, eID proof verification, replay protection, remote URL policy, and checkout success and failure paths.

## Security reporting

Do not open a public issue containing recovery phrases, private keys, identity payloads, invoices, preimages, callback secrets, or raw sensitive transaction data. Use redacted reproduction details and contact the project owner through a private channel. Current audit status and known release blockers are documented in [SECURITY.md](SECURITY.md).
