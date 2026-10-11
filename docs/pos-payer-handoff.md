# OPAGO POS wallet payer handoff — 11 October 2026

**Incomplete; keep the PR in Draft. Noch keine bestätigte Mindest-versionCode.**

This revision does not implement authenticated payer submission or enable POS
payments. The current backend has a different payer contract from the requested
account-authenticated, potentially non-KYC wallet flow. The independent production
change detects known OPAGO POS requests in the actual scanner/payment paths and
refuses them locally before even P01 (which can register a sale). No login loop,
synthetic successful payment or guessed endpoint has been added.

## Pinned sources and work basis

| Repository | Inspected revision | Relevant sources |
| --- | --- | --- |
| Wallet `origin/mvp-branch` | `2ce0b27bbe8e0c8debd9ddcb66af42a2930a89da` | `app/(tabs)/send.tsx`, `lib/payment-recognition.ts`, `lib/lightning-destination.ts`, `lib/lnurl-safe.ts`, `lib/opago/account.ts`, `runtime-native.ts`, `hka.ts`, `bootstrap-native.ts`, `docs/lnurl-spark-contracts/v2/` (0.2.0), payment journals and `eas.json` |
| [Compliance main](https://github.com/opago-pay/opago-compliance/tree/ae0c74fed6efacf72554ba99728ca4e18ad04fb0) | `ae0c74fed6efacf72554ba99728ca4e18ad04fb0` | `docs/pos-payer-data.md`, `docs/pos-handoff-contracts.md`, `docs/contracts/payment-registration/POS-HPKE.md`, `docs/wallet-session-store.md`, `docs/contracts/tx-foundation-v3/spec.md`; implementations `routers/pos_protocol.py`, `pos_payer.py`, `pos_protocol.py`, `pos_scan_registration.py`, `routers/internal/payment_registrations.py` below `apps/api/opago_compliance_api/` |
| [API main](https://github.com/opago-pay/opago-api/tree/c13341a1c5d20bc0aaf3164c50493771c7058227) | `c13341a1c5d20bc0aaf3164c50493771c7058227` | `routes/api/lightning.py`, `services/lightning_proxy.py`, `services/pos_hpke_proxy.py`, `services/wallet_v2_transport.py`, `docs/lightning-proxy-routes.json`, `docs/pos-hpke-rollout.md` |
| [POS main](https://github.com/opago-pay/opago-pos-app/tree/2a5350a9c7ea5b425d78d71770a2499d78daf081) | `2a5350a9c7ea5b425d78d71770a2499d78daf081` | `docs/integration/wallet-connection.md` (0.2.1), `services/OpagoPosService.js`, `services/paymentReplay.js` |
| [Kubernetes main](https://github.com/opago-pay/OPAGOkubernetes/tree/cf31b0e7d820bc7f35505a92304ba9e3bee676b8) | `cf31b0e7d820bc7f35505a92304ba9e3bee676b8` | `AGENTS.md`, `Helm/charts/cloudflared-standalone/lnurl-public-routes.yaml`, `Helm/charts/opago-public/templates/lnurl-public-ingress.yaml` |

The original wallet checkout was clean on a different F3 branch; the API checkout
had extensive unrelated changes. Both were left untouched. Work started in a
managed isolated worktree on a new `codex/` branch from freshly fetched
`origin/mvp-branch`. Separate pristine source checkouts were used for the other
repositories. No Wallet/API/Compliance/POS `AGENTS.md` was found; Kubernetes'
instructions were read, and that repository is read-only for this task.

[Signup #45](https://github.com/opago-pay/opago-wallet/pull/45), head
`ff230c36c278fdfe6657cafce948feacd18308fd`, was the only open Wallet PR at the
initial audit. It is Draft, with successful Wallet quality CI, and explicitly
leaves signup disabled pending its accepted backend contract. None of its changes
were copied. This work does not add or modify account, login or signup behavior.

Relevant merged Compliance changes include [#835](https://github.com/opago-pay/opago-compliance/pull/835)
(`7f46cdb1ba836d9f404092582595afa67b2a2b1e`, registration WalletBearer),
[#832](https://github.com/opago-pay/opago-compliance/pull/832) (POS registration HPKE),
[#802](https://github.com/opago-pay/opago-compliance/pull/802) (app scans),
[#807](https://github.com/opago-pay/opago-compliance/pull/807) (custody-dependent payer verification),
[#812](https://github.com/opago-pay/opago-compliance/pull/812) (link payer verification),
[#839](https://github.com/opago-pay/opago-compliance/pull/839) (server-random callback token),
and [#840](https://github.com/opago-pay/opago-compliance/pull/840) (UUIDv7 payment ID).
The historical status table in `pos-payer-data.md` still says 7 October; it is not
treated as current implementation evidence. The route and verifier code at the
pinned main revision are decisive. Merged source is not proof of deployment.

## Confirmed contract and exact gaps

| Step | Current public route → backend | Authentication and binding |
| --- | --- | --- |
| POS device registers/reads/cancels a sale | `/api/v2/payments/registrations/hpke` → `/api/payments/registrations/hpke` | Device/owner credential, service authentication, P-256 HPKE envelope with operations `create`, `get`, `cancel`. This is **not payer identification**. |
| P01 discovery/scan | `GET /lnpos/api/v1/lnurl/{pos_id}?p=…` → `GET /api/lightning-protocol/pos/{device_id}/lnurl` | Gateway service bearer, canonical tenant `opago`; device payload authentication, target/binding/precheck checks. Can create a registration/context. No user bearer is forwarded or verified as the payer. |
| P02 invoice | `GET /lnpos/api/v1/lnurl/cb/{payment_id}?attempt=…&amount=…&payerdata=…` → `GET /api/lightning-protocol/pos/callback/{payment_id}` | Gateway service bearer plus backend-verified UMA payer data. The facade replaces authentication with its own service credential; it does not derive a payer from an incoming WalletBearer. |

The QR/NFC data is `lightning:LNURL…` encoding the P01 HTTPS URL on
`api.opago.com`. `p` is an authenticated encrypted device payload, not a wallet
credential. The wallet cannot read/validate its amount or recipient itself.
Current Compliance expects `{payment_id, amount_minor, currency, offline_pin,
note}`, with a canonical UUIDv7 payment ID. POS main still documents and constructs
the older `local_payment_id`/`created_at` shape. This producer mismatch is a
separate live-acceptance prerequisite, not something to silently translate in the
wallet. The legacy `/opago-pos/api/v2/lnurl/…` format remains unsupported.

P01 fixes the msat amount (`minSendable === maxSendable`), exact metadata and
recipient binding in a server context. Its server-random P02 path token and
`attempt` must be retained; neither may be inferred from the registration ID.
The documented payload lifetime is 900 seconds with 30-second skew; offer expiry
also depends on the precheck. The backend must reject changed bindings, cancelled
registrations and changed eligibility before invoice issuance/replay.

P02's `pos_payer.verify_payer_data` requires a `$user@domain` identifier,
provisioned VASP signing key, matching node key and originator attributes, and
**both provisioned and supplied KYC status `VERIFIED`**. The UMA signature covers
`identifier|attempt|signatureTimestamp` (ECDSA/SHA-256); the amount and payee are
bound through the stored context, not through client-supplied identity fields.
The wallet must not invent a VASP identity or claim verified KYC for an account.

Recipient custody controls this existing check: custodial recipients require a
verified payer; non-custodial recipients attempt identification and record missing
or unverified evidence without blocking for identity. This is **not a confirmed
successful authenticated non-KYC account path**. In addition, API main still
requires `payerData` on every POS callback, whereas Compliance's current proxy
contract allows it to be omitted. Relaxing that facade alone cannot satisfy the
requested payer flow and would not add authenticated identity.

The current P02 contract sends originator personal data and signature material
in a GET query. It requires TLS/no-store and query-log suppression, but that still
does not meet this task's explicit ban on tokens/personal data in URLs. There is
no confirmed POS payer POST/HPKE alternative in the inspected public/internal
route implementations. No API PR is created: adding a new wallet-payer endpoint
or inventing eligibility rules is beyond a missing facade mapping.

The existing F3 `OpagoAccount` has PKCE login, wallet ownership/binding, session
refresh, purpose-bound proofs, private operation storage and HKA lifecycle fences.
Its 0.2.0 `payer_proof` takes a 43-character `context_ref` and amount; UMA consumes
it internally under its own contract. There is no mapping from the POS 32-hex
attempt to that context, nor a P02 handler consuming that proof. The separate v3
Spark session contract returns different fields and has no refresh endpoint.
Do not relabel one token/proof as the other, change account code to bridge an
unconfirmed contract, or enable `identityPayments`/UMA.

The inspected POS P01/P02 flow produces Lightning BOLT11 invoices. It is not an
onchain Bitcoin or HBAR instruction. Hedera wallet sessions/binding remain closed
in v3 pending their own key-policy decisions. Ordinary onchain Bitcoin,
Lightning, Hedera transfer and Hedera checkout remain independent.

## Implemented production behavior

`lib/opago/pos-payment.ts` recognizes current/legacy POS route namespaces on
`api.opago.com`, the infrastructure's `api.opago-pay.com` alias, and exact valid
build-configured F3 API/address hosts. This is a **refusal classifier**, not a
credential trust policy. It sends no credential and accepts no response. Host
lookalikes are not classified as trusted OPAGO. Unrelated LNURL hosts keep the
existing anonymous validators/transport and never receive an account credential.

Scan, clipboard, Lightning wrappers, BIP21 Lightning parameters, direct destination
resolution, the endpoint cache, LNURL callback validation and the shared JSON
transport stop known OPAGO POS requests. The final transport guard also covers
OCP callers. A foreign discovery cannot introduce a known OPAGO callback and then
be cached or paid anonymously. Long app LNURLs are identified before the ordinary
decoder's smaller limit. A pasted raw P01 URL with a `lightning` parameter cannot
sidestep the refusal. Malformed or old requests on the known POS route stay closed.

The scanner shows a translated explanation (German, French, Spanish, Italian)
and permits scanning again. The send screen shows the same local error before
fee preparation, device authorization or submission. No input, token, identity,
QR payload, callback or backend error text is added to the error. No POS session,
proof, pending payment or approval is created, so logout/lock/account switching
has no POS authorization to preserve. Existing generic lifecycle and journal
checks remain in force. A bare invoice or a proxy that conceals all OPAGO origin
information cannot be identified as POS by this classifier.

## Verification and remaining acceptance

Local validation on 11 October 2026:

- Node **22.23.1**, full `npm run phase5:verify`: TypeScript, ESLint, **865
  application tests passed**, 0 failed, 1 existing generated-iOS-project test
  skipped; **9 Solidity contract tests passed**; native patch/configuration and
  script checks passed. No test or product flag was disabled for this work.
- `expo export --platform android --max-workers 2`, with `.env` loading and
  Sentry auto-upload disabled: production Hermes bundle generated successfully
  (`index-51c46546362b8870014974249835b548.hbc`). This is bundle validation,
  **not** a Gradle APK/AAB build, signed release, device run or supported build.
  No iOS native build was performed on Windows.
- Pristine API at the pinned main: `python -B -m pytest
  tests/test_lightning_proxy.py -q -p no:cacheprovider`: **92 passed**. These
  exercise the real Flask public routes with a mocked internal transport and
  forbid real provider/network calls. P01/P02 assertions confirm gateway bearer
  replacement and canonical tenant forwarding. They do not validate a real
  payer signature or successful account-authenticated POS payment.
- `git diff --check` passed. Local Wallet logs/artifacts are under the ignored
  `output/pos-payer/` directory. Exact-head CI and commit are recorded in the PR.

New tests execute the production recognition/resolver and actual scanner/send
components with native UI boundaries mocked. They cover wrapped/raw/long/legacy
inputs, configured and spoofed hosts, callback substitution, cached/direct/OCP
entry points, no credential forwarding, translated errors, no fee preparation or
payment, and ordinary external Lightning/HBAR behavior. These tests prove a
closed path, not successful payer authentication.

| Requested case | Evidence/remaining requirement |
| --- | --- |
| Scan → login/bind → proof → review | Scan refusal tested. Positive flow blocked by the absent POS payer transport and proof-consumption contract. |
| Account without KYC | No false KYC claim or anonymous workaround. Positive permission case must be supplied by backend contract/implementation. |
| Missing/expired/wrong session, foreign wallet/tenant | No POS credential request occurs. Existing F3 tests cover their own contract, not authorization of P02. Real POS cases remain pending. |
| Modified amount/payee/network | POS is rejected before network. Existing BOLT11 amount/signature/network and HBAR validators remain tested; positive POS binding checks require a new response contract. |
| Expired/replayed proof | No POS proof is minted/accepted. Purpose, expiry, replay and idempotent retry semantics must be confirmed for the new route. |
| Foreign QR/callback | Exact host classification and ordinary no-credential requests tested; OPAGO callback injection refused. |
| Logout/lock/account switch/late response | No POS pending authorization exists. Existing scanner/send/F3 lifecycle regressions exercise their own late-response fences; authenticated POS acceptance still pending. |
| Lost response/recovery | No POS mutation is dispatched or retried. Existing payment journals/reconciliation remain tested; POS proof/invoice status recovery remains pending. |
| Explicit confirmation and ordinary payments | Actual send component proves no prepare/authorize/submit after POS refusal; existing ordinary payment confirmation/reconciliation suites retained. |

No real public P01/P02 request was made: even discovery may register a payment.
No mock claims to implement the missing backend behavior. No API source changed,
so no shared API success test or API PR can honestly establish this absent route.
After the contract is delivered, add a joint test against the real public facade
with an explicitly simulated internal backend, then device tests against an
approved test environment. Include Android/iOS lock and return from browser login,
account/wallet changes, delayed replies, exact replay/reconciliation, merchant
rebinding, fees, success PIN/preimage handling and explicit confirmation. No real
payment or production registration is authorized by this task.

## Concrete deliveries needed from Michael (not sent)

1. Supply the versioned **wallet payer** public/internal request and response:
   method/path, protected body/HPKE framing, authenticated principal, accepted
   AccountBearer/WalletBearer or proof type, scopes/audience/tenant, and whether
   login/ownership/binding is required. Identify the backend commit implementing
   its consumption. POS device registration is already understood and is not
   this missing route.
2. Define the authenticated **non-KYC** account permission outcome for this
   operation, separately from recipient custody. Specify denial codes and keep
   backend authorization authoritative. The current UMA `VERIFIED` rule cannot
   be changed by the wallet.
3. Supply the binding/response and recovery contract: opaque sale/context ID,
   trusted recipient/network, fixed msat amount, invoice description commitment,
   proof scope/lifetime, expiry/rebind/cancel errors, exact retry/status operation
   after a lost response, and disposition of an already-issued invoice. Specify
   the relationship to F3's `context_ref` and approved session version, if any.
4. Deliver a matching POS payload producer and a deployment/test configuration
   that serves the accepted contract across all replicas. Resolve the public
   P02 optional-payer discrepancy and document whether any HBAR POS flow is in
   scope. Provide approved non-KYC and denial fixtures, without production PII.

## Build identity and release boundary

`eas.json` uses `cli.appVersionSource: remote`; production has `autoIncrement:
true`, and `production-apk` inherits it. A local Gradle default, `app.json` or an
old release cannot establish the first supported Android versionCode.
`bootstrap-native.ts` reads `expo-application.nativeBuildVersion` for the real
platform and sends it in HKA build headers; a build number is not identity.

There is **no source revision containing the complete payer flow in this PR**,
and no corresponding accepted build. Required live F3 configuration (if the
delivered payer contract selects F3) includes its explicit API/address origins,
OIDC issuer/client/access audience/redirect, pinned HPKE roots and platform update
URLs. Backend compatibility and feature enablement are still prerequisites;
the inspected POS device HPKE deployment alone does not satisfy them. This PR
needs none of that configuration for its local refusal.

Once complete, record the exact merged source SHA, reviewed runtime configuration
revision and deployed API/Compliance/POS revisions. For a separately authorized
Android build, record EAS build ID, source SHA, profile/environment, artifact
digest, signing identity, and versionCode read from the produced APK/AAB; install
that artifact and accept the full scenario matrix on the intended Lightning
network. Only then name its versionCode as supported. Track iOS buildNumber and
its artifact/device acceptance separately. This task performs no EAS release
build, store submission, deployment, feature activation or change to
`WALLET_POS_MIN_SUPPORTED_BUILD`.
