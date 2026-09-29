# TME amendment — contract 0.2.0

Normative clarification of plan V7, sections 3.4, 3.8 and 4.3. These are implementation decisions supplied with the contract, not a claim that the team has approved a production rulebook or deployed them. TME evaluates money-laundering risk. This document defines transport/state behavior; it does not prescribe risk thresholds or legal conclusions.

## Authority and scope

Internal owns the authoritative policy per environment/network: `mode` (`shadow` initially, switchable to `enforcing`), immutable rulebook `policy_version`, monotonically increasing `policy_epoch`, effective time, approving operator, reason and audit reference. Configure initial shadow explicitly; missing/unknown configuration fails closed for API invoice issuance with `tme_unavailable`, never defaults to shadow. A mode/rule change, including rollback, increments the epoch. Use the existing privileged internal deployment/control process, authenticated and audited; no wallet/public endpoint may change it. Actual rules, freshness bounds and switch authorization must be approved before production activation.

Wallet custody is immutable server state per wallet. One party can own both types; do not infer custody from that party, selected address syntax or client JSON. New Spark enrollments in this contract are non-custodial. `Wallet.custodial` and `Account.wallets[].custodial` are read-only output. Public requests cannot change them. Custodial license, full-identification and mandatory pre-check gates stay separate and enforcing regardless of the non-custodial switch.

This switch controls invoices OPAGO creates/offers through registration, LNURL, UMA and POS. It cannot prevent direct wallet-to-wallet Spark sends or revoke a BOLT11 already delivered. Such payments are still observed and evaluated afterward. An app must not implement an automatic direct-payment fallback to bypass a rejected OPAGO invoice.

## Decision and response model

Keep an append-only decision history. Every check attempt has a durable `pre_check_id`, input fingerprint, current policy version/epoch, evaluation time, status, expiry if applicable and evidence-input revision. Fingerprint binds registration, wallet/recipient, custody, network, amount, effective invoice-description hash, supplied payer attribution and evidence quality. Changing eligibility, attribution, rulebook, confirmed aggregates or relevant account restrictions invalidates an older decision. Rule-engine results for older input/policy revisions cannot overwrite a newer decision. Reuse requires matching inputs/revisions and an unexpired approved lifetime, at most 24 hours; a policy may require shorter or immediate reevaluation. A worker outage or missing result is never an approval.

The existing `Registration` response adds required `tme_mode`, `tme_policy_version`, `tme_policy_epoch`, `tme_blocked` and nullable `reject_reason`. `pre_check_status` now means `ok` (positive), `rejected` (negative), `pending` or `unavailable`. It does not mean merely that the HTTP request to the engine succeeded. A positive result requires non-null ID and validity time. `tme_blocked` describes the TME gate only; false does not override another eligibility gate. If authoritative policy cannot be loaded, return a generic `tme_unavailable` error instead of inventing a Registration policy snapshot.

| Mode | Current decision | Issuance/delivery | Error for issuance request |
|---|---|---|---|
| shadow | ok | Allowed if all other gates pass | none |
| shadow | rejected | Allowed; preserve negative finding | none |
| shadow | pending/unavailable | Allowed; persist durable follow-up | none |
| enforcing | current valid ok | Allowed if all other gates pass | none |
| enforcing | rejected | Block; status rejected, reject_reason=tme_rejected | HTTP 403, tme_rejected, retryable=false |
| enforcing | pending | Block temporarily | HTTP 503, tme_pending, retryable=true |
| enforcing | unavailable/missing/expired decision | Block temporarily; reevaluate | HTTP 503, tme_unavailable, retryable=true |

Unavailable/pending alone does not terminally reject a registration. Preserve its lifecycle (`open`, `invoice_issued`, etc.) and operation identifiers; `invoice_issued` may refer to a previously created invoice now withheld. While `tme_blocked=true`, `Registration.invoice` MUST be null. Actual invoice/operation history stays internal. `GET registration` may return this bounded state with HTTP 200. Do not expose a previously issued BOLT11 through status/history response fields or error details while the current delivery gate blocks. Historical local copies cannot be recalled.

Issuance errors use the existing encrypted `Error` transport. For an authenticated owner only, `details` may include `registration_id` and `retry_after_seconds` (integer 1–300); it never includes AML findings, rule triggers or counterparty personal data. Retryable TME responses set `Retry-After: 5` when the engine provides no more appropriate bounded delay. The app shows temporary unavailability versus rejection distinctly and never displays a successful payment based on invoice issuance.

Public LNURL/UMA callbacks keep their protocol format: HTTP 200 `{"status":"ERROR","reason":"tme_unavailable: Invoice temporarily unavailable"}` (or `tme_pending`/`tme_rejected`), with no `pr` or proprietary TME object. Gateway/transport errors retain their existing HTTP semantics. Do not promise third-party wallets will automatically retry these protocol errors.

