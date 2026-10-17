# Spark SDK 0.7.12 → 0.14.0

## Scope and provenance

Only opago-wallet. Based on remote `mvp-branch` commit
`4a6029d39b844dca8c6ceb4bbf90910b576f2570`, on a new
`codex/spark-sdk-migration-20261017` branch. Fresh Cloud checkout was clean;
no AGENTS.md or other contributor-instruction file was present. README and
Wallet quality gate were read. The Windows checkout, its uncommitted changes,
local evidence directory and worktrees were unavailable and were not changed.

Official sources checked on 2026-10-17:

- [Published npm metadata](https://registry.npmjs.org/@buildonspark%2fspark-sdk):
  `latest=0.14.0`, published 2026-10-14T23:51:02.713Z. No newer stable version was
  listed. This is an explicit exact pin, not a floating latest or prerelease.
- [Spark security policy](https://github.com/buildonspark/spark/blob/main/SECURITY.md#supported-versions):
  Michael's statement is correct: older client SDK releases are not patched.
  Unsupported is not itself proof of an exploitable vulnerability.
- [Official changelog](https://github.com/buildonspark/spark/blob/main/sdks/js/packages/spark-sdk/CHANGELOG.md)
  and the same CHANGELOG.md shipped in the immutable npm 0.14.0 tarball. The
  GitHub releases API returned no releases; npm's packaged changelog is the
  version-specific migration source, supplemented by the actual packaged sources.
- [0.14.0 tarball](https://registry.npmjs.org/@buildonspark/spark-sdk/-/spark-sdk-0.14.0.tgz),
  integrity `sha512-joK/dSzcPnZA2W5NtoaRDDdB17Sga9bmxhFf69zLgOlRAB89yMMK8Jz9JrgRb42dJxJ2hSUZbZnAaUhrJ1bd3w==`.
  Sources compared with the previously locked published 0.7.12 package.

## Integration inventory and decisions

| Area | Actual SDK change / Wallet adaptation |
| --- | --- |
| Startup / networks | Same initialize signature and defaults: REGTEST account 0, other networks account 1. Existing BIP39 seed, configured network and custom signer retained. No use of getOrCreateWallet, generated replacement seed or new storage provider. |
| Identity / recovery | Paths remain `m/8797555'/account'/0'..4'`. Ten old-SDK fixtures cover five mnemonic lengths and both account defaults. New signer and Wallet address compared with the stored old public key families, deterministic leaf/static-deposit keys, identity and Spark address, also on a second independent signer simulating restoration. |
| Balance | 0.14 getBalance uses cross-operator checked leaves. Bitcoin-only adapter now calls getLeaves() instead of getLeaves(true), so it does not bypass the consistency check. Fresh available leaves, validation, cache refresh/eviction and integer accounting retained; token queries still excluded from this read. |
| Lightning sends | Since 0.10, idempotencyKey was replaced with transferId, an actual SDK UUID instance. A domain-separated UUIDv8 derived from the normalized payment hash is reused across retries. Existing journal still prevents resubmitting pending/unknown payments. Both the SDK wire path and rejection before funding are tested. |
| Lightning preparation | Since 0.9, swapNodesForPreimage no longer fetches/signs the redundant legacy refunds or sends the legacy transfer field. Removed our speculative second-phase pipeline and its obsolete tests, replacing them with real 0.14 wallet→transfer→Lightning wire tests. SDK owns signing and submission. |
| HTLC optimization | Public native point calculation remains. Actual installed SDK oracle tests compare transaction bytes, sighashes, fee treatment and commitments; extended around the 1024-sat fee correction. Fresh FROST nonces and SDK signer retained. |
| Leaf selection / signing cache | Actual SDK leaf selection and signer tests retained. Only synchronous selection is overridden. Payment-scoped caches still erase copies on send completion, failure and cleanup. |
| History / receive status / F5 reports | Since 0.12, totalValue includes all participants. Use valueReceivedByWallet / valueSentByWallet, validate safe integer sats, and never fall back to totalValue. Old request idempotencyKey parsing is retained solely for recovering historical outgoing records. |
| Invoices / LNURL / POS | Existing fixed and amountless invoice validation, hash/preimage binding and max fee ceiling remain. No adoption of optional signed receive/send quotes or partner JWT providers. Thus new quoted-invoice gross/net semantics are not silently enabled. Existing POS/LNURL/account suites run. |
| On-chain deposits / claims / withdrawals | Existing typed static-deposit quote/claim, address, cooperative-exit APIs remain available. New instant-deposit APIs, silent payment addresses and watchtower recovery are not enabled as new product features. Existing local duplicate guards, persisted operations, authorization and recovery tests run; live SO/SSP operations remain unverified. |
| Fees / defaults | Integer sats/BigInt boundaries and 100-sat configured Lightning maximum unchanged. 0.12 fixes the 1024-sat direct output fee (694 rather than 955); tests include this edge. 0.13 enables CPFP refund and direct-node fee ladders by default; kept enabled, not disabled for compatibility. These are exit transaction ladders, not a change to the app's payment fee authorization. |
| Cleanup / restart | Override the preferred cleanup() API; the SDK cleanupConnections() compatibility alias dispatches to it. Both initialization failure and session resource disposal retain their cleanup path. SDK also stops claim retries on cleanup. |
| Token services | Removed V2/queryTokenTransactions APIs are not used. New native primitives default remains enabled; no fallback that weakens validation. |

## Dependency and mobile review

package.json and lockfile pin 0.14.0. A clean npm ci runs the reviewed postinstall
checks. Only Spark and its affected dependency closure update (including
protobuf and Bare transport dependencies); no npm audit fix/force or unrelated
HBAR/Expo upgrade. All existing overrides remain. Obsolete OpenTelemetry and
runtime ts-proto dependencies disappear with the upstream SDK dependency change.

The iOS native logging patch remains necessary: **the new published
SparkFrostModule.swift still logs ECIES/private-key method parameters**. The
patch is re-pinned to 0.14.0 and its fail-closed check remains in CI. The existing
React Native TurboModule patch remains unchanged.

The old XHR rewrite is replaced by an upstream implementation check. 0.14
provides cancellation and unary deadlines itself; tests execute the real
published ESM and CJS xhrPost functions with a controlled XMLHttpRequest.
The SDK fallback cap changes from our 45 seconds to upstream 60 seconds, with
RPC deadlines able to finish earlier. UI timeouts/unknown-payment journal rules
remain unchanged. Tests verify success bytes/metadata, network failure, timeout,
abort, pre-abort and late completion without overwriting failure status.

React Native now prefers **SparkGrpcModule** over the XHR fallback and enables
**SparkPrimitivesModule** (renamed in 0.12.1). Android autolinking registers both;
the tarball contains FROST and primitives .so files for arm64-v8a, armeabi-v7a,
x86 and x86_64. Android adds gRPC OkHttp/stub/protobuf-lite and JNA; iOS adds
gRPC-Swift and spark_primitivesFFI.xcframework alongside FROST. These native
changes require a new native binary; do not distribute this as a JS-only OTA
update to an old wallet build.

Metro selects react-native exports. Existing secure random-values, Buffer,
TextEncoder and AbortSignal polyfills remain. No TLS or secure randomness
checks were disabled. Native gRPC uses transport security for HTTPS; app
network defaults and insecure-HTTP prohibition are unchanged. SDK Node/Bare
and WASM paths are not proof of mobile native compatibility.

## Automated evidence and boundaries

- Baseline application suite on 0.7.12: 893 pass, 1 pre-existing skip.
- 0.14 application suite: 892 pass, 1 pre-existing skip (obsolete pipeline tests
  replaced, not disabled to obtain green results).
- TypeScript and ESLint pass; 9 contract tests pass and contracts compile.
- Android and iOS **production-mode Metro exports with Hermes bytecode** pass
  on Node 22.23.1. No dev server is required to serve the resulting .hbc files.
  Metro warns about @noble/hashes/crypto.js package-export fallback; bundling
  succeeds without weakening crypto or adding insecure substitutes.
- Identity fixture regeneration uses scripts/capture-spark-identity-baseline.cjs
  with a separately installed 0.7.12 package. It rejects other versions and
  accepts no secret inputs. Fixture contains only public synthetic identities.
- Actual 0.14 implementations used: signer/key derivation, address encoding,
  HTLC transaction creation oracle, leaf selection, Lightning wallet/service
  construction and wire generation, and published XHR functions. Remote
  operator/SSP calls, native bridge, leaf funding/signing in wire tests, and
  platform storage/UI are controlled or simulated. There are no real payments.
- Existing full regression suites cover HBAR restoration, local wallet storage,
  payment journal restart, timeout/late response, background/lock, concurrency,
  duplicate send/claim guards, LNURL/POS, account signing and transaction reports.
  These are not proofs of remote operator idempotency or production settlement.

**Remaining release evidence:** no Android SDK/Gradle native release build or
Android device/emulator is available in this Cloud runner; no macOS/Xcode or
iOS device is available. Native gRPC cancellation/reconnect, FROST/primitives
loading, secure randomness, Hermes startup without Metro, background/foreground,
cold restart, old-wallet upgrade on isolated test devices and end-to-end
regtest deposit/claim/send/receive/withdraw must be exercised before rollout.
No isolated SO/SSP stack is configured, so the pre-existing opt-in regtest test
remains skipped. No EAS/cloud build, store upload, real-wallet installation,
merge or deployment was performed.

## Stored data and rollback

No local database schema, SecureStore keys, seed format, HBAR derivation, account
index or journal format changes. Consequently no app data migration or
interrupted-migration marker is needed. Pending old Lightning records are read
and reconciled with their stored hashes/request IDs; they are not resent with
a new UUID merely because the SDK changed. Startup errors still fail closed.

Rollback is not declared safe after new network activity: the older SDK is
unsupported and does not implement newer fee ladders/native transport and
operator fixes. A rollback would require independent old-binary/network-state
compatibility testing. Do not delete stored data or create a replacement wallet.

## Security and Aikido

[Audit evidence](security/spark-014-audit-2026-10-17.json) compares the exact old
lockfile with the new tree. Both report **36 affected package entries: 1
critical, 28 high, 6 moderate, 1 low**. This is not 36 distinct exploitable paths;
metavulnerabilities count dependent packages too. No newly reported or removed
package finding resulted from this upgrade.

Examples: critical shell-quote command-injection advisory
GHSA-pqg4-j6r4-53mv; @grpc/grpc-js advisories GHSA-m9gg-hp2v-232j and
GHSA-f596-whhp-79r4; fast-copy and source-map-js findings already addressed by
open #52. Exploitability in the mobile app has not been established. npm audit
does not attest bundled Rust .so/xcframeworks, Maven/CocoaPods dependencies or
runtime service behavior. Keep these findings separate from Spark 0.7.12's
unsupported-version status and from the still-required native logging patch.

No Aikido connector/session is available. No Aikido config/workflow appears in
the Wallet checkout and the base commit's GitHub check-runs API returns zero
checks. Neither proves that Aikido excludes the repo: external scheduled scans
need not publish commit checks. Repository selection, exclusions, scan branch,
last scan time and last scanned commit therefore remain **unverified**; the
reason for the reported missing coverage cannot be established from GitHub.

Concrete admin task for Fabian/Michael: in the existing organization's Aikido
GitHub integration, verify access/selection for `opago-pay/opago-wallet`, check
archive/exclusion status and scanned branch (migration targets `mvp-branch`,
GitHub default is `main`), enable this repository if omitted under the existing
policy, run/resume its scan, and record repository ID, last successful scan
UTC time and scanned commit SHA. Check npm plus native dependency coverage.
Do not change organization-wide settings or create new credentials for this PR.

## Parallel PRs

- #49, `ff264823df852a2bd2a26641e1fb608501faad56`, targets mvp-branch. Its 30
  changed paths do not overlap this migration's application files. Browser-login
  work is not imported, overwritten or activated. Combined behavior still needs
  the normal integration check when both changes land.
- #52, `c437d63e9508d8d165414ddcedc61a22d9d57271`, targets **main**, not mvp-branch.
  Both touch package.json/package-lock.json. Preserve its dependency fixes when
  reconciling branches; regenerate and audit the combined lockfile. Do not assume
  #52 protects this mvp-branch merely because the PR exists.

Keep the migration Draft until its published revision's automated CI is green;
remaining device/native/network acceptance is explicitly a rollout blocker.
