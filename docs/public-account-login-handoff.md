# Website account entry — Wallet PR #49

Current contract check, 16 October 2026: see
[the published website-ticket contract and remaining prerequisites](auth-contract-check-2026-10-16.md).
API #585 now specifies website-only login, the Wallet callback and ticket/code
handover; the earlier statement that all A2/D1-D6 decisions remain proposals is
historical. Website/AppConfig fields, the Wallet signup context and API/F3 token
acceptance remain incomplete. The production adapter stays unavailable.
Application code is unchanged from `604b05cf9198c43c53f84df3e07dc72c7762f952`,
whose GitHub quality gate passed. The dated reports below retain their original
observations; they are not current deployment or device-acceptance evidence.

Follow-up on 15 October: see [the local contract review and handoff](auth-contract-review-2026-10-15.md)
for the independently fixed browser-start failure, verified #577/#578 sources,
current local test results and remaining integration/write-policy blockers.
The historical application CI observations below were not rerun remotely.

Updated 15 October 2026. Target: Friday, 16 October 2026.
Task: [recLCk3wB7o4Xlqwa](https://airtable.com/app9EBdodbucfeYyT/tblqZkPBT6xUXVuGl/recLCk3wB7o4Xlqwa).
This supersedes the native signup/login release instructions. **Draft preparation;
no completed browser authentication, build approval or Turnstile activation.**

## Implemented wallet boundary

The production account screen offers Sign in, Create account, Check again and
Continue using my wallet. It collects no credentials, invokes no native signup,
login or password-reset API and never opens a guessed password-recovery URL.
`/opago-signup` redirects to `/opago-account`; historical `/identity` navigation
therefore reaches the same entry. Production ignores contract-test parameters.
The existing native-intent handler accepts only a restricted checkout review;
unknown auth links go to `/`. There is no new callback/token parser.

`RuntimeConfigClient` fetches only `https://api.opago.com/api/v2/app/config`, with
the existing strict 0.2.0 schema, no-store requirement, bounded JSON, audience,
expiry and minimum-build checks. No public schema or validator was relaxed.
`website-account-config.ts` currently returns unavailable even for valid 0.2.0:
that schema has no confirmed website destinations or wallet-session handoff.
A 503, redirect, invalid/expired config, missing handoff or closed build opt-in
leaves the actions disabled with a short localized message and explicit retry.
Production standard is **opago.com**, but no production path is inferred from it.
The Workers register address may only come from a future confirmed **test**
configuration; it is not a bundled fallback.

`WebsiteAccountFlow` serializes checking, login and signup and rechecks fresh
configuration before every launch. Its internal readiness/destination types are
application ports, not proposed backend fields. `website-account-native.ts`
wires Expo's system browser to `createWebsiteBrowser`: Android Custom Tabs
returns `opened` immediately, so the adapter waits for app return; iOS waits for
dismissal. This browser adapter is prepared and exercised with synthetic ready
values only. It cannot run with the currently published configuration contract.
Selection of an auth-session return primitive must follow the confirmed handoff;
`openAuthSessionAsync` is deliberately not given an invented redirect URI.

A browser return or dismissal has only `returned`/`cancelled` status. Neither
contains nor persists account authority. The future verified session exchange is
a separate integration step; it must not be replaced by cookies, JS injection,
a WebView success message, or a token copied from a deep link. Existing public
customer sessions, F3 credentials, wallet bindings and seeds are neither read nor
deleted by this entry. Old sessions are preserved in their existing secure slots,
not displayed as newly verified and never promoted to F3 AccountBearer. There is
no automatic resume, migration, logout or session replacement on opening this UI.

Cancellation, unmount, navigation, wallet identity changes, lock/unlock and late
configuration/browser responses are fenced. The native browser also has a mutex
while an aborted native opening remains unresolved and a two-minute timeout.
Only an expected browser switch uses the existing device-authentication lease:
previous payment approvals are invalidated and new wallet-action captures are
blocked during it. Its returned authorization is discarded. Idle lock still
applies, and no signing/payment rule was relaxed. Local BTC, Lightning, HBAR,
app unlock and recovery with the 12 words remain independent.

## Published evidence and required contracts

Initial check on 14 October 2026:

- Wallet PR #49 started from `93723587b8bdc409626974742721e8a546f9c626`,
  targeting `mvp-branch`, as an open Draft. Existing worktrees were clean and
  left unchanged; work uses a separate checkout without rewriting history.
- API #569 is still a separate Draft at `1ae78295ff442967f60705bf64297b35f270b0ed`.
  Its body/comments provide the superseded native customer-login design, not a
  website-to-wallet handoff. No API changes were made.
- Public config and the supplied Workers `/register/` URL both returned HTTP 302
  to Cloudflare Access in this environment. No config body or website behavior
  was accepted from those redirects; no Access bypass was attempted.
- Michael's [handoff task rec8qvpGaIKA8zprY](https://airtable.com/app9EBdodbucfeYyT/tblqZkPBT6xUXVuGl/rec8qvpGaIKA8zprY)
  and [configuration task rec2JcYQUMFQIUtRj](https://airtable.com/app9EBdodbucfeYyT/tblqZkPBT6xUXVuGl/rec2JcYQUMFQIUtRj)
  both said **Not started**, due Thursday, 15 October 2026. Their notes are
  requirements/questions, not published contracts. No browser-contract revision
  has been delivered or implemented. The only consumed wire schema remains
  checked-in AppConfig **0.2.0**; `/api/v2/auth/hpke-key` is a separate signed F3
  key-document contract, never browser login configuration.

Before connecting the dependent path, read those two tasks again and record the
published document/spec revisions. Required details:

1. Exact login/register URLs and versioned AppConfig field names, validity and
   production/test separation. Confirm wallet registration's private-customer
   context and where/how it is supplied, without accepting arbitrary role input.
2. Website login/registration request and response schemas, errors, email
   confirmation behavior and password recovery within the website flow.
3. Exact approved return mechanism/URIs, attempt correlation, replay protection,
   cancellation/expiry, cold-start behavior and platform requirements.
4. API session exchange/verification: endpoint/method, request/response, identity,
   audience, expiry, revocation, storage, reauthentication and old-session policy.
   A website cookie alone is not a wallet API session.
5. Explicit authority for wallet binding, Lightning addresses, POS identity and
   other F3 operations, including the separate signed-key trust bootstrap.

### Contract publication checked on 15 October 2026

Both Airtable tasks now say **In progress**. The handoff task links
[API PR #577](https://github.com/opago-pay/opago-api/pull/577), merged at
08:51:40 UTC on 15 October. Reviewed document revision:
[`docs/contracts/auth-login-and-app-handover.md` at `b5f9a01d43845f5c7ca7038dcee08b64b11515f7`](https://github.com/opago-pay/opago-api/blob/b5f9a01d43845f5c7ca7038dcee08b64b11515f7/docs/contracts/auth-login-and-app-handover.md).
Merge commit: `422ce4a269e77344349222c596ea11fb8e78db2e`. No later document
revision appeared in the published file history when checked.

This is published documentation, but its A2 handoff and decisions D1-D6 remain
explicitly **proposed, open for decision**. The merge and successful document
checks do not resolve those decisions. It documents existing password-login
request/response and signup/email errors; it does not deliver a confirmed
website-to-wallet session exchange. No proposed callback, endpoint, token
lifetime or field from that section is implemented in this Wallet change.
The only wire schema consumed by the browser entry remains AppConfig **0.2.0**.

The document confirms `customer_kind=private` for the signup API, but leaves how
the website establishes the Wallet's private-customer context unresolved. It
also proposes an API-owned authorization page, while the Wallet task requires
website sign-in. Michael must align that entry decision. The configuration task
still supplies no published versioned fields or confirmed login/register paths.
The document expressly says legacy `oidc.redirect_uris` and synthetic fixture
URLs are not a website-handoff contract. The production adapter stays unavailable.

Concrete API prerequisites identified by that source, for Michael's team:

- Publish a versioned AppConfig schema with confirmed login/register destinations,
  production/test separation and private-customer context. AppConfig 0.2.0 is
  closed and cannot accept guessed additional fields.
- Confirm and publish the app-session exchange, its error/cancellation/cold-start
  rules, verification and API acceptance, refresh/revocation, and old-session
  policy. The A2 routes and callback remain proposals; they are not implementation
  instructions. F3 binding/address/POS authority must be explicit and separate
  from the old public-login bearer.
- Establish server-side customer/staff-role separation. The inspected facade
  validates role types but does not itself exclude staff roles.
- For the documented website password flow, provide reviewed public exposure for
  `POST /api/v2/auth/token` and `GET /api/v2/auth/login/hpke-key`, with their
  preflights. The signed Wallet `/api/v2/auth/hpke-key` is a different contract;
  the earlier Airtable draft's route shorthand must not conflate them.
- Publish the session verification/logout scope and exact environment-specific
  CORS and Cloudflare Access policies. No blanket auth-path bypass is implied.

PRs #571 and #572 remain open. Their heads when checked were respectively
`4d1f5475b824c887d0d7b1c4f0946820be5963d1` and
`d45a0b2b28d101fc45de0f0bd68f62b374013cb0`, later than the pending revisions cited
inside #577. No runtime or deployment claim is inferred from either PR, and no
Turnstile work or API change was made here. The wallet must never communicate
directly with Keycloak.

## API #569 and shared consumer tests

The new entry no longer depends on #569's native login HPKE discovery,
`X-OPAGO-Login-Context`, native `/auth/token`, `/auth/me` or `/auth/logout` exposure,
`WALLET_PUBLIC_ACCOUNT_LOGIN_ENABLED`, or native `/user/signup`/password reset.
Its configuration transport and the earlier bodyless-204 HTTP correction remain.
#569 is no longer an unconditional API-before-wallet release instruction.

`public-account.ts`, `public-account-session.ts` and `signup.ts` remain compatibility
clients with their isolated tests, not installed production adapters. Their native
adapters were removed. API #569's shared tests explicitly load `public-account.ts`
and `signup.ts`; those clients and their dependency implementation are unchanged.
`tests/wallet_http/revisions.json` in #569 still pins Wallet
`93723587b8bdc409626974742721e8a546f9c626`. That pin was inspected, not silently
advanced. Its existing CI is evidence for that old revision only, not this browser
entry. The separate POS suite still pins Wallet `0382e4e3d1ed96f348c908f5bfc0862e795f9b25`; its consumers are unchanged too.
Updating the cross-repository pin/suite belongs to a deliberate API follow-up
once the browser handoff exists. No historical shared-suite count is claimed as a
current browser/Turnstile acceptance result.

At API #577's merge commit `422ce4a269e77344349222c596ea11fb8e78db2e`, the main
API suite instead pins `wallet_test_revision=b11022e47f45a33436e2dee2420dc829bb5da470`
and `wallet_baseline=00a63de470f343363a68dfae3aabd5da58f3de28`; its POS suite still
pins `0382e4e3d1ed96f348c908f5bfc0862e795f9b25`. These are distinct from #569's
consumer pin and from Wallet `a1bba360106be0be49de0e2656d07742a817e865`. The green
shared checks reported on #577 therefore do not verify the prepared browser
entry. No consumer pins were changed and no new shared test run is claimed.

## Verification, device acceptance and build prerequisites

Automated coverage exercises the actual account screen, flow and Expo adapter
wiring with synthetic browser/configuration responses: both actions, missing or
invalid configuration, 503, no password writes, duplicate taps, Android immediate
open vs return, iOS cancellation, explicit retry, stale results, wallet switches,
locks, payment-approval invalidation, route/deep-link guards, storage isolation
and local-wallet navigation. On 14 October 2026, `npm run phase5:verify` passed
locally on Node 24.18.1: typecheck, lint (no warnings), 968 application tests
passed with one existing iOS-project skip, all nine checkout contract tests,
configuration/patch and syntax checks. An earlier sandbox run could not spawn
Node subprocesses in three existing tests (EPERM); the complete rerun with
permitted test subprocesses passed. GitHub CI uses the pinned Node 22.23.1; its
result and exact tested commit are recorded in PR #49. These tests do not validate a real website,
Turnstile, a live API session or installed-device behavior.

The 15 October follow-up updates documentation only. Whitespace/diff checks were
run; the application checks above remain the evidence for the unchanged code at
`a1bba360106be0be49de0e2656d07742a817e865`. No live or device test was performed.

Still required on Android (and platform acceptance on iOS): real registration in
the private-customer context, email confirmation, login, correct return/correlation,
verified API session, cancellation/retry, foreground/background/lock, cold start,
wallet switch, expiry/errors and independent BTC/Lightning/HBAR/recovery. Verify
old sessions are preserved or migrated only under the agreed policy; confirm no
binding/address/POS identity appears from a browser success page alone.

Prerequisites for a new device build: published and recorded revisions for both
contracts; implemented and reviewed adapters/session verification; required API
and website behavior available in the agreed test environment; confirmed URLs,
return-link app configuration and trust requirements; passing current automated
checks; and explicit build authorization. No build, deployment, store upload,
merge or feature activation is performed here. `EXPO_PUBLIC_OPAGO_F3_ENABLED`
remains unchanged. Michael owns API Turnstile; its switch stays **off** until
registration, email confirmation, login and return have passed together with the
new device build. Browser-code completion alone is not that release gate.
