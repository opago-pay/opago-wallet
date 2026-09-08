# Hedera Mainnet account lifecycle decision

**Status:** Fabian approved user-funded first-deposit activation on 7 September 2026. Pilot users must already hold HBAR in a compatible wallet. Opago does not sponsor account creation. Implementation and automated checks do not constitute physical-device or Mainnet acceptance.

## Decision summary

Opago should preserve the existing version-1 Hedera key derivation for the first Mainnet pilot:

| Property | Locked value |
| --- | --- |
| Derivation version | `1` |
| Algorithm | Ed25519 |
| Path | `m/44'/3030'/0'/0'` |
| Recovery input | Existing protected BIP39 phrase |

The approved pilot model uses the locally derived Ed25519 key alias. A first HBAR transfer to this alias auto-creates the account; the transfer payer bears creation and transfer fees. Opago does not submit or fund that transaction and needs no sponsor service or sponsor key. The alias is public and network-agnostic, so the selected network must always be displayed separately.

Pilot eligibility: users already hold HBAR in a sender supporting Ed25519 key-alias transfers. No external wallet or exchange is claimed compatible until tested. Users without such a sender are outside the initial pilot.

## Why the derivation remains unchanged

- The existing recovery phrase already reproduces the same Hedera key deterministically and has passed testnet recovery acceptance.
- Hedera account creation supports both Ed25519 and ECDSA account keys, so a Mainnet account can be created for the existing public key without changing wallet recovery. See Hedera's [account-create transaction guidance](https://docs.hedera.com/hedera-transaction-tool-v2/general/create-and-sign-a-transaction).
- ECDSA/EVM alias onboarding is useful for Ethereum tooling, but it requires a different key algorithm and derivation decision. Hedera's official workshop distinguishes native Ed25519 accounts from ECDSA EVM accounts and uses an Ethereum derivation path for the latter. See the [HSCS setup and account guidance](https://docs.hedera.com/hedera/tutorials/smart-contracts/hscs-workshop/setup).
- The Mirror Node can resolve an account by ID, alias, or EVM address, but discovery does not itself create or fund an account. See the official [Account API](https://docs.hedera.com/api-reference/accounts/get-account-by-alias-id-or-evm-address).

Changing the algorithm or path without an explicit migration would cause an existing recovery phrase to select a different key and could make funds appear lost. Therefore version 1 is immutable; any future ECDSA path must be introduced as a separately versioned account type with an explicit migration and coexistence plan.

## Options considered

| Option | Benefit | Cost/risk | Pilot position |
| --- | --- | --- | --- |
| First HBAR deposit to Ed25519 key alias | Existing recovery; no Opago sponsorship | Requires a compatible funded sender and network verification | Approved for controlled pilot |
| Existing Mainnet account only | No sponsor infrastructure | New users cannot onboard; arbitrary imported keys are incompatible with the current phrase | Supported later as an advanced path, not sufficient alone |
| Sponsor creates native account for derived Ed25519 public key | Preserves current recovery and numeric account-ID flow | Requires backend, HBAR budget, authentication, rate limits, and operator security | Not selected |
| ECDSA alias/hollow-account path | Familiar MetaMask/EVM address flow | New derivation/key type, migration complexity, changed account identity | Deferred pending a separate architecture decision |

## Implemented foundation

- Derivation version, algorithm, and path are exported as immutable metadata.
- Unsupported derivation versions fail closed.
- Account bindings use distinct testnet and Mainnet storage keys.
- A binding contains only public metadata: schema, network, derivation version, algorithm, public key, and numeric account ID.
- Cached bindings are never trusted for signing. The account is reloaded from the selected Mirror Node and its on-chain key must match the currently derived wallet key.
- A malformed, stale, cross-network, or different-wallet binding is discarded and account discovery runs again.
- Wallet deletion removes bindings for both networks.

## Approved onboarding sequence

1. Derive the existing version-1 Ed25519 key locally.
2. Look up the account on the configured Mirror Node and verify its public key. A lookup failure displays an error, not an activation prompt.
3. If no account is found, display the SDK-encoded key alias and QR with the build network. Explain sender fees and compatibility requirements.
4. The user sends HBAR from a compatible wallet on that same network. Never ask them for a sender private key in Opago.
5. Poll while Receive is foreground; discover and verify the resulting account through Mirror Node. Repeated deposits must resolve to the same account.
6. Switch to the normal numeric account receive flow only after verification. An account with zero balance exists but still cannot pay until it has enough HBAR for amount plus fees.
7. Signing continues to require a fresh verified account; no automatic account-creation transaction is submitted by Opago.

## Recovery sequence

1. Install the signed app on a clean device.
2. Enter the complete recovery phrase in the protected recovery screen.
3. Derive the immutable version-1 Ed25519 key locally.
4. Discover or load the Mainnet account and require an exact on-chain public-key match.
5. Show the account and balance only after validation; never create a replacement account silently when an existing binding cannot be verified.

## Remaining decisions and acceptance

The concrete Android build and test procedure are in [HEDERA_ACTIVATION_TESTNET_ACCEPTANCE.md](HEDERA_ACTIVATION_TESTNET_ACCEPTANCE.md). HashPack is a documented sender candidate; exact-version interoperability remains pending.

- Confirm specific compatible sender wallets through an actual Testnet first-deposit test; record wallet version and transaction/account IDs.
- Verify on a physical Android device: fresh wallet, first deposit, delayed Mirror indexing, restart, repeated deposit, recovery to the same account, and foreground/background behavior.
- Confirm pilot size, transfer limits, distribution, support and incident owners. Sponsor budgets and sponsor operators are not required for this model.
- Keep the unique-key match requirement; arbitrary existing-account import and ECDSA/MetaMask migration remain outside this pilot.
- Mainnet canary activation and clean-device recovery remain gated by security and go-live approval. Never reuse exposed test keys.

## Local implementation evidence

- Receive shows an SDK-generated Ed25519 key-alias QR only after an empty successful account lookup, with separate network and compatibility guidance.
- Missing accounts keep polling; network errors remain errors. Existing accounts use the verified numeric-ID flow.
- Automated tests exercise deterministic alias recovery, transfer serialization without submission, missing/unfunded/deleted/duplicate/mismatched accounts and lookup errors.
- External sender interoperability and live Testnet auto-creation have not yet been verified. No Mainnet transaction was performed.
