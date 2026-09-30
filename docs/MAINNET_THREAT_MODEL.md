# Hedera Mainnet threat model

**Status:** updated after the internal Mainnet canary and Thrive submission. It must be revisited after independent review and before any public app-store release.

## Protected assets

- recovery phrases and derived private keys;
- user and merchant HBAR;
- account IDs, aliases, and approved contract identity;
- payment request integrity: network, merchant, amount, nonce, expiry, and payment ID;
- transaction status and local payment journal integrity;
- release signing key, deployment key, backend secrets, and production configuration;
- public evidence linking source, compiler input, bytecode, deployment, and Android build.

## Trust boundaries

1. Android secure storage and in-memory signing state.
2. QR/deep-link input received from an untrusted merchant or camera.
3. Hedera consensus nodes used for submission and receipts.
4. Mirror Node data used for account discovery, history, contract runtime, and reconciliation.
5. Public merchant service generating payment requests.
6. Build and release environment embedding public network metadata.
7. Human-controlled Mainnet deployment, treasury, Play Console, and hosting accounts.

## Principal threats and controls

| Threat | Impact | Required control |
| --- | --- | --- |
| Testnet/Mainnet confusion | Real funds sent while the user believes they are testing | Matching build profile and network, explicit Mainnet flag, network-specific QR parsing, visible Mainnet warnings, network-bound HashScan and Mirror Node URLs |
| Contract substitution | Payment sent through attacker-controlled bytecode | Build-time contract ID, pinned runtime SHA-256, Mirror Node runtime verification, chain-bound payment ID, review screen |
| Merchant or amount tampering after request creation | Funds routed incorrectly | Payment ID binds chain ID, contract, nonce, merchant, amount, and expiry; exact tinybar arithmetic; final review |
| Merchant impersonation at request creation | An attacker creates a valid request paying the attacker's account | Current candidate displays the exact recipient and makes no verified-merchant claim; public release requires signed merchant requests or a trusted registry |
| Replay or duplicate submission | Repeated payment | Unique nonce and payment ID, on-chain duplicate rejection, local single-flight submission, reconciliation after restart |
| False success | User or merchant treats a failed payment as final | Success only after consensus receipt or Mirror Node `SUCCESS`; pending and failed states remain distinct |
| Key disclosure | Irrecoverable loss of funds | Secure storage, no secret logs, no operator key in bundle, local-only signing, redacted diagnostics, backup education |
| Malicious or mismatched Mirror Node | Incorrect account, status, or contract data | Official network-bound endpoint in the initial pilot, HTTPS, response bounds, exact integer preservation, receipt/runtime checks |
| Compromised merchant service | Fraudulent requests or availability loss | The current local demo is not a production trust anchor; a future service requires HTTPS, authentication, rate limits, persistence, idempotency, short expiry, redacted logs, and health monitoring |
| Dependency or supply-chain compromise | Key theft or manipulated transactions | Exact lockfile, reachability review, SBOM, secret scan, reproducible build, independent review |
| Lost device or recovery phrase | Permanent user loss | Explicit backup verification, secure wipe, recovery test on a clean device, clear non-custodial support boundary |
| Compromised release/deployment account | Malicious app or contract release | Human-controlled keys, least privilege, protected signing storage, two-person release review where possible, recorded artifact hashes |
| Unbounded real-fund exposure | Large pilot loss | Human-approved per-payment and aggregate caps, limited cohort, canary transactions, staged rollout |

## Fail-closed invariants

- Mainnet cannot activate from an in-app switch.
- `EXPO_PUBLIC_HEDERA_NETWORK=mainnet` is insufficient without the Hedera-specific real-fund flag and matching build profile.
- A Mainnet build is invalid without a human-approved transfer cap, verified contract ID, and pinned runtime hash.
- Payment requests for another network are rejected before review or signing.
- HashScan and Mirror Node URLs must match the configured network.
- Operator, faucet, deployment, merchant, and user private keys are never public build variables.
- A timeout, crash, unknown result, or unavailable Mirror Node never becomes a successful payment.

## Open design risks

- Mainnet onboarding uses user-funded first-deposit activation of the existing Ed25519 key alias. Internal activation succeeded, while broad third-party sender interoperability and clean-device Mainnet recovery acceptance remain pending; ECDSA import is deferred.
- The current merchant demo is local and is not a production service.
- Checkout requests are integrity-bound but are not signed by an authenticated Opago merchant service.
- The contract and mobile key lifecycle have not received independent production security review.
- Release signing, hosted monitoring, legal review, support ownership, and incident ownership are not yet established.
- The internal candidate has a `1 HBAR` per-payment cap, but no aggregate public-pilot budget or external cohort is approved.

These risks are release blockers, not documentation-only follow-ups.
