# Payout wallet decisions and API handoff — 27 October 2026

## Approved decisions

Michael permits unlink without immediate replacement. After unlink commits,
both incoming and outgoing OPAGO account payments must remain blocked until a
new binding commits. This applies across POS, LNURL and payout paths; a frontend
flag or a disabled button is not enforcement. Existing local self-custodial
BTC/Lightning/HBAR functions are separate. Neither unlink nor relink wipes a
seed, closes Spark, deletes a local wallet, recovers funds or sends a transfer.

If the wallet and seed are lost, OPAGO cannot recover the self-custodial funds.
The user may unlink using account authority without possessing the old key and
then link a new wallet. Restoring with an existing seed remains supported and
is not lost-key recovery. No automatic new seed or support recovery is introduced.

Compliance retains binding evidence for **five years**, including after unlink.
The wallet displays this policy; it does not implement the evidence database,
purge job or a five-year local token/challenge/QR cache. The retention clock,
record schema and purge implementation must be documented by that backend owner
before release. Unlink is not account deletion or a request to erase all evidence.

## Ownership (Michael's corrected assignment)

| Scope | Owner |
| --- | --- |
| `login`/`wallet_bind` Challenge/Verify, `/api/account`, `/api/account/wallets`, broker-token compatibility with Keycloak AccountBearer F3 | Our separate **OPAGO API project chat**; no duplicate API PR here |
| Keycloak/broker client, required Kubernetes public values, five-year Compliance binding evidence, pin/deploy | Michael's team |
| Native clients, verified identity signature, lifecycle guards, explicit review and app copy | This Wallet draft PR |
| Dashboard policy notices; later QR creation/unlink controls after agreed API contract | Dashboard draft |

The API source snapshot `22ba5724b0b9d4e67efa5a767295064d6af9e402` still publishes
`contracts/lnurl-spark/v2/route-map.json` version **0.2.0**. The existing adapter
uses this map: public `/api/v2/account`, `/api/v2/account/wallets`,
`/api/v2/wallet/auth/challenge` and `/verify`, with HPKE and unchanged broker
credentials as AccountBearer. The app does not contact private Keycloak, change
a token's issuer/audience, or treat a broker login as WalletBearer authority.
`signSchnorrWithIdentityKey` remains the BIP340 ownership signer behind the
existing validated `WalletAuthIntent` and canonical challenge checks.

## Draft wallet flow and remaining contract boundary

`lib/opago/payout-pairing.ts` prepares review and confirmation through injected
ports. `payout-pairing-model.ts` is an **adapter-domain model, not a published
API response schema**. There is no HTTP mapping, native bootstrap, camera entry
or production action enabled for this model. The existing immutable 0.2.0 HKA
schemas and `wallet_bind` action parameters are unchanged.

The QR shape follows the supplied version-1 proposal: exact type/issuer,
intent ID, pairing code and UTC expiry, maximum 300 seconds. Scanning is local
and does not sign or authenticate. A verified fresh account login and owner-
scoped intent/status must precede review. Wrong account, expired QR, existing
binding without replacement, or changed revision stops before proof/signing.

Confirm passes the entire intent/QR/key/network context to the dedicated proof
port. That port must not reuse a generic F3 proof as proof of an unrelated QR.
The API project must publish the cryptographic binding of the intent/code,
verified account, party/generation, key and network before wiring this port to
Challenge/Verify. An account subject is never substituted for `party_id`.
No unsigned `/user/wallet/link` fallback or local proof token is allowed.

Unlink has its own fresh account/status review and explicit confirmation, with
an expected binding revision and operation UUID. It requires neither the old
Spark key nor proof from that key. After a successful authoritative response,
no-wallet status requires both payment flags false. A new wallet can later be
reviewed and linked. Replacement must be atomic and revision guarded; never
emulate it by first unlinking and then trying to bind.

A failed/lost mutation response stays uncertain and does not enable payments.
Read-only reconciliation cannot repeat a mutation or switch to another account.
Locks, account/wallet changes and cancellation must invalidate all pending work;
the native integration must call `cancel` on lifecycle changes and supply a
`current` guard for every asynchronous step. QR, code and proof remain memory-only
and must not enter router URLs, logs, analytics, clipboard or screenshots.

## Required API acceptance before enabling UI/native build

The separate API chat must agree pairing-intent create/read/confirm, unlink,
proof context, fresh-auth/step-up, status, version/idempotency and reconciliation
schemas/error codes. The current F3 map alone does not define those endpoints.
Do not add guessed JSON endpoints or bypass HPKE to make a test appear to pass.
API/Compliance must atomically consume proofs, update binding, preserve pending
payment attribution, enforce every payment gate, and persist retention evidence.

Run real facade-to-Compliance acceptance for first bind, wrong account/tenant,
expiry/replay, unlink with no old key, no payments while unlinked, new-wallet
relink, atomic concurrent replacement, in-flight payments and lost responses.
Do not pin/deploy, enable F3 or call the flow end-to-end ready based on synthetic
port tests. After contract/integration acceptance, wire the reviewed native UI
and create a new EAS preview with an approved account and matching network policy.
