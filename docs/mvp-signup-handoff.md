# MVP signup handoff — 10 October 2026

## Delivery status

**Preparation only; real registration remains disabled.** There is no successful
signup or post-signup login claim, no live transport and no synthetic success in
the released UI. No account, email, SMS, wallet binding or payment was created by
this work. No feature activation, deployment, merge or publishing is authorized.

The wallet exposes email, mobile number and password under OPAGO account. It has
no business selector, identity photo or Light-KYC step. Submit remains disabled
with a visible explanation. Transient fields clear on lock, wallet change,
background and navigation. Existing account sign-in remains separate from wallet
possession proof. Core BTC/Lightning/HBAR access, recovery words and existing
bindings remain unchanged. A local draft is never shown as an account.

The old `/identity` deep link redirects to the new screen; the historical intake
component/library remains outside navigation with its regression tests. Historical
server data and encrypted local identity records are not deleted. Existing
`photoMatchReady`, address activation, email-verification and server permission
gates remain enforced: no replacement entitlement contract authorizes bypassing
them. A blocked service now explains its unavailability without asking for photos.

Dashboard registration moves to Andreas's website. No available destination was
provided. Its former `/signup` page returns to `/login`; links remain hidden and
the old signup proxy stays closed even with an inherited `SIGNUP_ENABLED=true`.
Password reset, public login, customer role handling and merchant functions stay
on their existing paths. The old unused form is retained outside navigation.

## Evidence and contract audit

