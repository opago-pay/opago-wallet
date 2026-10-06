# Wallet / public API HTTP compatibility

Based on the actual merged `origin/mvp-branch` commit
`00a63de470f343363a68dfae3aabd5da58f3de28`, not the old F5 working branch.
The companion API test PR is stacked on API #551, which includes #550.
Its harness imports this repository's production TypeScript source directly.

Three demonstrated fixes:

- `NativeHkaTransport` sends signed-policy build/platform metadata on v2 as well
  as v3. Before this change real API #551 returned authenticated 400
  `invalid_request` for normal v2 requests.
- Android and iOS native responses expose `X-Request-Id`; `strictFetch` preserves
  it for `nativeHkaHttp`. Previously the wrapper dropped the required v3 ID and
  valid encrypted report/receipt responses became `sync_invalid_contract`.
- Only the four payment-registration routes select the accepted backend 0.2.1
  schemas, including the mandatory nullable `amount`/`currency` response fields.
  Previously an accepted 0.2.1 response failed the closed 0.2.0 validator. The
  immutable F3 0.2.0 snapshot and unrelated routes retain their original schemas.
  The new snapshot and its source/hash evidence are under
  `docs/payment-registration/v0.2.1`; no fiat UI or new business rule is added.

Local verification: 14 production-client-to-real-API TLS scenarios passed;
57 focused transport/F3/F5 tests passed; full Wallet suite 832 passed, one
pre-existing generated-iOS-project check skipped; TypeScript and lint for changed
production files passed. Python 3.11.9 and Node 24.18.1 were used locally; the
API integration workflow uses Node 22.23.1 and records its actual versions.

The test's native socket/storage and Redis adapters are synthetic. Swift XCTest,
Android compilation, release bridge ABI and physical-device TLS/storage/lifecycle
remain device/Mac/Android checks. The iOS regression test now also verifies the
response ID and rejects duplicate headers; its existing test evidence checker
counts test methods dynamically.

Production gates remain closed: Native bootstrap still supplies no v3 acceptance
resolution, and the API's F4/v3 readiness flags default off. UMA identity release
remains blocked. v3 HPKE is exercised only under an explicitly synthetic test
agreement. No backend runtime acceptance, provider payment or live identity flow
is claimed.

Open v3 decisions demonstrated by the tests: the readiness-gate 503
`upstream_unavailable` with `retryable=false` conflicts with the catalog; the
report route's allowed error list excludes transient `upstream_unavailable` even
though the global catalog defines it. The client safely rejects these responses
and preserves queued reports. The shared contract must define admission errors,
report outages/backoff and OQ-EV-5 same-key receipt recovery before enabling the
real backend. Existing POS consent, UMA and v3 proof/credential decisions remain
unchanged.

The companion API `tests/wallet_http/revisions.json` pins the exact reviewed
Wallet commit; run `python scripts/test_wallet_http.py --wallet <this-checkout>`
from that API branch after installing its Python and minimal Node test dependencies.
The result contains actual commits, versions, dependency pins and limitations.
Suggested integration order: API #550, API #551, this Wallet compatibility PR,
then the API HTTP-test PR. This order does not authorize enabling readiness gates.
