# Draft — not sent

To: support@spark.money
Subject: SDK 0.7.12: safe recovery of interrupted Lightning send with no matching request or HTLC

Hello Spark team,

We are developing Opago, a React Native Bitcoin wallet using `@buildonspark/spark-sdk@0.7.12` on Android. A controlled Mainnet acceptance test has exposed a recovery case we cannot safely resolve.

The user approved a 20-sat Lightning invoice with a maximum fee of 2 sats. We intentionally disconnected networking after device authorization. `payLightningInvoice` did not produce a final result, so the app retained its local pending record and blocked repeat submission. We then force-stopped the app while offline, restored connectivity, restarted and unlocked it. The recipient reports no new payment.

Repeated read-only recovery checks find no matching record:

- `getUserRequests` with cursor pagination, matching Lightning send requests by the original payment hash.
- `getTransfers` with pagination and outgoing request matching.
- `queryHTLC({ paymentHashes: [originalHash], matchRole: 1, limit: 100, offset: 0 })`, explicitly using the sender role, with no status filter.

All three lookups completed without reported errors and returned no match in 26 captured passes. We have no provider request ID because the original call did not return one. We supplied `opago-<original-payment-hash>` as the SDK idempotency key. We have not retried the payment, cleared the pending record or attempted a refund/cancellation.

What is the supported way to establish a definitive outcome in this case? In particular:

1. Is there a status lookup by payment hash or original idempotency key that proves either settlement or that payment can no longer settle?
2. Under what documented conditions, if any, can empty sender-role HTLC and provider lookups be treated as definitely not submitted? Please include consistency, retention and in-flight operation guarantees.
3. How should a client recover if the operator swap exists but the later provider `requestLightningSend` step was interrupted?
4. Can the SDK expose a durable identifier or explicit pre-submission failure boundary before returning an ambiguous network error?

Our app now completes its own read-only preflight before persisting pending state. That prevents preparation-only failures from leaving new ambiguous entries, but does not establish where this earlier attempt stopped inside the SDK. We do not treat absence, invoice expiry, elapsed time or balance alone as proof of non-payment.

We need an authoritative recovery path before accepting this scenario for public release. This initial report contains no invoice, payment hash, wallet address or private key material.

Thank you,
Opago development team

---

Contact verified via [Spark's official issue-report page](https://www.spark.money/report). Local detailed findings: [SPARK_PENDING_SEND_INTEGRATION.md](SPARK_PENDING_SEND_INTEGRATION.md).