| Evidence | Confirmed source behavior | MVP implication |
| --- | --- | --- |
| [Signup decision](https://airtable.com/app9EBdodbucfeYyT/tblqZkPBT6xUXVuGl/recoMu7Fe07XWgEKR), 10 October | Three fields; no light KYC/photos; Fabian owns implementation; due 12 October | Product decision, not an HTTP/auth/activation contract |
| [Role task](https://airtable.com/app9EBdodbucfeYyT/tblqZkPBT6xUXVuGl/recvLHvlcQPvt5CIT) and 10:19 comment | Stored kind controls role; planned required `customer_kind`; backfill and realm-admin precheck still open; due 17 October | Proposed change/rollout prerequisite, not accepted deployed MVP signup |
| [Website task](https://airtable.com/app9EBdodbucfeYyT/tblqZkPBT6xUXVuGl/recwFzYBcylwGOmXr) | Andreas owns website, depends on roles; due 24 October | No guessed website URL; date conflict remains explicit |
| Public API parent `1dcfb508eeb3460c111d23908959ce65e67c1982` | `/api/v2/user/signup` and legacy v1 called direct Keycloak/CRM/email code; `username`, `pw_signup`, optional `phone`; locked=true, KYC=New, requires_verification=true | This is not the new backend flow; removed from callable signup service |
| Compliance read-only `457a3ae34b5bba5040fe66c6db5f4e933a2346a5`, `apps/api/opago_compliance_api/routers/internal/identity.py`, `docs/internal-identity-contracts.md` | `/internal/v2/users/signup`; `Authorization: Bearer` validated realm-admin and `X-Tenant-ID`; JSON `username`, `pw_signup` (minimum 8), optional `customer_kind=merchant|private`; extra fields allowed | Existing implemented internal contract, **not** a gateway-authorized MVP contract |

The existing Compliance route takes a plain password field in internal JSON; the
public-login `encrypted_credentials` exchange is a different contract and must not
be copied into signup by assumption. This change adds no admin credentials, calls
no administrator route and implements no direct user/role management.

At the audited Compliance revision, phone is an extra capture field without a
published normalization/verification rule. No SMS mechanism or phone-format regex
is added. UI validation checks presence only; email syntax and the published
8-character minimum are preliminary, not the full realm password policy.
The private payload preparation fixes `customer_kind=private`; no client role or
verification flag can be selected. This mapping is **not dispatched**.

The internal route returns 201 `{status: success, user: <raw provider>, crm: <raw CRM>}`.
The provider `user.id` is the Keycloak identity, not automatically a confirmed
customer/account ID. It does not return a safe public activation/verification or
wallet-linking result. Raw records must never be forwarded to the client.

Existing identity handling authenticates the supplied password, returns 409 when
that fails, and otherwise resumes role/CRM/notification work. New creation persists
a signup KYC task intent before role assignment. Role, CRM or finalization errors
can therefore happen **after** creating an identity. The route has notification
outbox deduplication but no agreed wallet-facing operation ID/status protocol.
Do not add retries or interpret a timeout as absence. An end-to-end password-based
resume, its abuse controls, customer binding and failure cases require explicit
acceptance. Current public login rejects locked accounts and verifies exact
customer roles; signup cannot unconditionally unlock an account or claim KYC.

This source audit proves implementation only. It does not establish rollout,
backfill completion, IdP policy, contact verification or rights after registration.
No new backend PR implementing the 10 October proposal was found in the open PR
inventory at inspection time. Existing source behavior and the newer plan differ.

## Missing release contract (questions raised to Fabian)

1. Which versioned signup route is authorized for the public gateway, with which
   credential transport, tenant/IP/rate-limit/abuse controls? An administrator-only
   route cannot be exposed just by copying its path.
2. Required phone format and normalization, exact required private selector,
   complete Keycloak password policy, existing consent requirements and their
   server evidence. No unapproved validation or new SMS infrastructure.
3. Safe response schema separating immutable provider/customer IDs, role,
   creation/activation state, contact-confirmation reasons and KYC. Define exact
   login/owning-account-link continuation; it must verify subject/role and retain
   all wallet proof checks.
4. Existing-account, partial creation, timeout and lost-response behavior,
   permitted resume/idempotency/status operations, and locked-account recovery.
   No automatic signup retry until these cases are accepted.
5. Which services are available without KYC and precisely which photo/approved
   gates are superseded? Removing intake does not create payment/address rights.
6. Confirm backfill and rollout readiness, plus Andreas's available website target.

Until these are delivered, `SIGNUP_ENABLED` stays false. API signup defaults closed
(404); a true flag still cannot provision users (valid prepared private input gets
503 `signup_unavailable`, `registration_attempted=false`). Invalid/extra authority
fields get a generic 400 only behind the flag, without echoing credentials. Request
size is bounded; responses are non-cacheable. Legacy business enrichment is not
silently reclassified: no registration consumer is activated in this release.
There is deliberately no configurable "enable" switch for the wallet transport.

## Review dependencies and later test

Wallet starts at `origin/mvp-branch` `2ce0b27bbe8e0c8debd9ddcb66af42a2930a89da`.
API is a follow-up on #557 `1dcfb508eeb3460c111d23908959ce65e67c1982`;
#558 remains a separate sibling review, with no merge or edits to its branch.
Dashboard follows #161 `7780550a5c8be026ad6fb985b294116ba5d8a3f5`, itself
stacked on #160. No existing PR branches were changed. API #557 precedes this API
PR; Dashboard #160 then #161 precede this dashboard PR. Wallet has no open-PR base.
If API #558 lands first, rebase/retest this API change and reconcile consumer pins
explicitly. Preparation can be reviewed without activating registration.

Before a later **separately authorized** joint live test: accepted MVP contract and
implementation, backfill/precheck evidence, safe public gateway and credential
transport, phone/password/consent rules, contact/permission state model, available
website target, updated consumer adapters, and passing real-route tests against
simulated internals for successful creation, correct-role login, duplicate/partial
failure, unknown outcome/resume, and logout/lock/account change during requests.
These success/resume scenarios are **not implemented or proven** by this delivery.
The retained historical photo tests do not prove MVP signup.

The 12 October signup target precedes the 17 October backend and 24 October website
dates. This dependency is documented; no dates, owners or Airtable records changed.
No message was sent to Michael.

## Validation for this wallet change

- Node 22.23.1; locked dependencies; full `phase5:verify` passed: TypeScript,
  ESLint, 861 application tests passed / 1 existing generated-iOS-project check
  skipped, Solidity compilation and 9 contract tests, native patch/config gates
  and script syntax checks. No external provider traffic or publishing.
- Android production JavaScript/Hermes bundle exported locally. This is not a
  signed APK, device test or deployment. No iOS native build was run on Windows.
- Actual signup/account components cover three fields, disabled submission,
  validation, transient credential clearing, optional wallet access and retired
  identity deep links. Retained photo tests are historical regression coverage,
  not a simulated successful MVP signup. Existing recovery/proof/permission
  regressions remain intact.
- CI and exact combined consumer revisions are recorded in the draft PR and API
  `tests/wallet_http/revisions.json` after the joint run.
