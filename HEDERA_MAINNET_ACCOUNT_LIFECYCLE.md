# Hedera Mainnet account lifecycle decision

**Status:** proposed architecture; Fabian/Opago approval of the onboarding and funding model is still required. No Mainnet account is created by this document or by the application build.

## Decision summary

Opago should preserve the existing version-1 Hedera key derivation for the first Mainnet pilot:

| Property | Locked value |
| --- | --- |
| Derivation version | `1` |
| Algorithm | Ed25519 |
| Path | `m/44'/3030'/0'/0'` |
| Recovery input | Existing protected BIP39 phrase |

The recommended pilot onboarding model is a sponsor-created native Hedera account controlled by the wallet's derived Ed25519 public key. The app may provide only the public key to an authenticated onboarding service. A separately controlled sponsor account pays the `AccountCreateTransaction`; its operator key never enters the app, repository, browser, QR payload, or any `EXPO_PUBLIC_*` variable.

This is a proposal until Opago approves the sponsor budget, abuse controls, user eligibility, and operator ownership.

## Why the derivation remains unchanged

- The existing recovery phrase already reproduces the same Hedera key deterministically and has passed testnet recovery acceptance.
- Hedera account creation supports both Ed25519 and ECDSA account keys, so a Mainnet account can be created for the existing public key without changing wallet recovery. See Hedera's [account-create transaction guidance](https://docs.hedera.com/hedera-transaction-tool-v2/general/create-and-sign-a-transaction).
- ECDSA/EVM alias onboarding is useful for Ethereum tooling, but it requires a different key algorithm and derivation decision. Hedera's official workshop distinguishes native Ed25519 accounts from ECDSA EVM accounts and uses an Ethereum derivation path for the latter. See the [HSCS setup and account guidance](https://docs.hedera.com/hedera/tutorials/smart-contracts/hscs-workshop/setup).
- The Mirror Node can resolve an account by ID, alias, or EVM address, but discovery does not itself create or fund an account. See the official [Account API](https://docs.hedera.com/api-reference/accounts/get-account-by-alias-id-or-evm-address).

Changing the algorithm or path without an explicit migration would cause an existing recovery phrase to select a different key and could make funds appear lost. Therefore version 1 is immutable; any future ECDSA path must be introduced as a separately versioned account type with an explicit migration and coexistence plan.

## Options considered

| Option | Benefit | Cost/risk | Pilot position |
| --- | --- | --- | --- |
| Existing Mainnet account only | No sponsor infrastructure | New users cannot onboard; arbitrary imported keys are incompatible with the current phrase | Supported later as an advanced path, not sufficient alone |
| Sponsor creates native account for derived Ed25519 public key | Preserves current recovery and numeric account-ID flow | Requires backend, HBAR budget, authentication, rate limits, and operator security | Recommended for controlled pilot |
| ECDSA alias/hollow-account path | Familiar MetaMask/EVM address flow | New derivation/key type, migration complexity, changed account identity | Deferred pending a separate architecture decision |

## Implemented foundation

- Derivation version, algorithm, and path are exported as immutable metadata.
- Unsupported derivation versions fail closed.
- Account bindings use distinct testnet and Mainnet storage keys.
- A binding contains only public metadata: schema, network, derivation version, algorithm, public key, and numeric account ID.
- Cached bindings are never trusted for signing. The account is reloaded from the selected Mirror Node and its on-chain key must match the currently derived wallet key.
- A malformed, stale, cross-network, or different-wallet binding is discarded and account discovery runs again.
- Wallet deletion removes bindings for both networks.

## Proposed onboarding sequence

1. The wallet derives version-1 Ed25519 keys locally and displays the public key; no private material leaves secure storage/runtime memory.
2. The authenticated user requests pilot onboarding from the production merchant/onboarding service.
3. The service validates eligibility, idempotency, rate limits, aggregate sponsor exposure, and the public-key format.
4. A human- or policy-controlled sponsor creates the account with the submitted public key and a capped initial balance.
5. The service returns only the public transaction/account identifiers.
6. The app independently discovers the account through the Mainnet Mirror Node and verifies that its on-chain key equals the locally derived public key.
7. The account ID is cached as untrusted public metadata and revalidated before use.

## Recovery sequence

1. Install the signed app on a clean device.
2. Enter the complete recovery phrase in the protected recovery screen.
3. Derive the immutable version-1 Ed25519 key locally.
4. Discover or load the Mainnet account and require an exact on-chain public-key match.
5. Show the account and balance only after validation; never create a replacement account silently when an existing binding cannot be verified.

## Human decisions blocking completion

- Approve sponsored account creation versus existing-account-only onboarding.
- Name the sponsor/deployment account owner and backup operator.
- Set initial funding, per-user, daily, and aggregate HBAR limits.
- Define authentication, allowlist, rate-limit, replay, and abuse-response policy.
- Decide whether a user may have more than one numeric account for the same key; the current wallet requires a unique match.
- Approve the future position on ECDSA/MetaMask import and whether it is explicitly outside the first pilot.

## Milestone 2 remaining acceptance

- Implement the approved onboarding service and idempotent account-creation workflow.
- Exercise a real Mainnet account creation with a canary amount only after all go-live gates.
- Recover the same Mainnet account and balance on a clean physical Android device.
- Verify behavior for unfunded, missing, deleted, duplicated, mismatched, and temporarily unavailable accounts.
