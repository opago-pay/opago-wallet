# Lightning operations and incident runbook

## Runtime model

The mobile wallet uses the pinned Spark SDK directly. Opago does not run a custody or payment-signing backend. The recovery phrase remains device-protected and payment confirmation requires an on-device review plus biometric/device authentication on Mainnet.

The app stores a non-secret Lightning journal before submission. Records contain only payment hash, amount, opaque Spark request ID, state, and timestamps. Unknown outcomes remain `pending`; only a matching preimage promotes a payment to `confirmed`. Incoming invoices are privacy-sensitive and use device-protected SecureStore until paid, expired, replaced, or the wallet is removed.

## Local health check

Home refresh checks Spark balance, paginated history, and unresolved payment status with bounded timeouts. Settings > Advanced wallet details shows a privacy-preserving local Lightning status. It stores only success/failure timestamps, a consecutive-failure count, and a broad error category. It never stores invoices, payment hashes, preimages, keys, or recovery words.

Because no external monitoring provider is configured, centralized alerting is not claimed. During a canary or public rollout, the release owner must actively monitor support reports and the Spark service status. Adding remote telemetry requires a separate privacy, consent, retention, and data-processing review.

## Release procedure

1. Review dependency and secret scans; pin every security-critical SDK exactly.
2. Run `npm ci`, `npm run phase5:verify`, `npm run production:config:verify`, and the Android acceptance runbook.
3. Record commit, lockfile hash, APK/AAB hash, signing identity, configuration profile, reviewer, and approval time.
4. Start with an internal canary and deliberately small real-fund amounts.
5. Promote only after send, receive, restart reconciliation, recovery, timeout, and negative scenarios pass.
6. App-store signing, Play Integrity/App Attest policy, staged rollout, privacy documents, and support ownership remain mandatory distribution gates.

The current dependency baseline and unresolved advisory counts are recorded in `SECURITY.md`. Do not use `npm audit fix --force` to silence the report: a release owner must either move the complete Expo stack to a supported patched SDK and repeat Android acceptance, or document why a finding cannot reach the signed mobile artifact and obtain security-review approval.

## User-facing incident rules

- Never tell a user to resend an unknown payment.
- Ask the user to reopen Home and refresh. The journal must reconcile first.
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
- If Lightning alone is unsafe, ship a reviewed build with `EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET=false` and `EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE=regtest` while preserving Hedera configuration independently.
- Pending records must remain readable by the rollback release or be migrated explicitly.
- Repeat recovery and unresolved-payment reconciliation before re-enabling Mainnet.

## Recovery and maintenance

- Test clean-device recovery at every Spark SDK update.
- Re-run the ambiguous-submission, process-death, invoice-expiry, and pagination tests for every payment-path change.
- Review the pinned Spark version and its transitive dependency findings before each release. An update requires the full Mainnet acceptance run, not only unit tests.
- Keep a named release owner, incident owner, security contact, and rollback approver for every public artifact.
