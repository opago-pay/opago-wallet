# Lightning operations and incident runbook

## Runtime model

The mobile wallet uses the pinned Spark SDK directly. Opago does not run a custody or payment-signing backend. The recovery phrase remains device-protected and payment confirmation requires an on-device review plus biometric/device authentication on Mainnet.

The app stores a non-secret Lightning journal before submission. Records contain only payment hash, amount, opaque Spark request ID, state, and timestamps. Unknown outcomes remain `pending`; only a matching preimage promotes a payment to `confirmed`. Incoming invoices are privacy-sensitive and use device-protected SecureStore until paid, expired, replaced, or the wallet is removed.

## Local health check

Home reads a small recent-activity page (five records per remote source), including HBAR receipts, before the full Activity view is opened. While Home is focused and the app is active, activity and balances refresh every 20 seconds and on app resume; older pages load only through the full history footer. HBAR activity and explicitly opened HBAR holdings do not wait for Bitcoin startup. Opening Send also reconciles unresolved Lightning payments; the pending journal continues to block resubmission until resolved. Settings > Advanced wallet details shows a privacy-preserving local Lightning status. It stores only success/failure timestamps, a consecutive-failure count, and a broad error category. It never stores invoices, payment hashes, preimages, keys, or recovery words.

The All coins section shows Bitcoin's shared available Lightning/onchain balance in BTC, its estimated EUR value and the price of one BTC. Incoming Spark transfers and pending static-address deposits are shown separately and excluded from that available balance. HBAR shows its holdings, estimated EUR value and price of one HBAR. Cached or unavailable values retain explicit status labels; updating/error labels do not hide the unit price.

## Transaction EUR rates

The separate local SQLite ledger `opago-transaction-rates.db` retains a rate job for each observed BTC or HBAR payment, scoped by asset, network and wallet public identity. New outgoing Lightning/HBAR journal entries, Bitcoin operation commits and detected Lightning receipts enqueue valuation metadata without affecting payment submission. History pages also index older/restored transfers. Completed quotes are retained independently of bounded payment journals and survive restart; deleting the wallet clears this ledger and invalidates late work.

Each completed valuation saves EUR per coin, transaction time, quote time, fetch time, source, calculation method and time basis. The fixed public [Binance market-data API](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints) supplies a UTC one-minute opening price for BTCEUR. HBAR/EUR is derived from HBARUSDT / BTCUSDT × BTCEUR for the same minute; it is explicitly labelled a market estimate converted to EUR. No API token or new environment variable is required. Only symbols and minute timestamps go to the price provider, never wallet identities or payment references.

HBAR Mirror consensus time and Spark/provider transaction time replace a provisional app-recorded time when available. Mainnet onchain deposits and confirmed withdrawals use the confirmed transaction's block time from mempool.space; that lookup necessarily sends the public transaction ID to the explorer. Regtest/testnet use a fiat market estimate, not a claim that test coins have real monetary value. A minute market estimate is not a second-exact execution price. Quotes preceding the provider's available history, unavailable timestamps and inaccessible providers remain pending; the app never substitutes today's price for an older payment.

Foreground work is bounded to two due jobs per wallet/network scope, with shared in-flight work and durable retry backoff from 30 seconds up to six hours. Home, full Activity and payment details continue retrying while focused; returning to the app resumes work. A pending valuation does not block payments, and a rate failure does not invalidate a confirmed receipt. Historical HBAR values do not follow subsequent current-rate changes. Legacy BTC snapshots remain readable, but observed history entries request the new consistent valuation. Source, quote time, minute precision and any provisional app-time basis are shown in payment details. Verify rate persistence and offline/resume retry in the next manual TestFlight build.

Because no external monitoring provider is configured, centralized alerting is not claimed. During a canary or public rollout, the release owner must actively monitor support reports and the Spark service status. Adding remote telemetry requires a separate privacy, consent, retention, and data-processing review.

## Release procedure

1. Review dependency and secret scans; pin every security-critical SDK exactly.
2. Run `npm ci`, `npm run phase5:verify`, `npm run production:config:verify`, and the Android acceptance runbook.
3. Record commit, lockfile hash, APK/AAB hash, signing identity, configuration profile, reviewer, and approval time.
4. Start with an internal canary and deliberately small real-fund amounts.
5. Promote only after send, receive, restart reconciliation, recovery, timeout, and negative scenarios pass.
6. App-store signing, Play Integrity/App Attest policy, staged rollout, privacy documents, and support ownership remain mandatory distribution gates.

The current dependency baseline is recorded in `SECURITY.md` (both audit scopes: zero on 17 September 2026). Run fresh audits before release. Do not use `npm audit fix --force` to silence findings; apply reviewed compatible updates and repeat native acceptance.

## User-facing incident rules

- Never tell a user to resend an unknown payment.
- Ask the user to open Recent activity on Home and refresh, or open Send. The journal must reconcile first.
- Never request a recovery phrase, private key, complete invoice, or preimage.
- Use only the payment time, amount, direction, broad status, and approved opaque request reference for support.
- Treat repeated `configuration` errors as a bad release, `authentication` errors as a device setup issue, and repeated `network`/`timeout` errors as a Spark connectivity incident.

## Incident response

1. Pause rollout and publish a plain-language in-app/support notice if real payments may be affected.
2. Preserve the exact release artifact, commit, lockfile, configuration metadata, and redacted aggregate diagnostics.
3. Determine whether each affected payment is confirmed, failed, or still pending through Spark. Never infer success from a local timeout.
4. If status is unknown, keep the record pending and escalate to the Spark operator with an approved opaque request ID.
5. If secrets may have been exposed, stop distribution, advise affected users through an approved security process, and do not collect their phrases for investigation.
6. Document scope, timeline, user impact, resolution, and prevention before resuming rollout.

## Rollback

- Stop the staged app-store rollout or withdraw the candidate artifact.
- Return to the last signed, accepted release; do not delete local wallet or journal data during rollback.
- Never switch an existing Mainnet user's wallet to regtest as a rollback. This changes the network and can make funds and history appear missing. Pause distribution first; any emergency build must preserve Mainnet identity, recovery and reconciliation while explicitly disabling new payment submission through a reviewed change.
- Pending records must remain readable by the rollback release or be migrated explicitly.
- Repeat recovery and unresolved-payment reconciliation before re-enabling Mainnet.

## Recovery and maintenance

- Test clean-device recovery at every Spark SDK update.
- Re-run the ambiguous-submission, process-death, invoice-expiry, and pagination tests for every payment-path change.
- Review the pinned Spark version and its transitive dependency findings before each release. An update requires the full Mainnet acceptance run, not only unit tests.
- Keep a named release owner, incident owner, security contact, and rollback approver for every public artifact.
