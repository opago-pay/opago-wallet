# P05: interrupted Lightning send with no remote match

22 September 2026. **Unresolved; release-blocking.** This is a local investigation and a prepared provider question set. It has not been sent to Spark. No recovery words, keys, invoice, payment hash or wallet identity are included.

## Observed on Android

- The owner approved a 20-SAT Lightning payment, maximum fee 2 SAT, around 11:45 MESZ. The test disconnected networking after the PIN prompt closed. Opago reported an unknown outcome.
- Opago was force-stopped while offline at 11:46, then connectivity was restored. The owner reopened it. The recipient reported no new 20-SAT receipt.
- The local journal still contains an unresolved outgoing payment. The owner screenshot shows 107 SAT; an unchanged displayed balance alone is not settlement or non-settlement proof.
- Automatic recovery executes successfully. The paginated provider request list, transfer history, and sender-role operator HTLC lookup all return no matching record. The latest recorder captured only allowlisted outcome markers; no raw SDK errors or wallet identifiers were retained.
- The operator lookup uses the original payment hash and explicit `matchRole: 1` (sender); the SDK default would be receiver. No status filter is applied. Matching preimage proof can confirm payment; a missing result does not currently authorize retry.

Evidence: [device acceptance](TEST_ACCEPTANCE_2026-09-22.md), L03e–L03g. Local ignored diagnostics: `.codex-local-evidence/matrix-acceptance/p05-operator-owner-recheck.json` and `p05-operator-stages.jsonl`.

## What the code establishes

The pinned SDK is `@buildonspark/spark-sdk@0.7.12`. Its `payLightningInvoice` performs fee lookup, leaf selection/preparation, an operator preimage swap, and then a provider `requestLightningSend` call. Therefore, an exception from this single public method does not establish whether submission happened. The app's 45-second timeout also does not cancel the underlying SDK operation.

Before the latest correction, Opago wrote `pending` even before its own final read-only balance check. A process death at that point could leave an unnecessary ambiguous record. The correction completes the balance/fee/expiry/approval checks first, then persists duplicate protection and immediately rechecks approval and expiry before invoking the SDK. It never resolves an older pending attempt merely because a new preflight failed. This reduces false ambiguity for future attempts; it cannot retroactively identify where the 11:45 attempt stopped.

The public [Spark operator QueryHTLC implementation](https://github.com/buildonspark/spark/blob/0b3a32a05c9ac06cc411683551dd1f1bde9d0caa/spark/so/handler/lightning_handler.go#L1812) filters database entries by authenticated identity, role and payment hash. An empty result is a lookup result, not an explicit cancellation acknowledgement. This inspected upstream revision is not proof of the exact currently deployed operator revision or its consistency guarantees.

Opago must retain the unresolved record and same-invoice duplicate guard until an authoritative terminal result exists. Invoice expiry, elapsed time, absence from history, unchanged balance and owner-reported non-receipt are not by themselves used to clear the guard.

## Prepared questions for Spark

Verified official contact on 22 September: **support@spark.money**, listed on the [Spark transaction/wallet issue report page](https://www.spark.money/report) and [contact page](https://www.spark.money/contact). An initial email draft without wallet identifiers is prepared in [SPARK_SUPPORT_REQUEST.md](SPARK_SUPPORT_REQUEST.md). Nothing has been submitted.

1. For SDK 0.7.12, which supported read-only API authoritatively resolves a send by payment hash or the original `opago-<payment-hash>` idempotency key when no provider request ID was returned?
2. If `getUserRequests`, `getTransfers`, and `queryHTLC` with sender role all return no match after process termination, under what documented conditions can the client conclude that no payment can still settle? Specify consistency, retention, legacy sender fields and any in-flight operation considerations.
3. Is there a supported definitive abort/refund protocol for this state, or must the provider/operator investigate it? No abort/refund operation has been attempted by Opago.
4. How should the client recover an operator swap created before `requestLightningSend` was recorded without initiating a new payment? What result and proof constitute safe failure versus completion?
5. Can the SDK expose a durable transfer/request identifier before the ambiguous boundary, or an explicit pre-submission failure classification? A generic network exception cannot safely be classified as unpaid.

## Remaining acceptance

P05 stays yellow. A real interrupted send must reach a verified final result after restart, remove the unknown-status notice, show a single correct history item and prevent duplicate submission. Automatic synthetic tests and extra lookup paths do not substitute for this result. Any future small-value device payment still requires the owner's own review and PIN approval; none is initiated by this investigation.
