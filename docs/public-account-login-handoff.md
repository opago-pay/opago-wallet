# Website account entry — Wallet PR #49

Updated 14 October 2026. Target: Friday, 16 October 2026.
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

Checked on 14 October 2026:

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

There are no concrete additional API routes to implement yet: naming any exchange
endpoint now would invent a contract. Michael's team must publish the config and
session handoff first; any resulting facade changes will then be identified
against that revision. The wallet must never communicate directly with Keycloak.

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