## Races, idempotency and delivery boundary

1. Bind the logical key/context to one durable registration before evaluation. A retry after 503 resumes that registration and pending operation. A transient 503 must not become a permanently cached result. Input conflicts still return `idempotency_conflict`; a new HPKE envelope does not create a new registration.
2. Check current policy and decision before scheduling the helper. Record the dispatch authorization and immutable invoice inputs. A stale replica may not authorize dispatch from a local environment variable/cache alone.
3. Before making any BOLT11 available, recheck current eligibility/policy/decision. This applies to initial results, helper recovery, invoice refresh, GET status and idempotency replay, including a previously cached successful response. Reuse the stored invoice only after current authorization. Do not replay a cached invoice blob ahead of the gate.
4. Policy updates and release authorization must have a single serialized order in durable storage (e.g. shared policy revision lock/transaction). Atomically record the release's policy epoch, decision ID, input revision and invoice ID. If the policy change commits first, an old epoch cannot authorize release. If release commits first, the response may still arrive after the change: that delivery is already authorized and cannot be reliably recalled. This is the defined linearization boundary, not a claim of packet-level cancellation.
5. If a helper is already executing when policy changes, preserve/resolve its operation. Withhold its result unless current release authorization succeeds. A mode change, a 503 or absence of a result never proves non-execution and never alone permits another invoice. Use the existing helper fencing/unknown rules. A terminal TME rejection makes already-created invoices unavailable for offering; later real payments remain recorded.
6. An explicitly rejected registration stays terminal after a mode/rule change. Its response retains the rejecting decision's policy snapshot and has invoice=null; it does not purport to advertise the current global mode. Do not automatically create a new context or operation to circumvent that decision. A new user-requested payment is evaluated again under current recipient restrictions and policy; it cannot reset a party-level restriction. Transient waits recover the existing registration.

No invoice or decision-response caching at facade/CDN. Internal returns the currently authorized response; the facade forwards without a separate policy engine. Mode changes must be tested across multiple replicas and in-flight helpers, not just in a single-process mock.

## Observations, evidence and rolling values

Evaluate incoming/outgoing customer payments. Exclude fee-only, commission-only and internal ledger postings from both the payment rule path and its rolling totals; the payment's fee remains audit context, not another customer payment. Classification comes from authoritative transaction semantics and provider evidence, not a client-controlled `exclude_from_tme` flag. Unknown classifications remain visible for reconciliation and are not silently relabeled as harmless. Whether a genuine self-transfer is a customer payment follows the approved rulebook; do not confuse it with a bookkeeping-only posting.

Preserve app observations and independently checked provider evidence separately. Only `verification_status=verified` actual settlements enter confirmed rolling values; pending, reported_unconfirmed, conflict and disproved records do not. Mere invoice creation, a client-supplied preimage/hash, payer_proof, signed UMA identity data or a peer callback claiming COMPLETED does not by itself establish the full independently verified payment and wallet attribution. A matching preimage can support invoice-fulfillment evidence but cannot identify the paying wallet.

An independently confirmed incoming payment may count for the bound recipient despite an unknown payer. A customer-specific outgoing total additionally needs independent attribution to that customer's sending wallet/party. Evidence that an invoice was paid by someone is insufficient. In Spark privacy cases, leave unprovable attribution/coverage explicitly incomplete; a reported zero confirmed total is not proof of zero activity. The approved rulebook defines how incomplete coverage affects risk decisions.

Deduplicate by economic payment identity (network and payment hash/transfer ID) and justified customer role/direction, not by observation event ID, installation, invoice request or ingestion retry. Count the principal amount once, using verified settlement time for the configured window; incoming and outgoing roles can legitimately exist for different customers. Account-level views must deduplicate observations of the same customer role across wallets. Later evidence can admit a previously unconfirmed payment; a conflict/retraction removes its current contribution and preserves an audit correction. Late real payments on expired/voided/orphaned invoices remain eligible when independently proven. In-flight reservations used by a rule are separate from confirmed rolling totals and must not masquerade as settled payments.

Reuse existing suitable Payment-ID/hash fields and metadata where possible. The wire contract does not mandate a new SQL column for every field; add columns/indexes only for documented integrity/performance needs. Do not silently enable storage or client transmission of raw preimages: V7's general mention of existing fields conflicts with its later proposal not to store preimages. This contract retains no preimage field in the app ingest; required provider evidence must be handled with an explicit internal retention decision.

## Release evidence

`acceptance.json` TME-01 through TME-12 require real implementation evidence. Schema validation proves only shape/selected invariants. Production activation additionally needs an approved versioned rulebook, freshness/coverage policy, operator authorization and audit evidence. No rule thresholds, AML-ticket policy, external notification or production mode switch is approved by this package alone.
