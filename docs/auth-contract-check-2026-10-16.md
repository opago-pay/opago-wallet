# Wallet #49: published contract check, 16 October 2026

Checked at approximately 15:45–15:50 Europe/Berlin. Target remains 16 October.
The website-ticket protocol is now published. The complete registration and
Wallet API-session integration is still blocked by missing configuration,
signup-context and API-acceptance contracts. This update changes documentation
only. PR #49 remains Draft; no build, deployment or feature activation is approved.

## Reviewed published revisions

- [API #585](https://github.com/opago-pay/opago-api/pull/585), merged on
  16 October at 12:51:28 UTC as
  `c345d1e6f9a8db3443c00ccf7d2da08d4884373c`.
  Reviewed document revision: `57f8f68f9292ce21f0bd32678a0a621bedd62d52`:
  [normative website handover](https://github.com/opago-pay/opago-api/blob/57f8f68f9292ce21f0bd32678a0a621bedd62d52/docs/contracts/wallet-auth-broker.md),
  [A2 and decisions](https://github.com/opago-pay/opago-api/blob/57f8f68f9292ce21f0bd32678a0a621bedd62d52/docs/contracts/auth-login-and-app-handover.md),
  [session contract](https://github.com/opago-pay/opago-api/blob/57f8f68f9292ce21f0bd32678a0a621bedd62d52/docs/contracts/broker-session-contract.md),
  and [broker operations](https://github.com/opago-pay/opago-api/blob/57f8f68f9292ce21f0bd32678a0a621bedd62d52/docs/wallet-auth-broker.md).
- These documents supersede the API-owned login-page proposal in API #577
  (`b5f9a01d43845f5c7ca7038dcee08b64b11515f7`) and the original broker design in
  API #578. #578 was merged on 15 October as
  `4ae21b46e9244cd9acc2987bf0ef2b99f15ea0b5`, with head
  `8086d0d9c32bd0465aae97b5eaf1e548cf7ee8aa`.
  A documentation merge does not implement or deploy the new ticket flow.
- Airtable [handover task](https://airtable.com/app9EBdodbucfeYyT/tblqZkPBT6xUXVuGl/rec8qvpGaIKA8zprY):
  **Rollout pending**. Its notes still link the old #577 proposal, without the
  new #585 revision. Status and stale notes are not the contract authority.
- Airtable [configuration task](https://airtable.com/app9EBdodbucfeYyT/tblqZkPBT6xUXVuGl/rec2JcYQUMFQIUtRj):
  **In progress**. No versioned login/register fields, confirmed paths or
  mechanism for conveying Wallet private-customer signup context are supplied.

## What is now specified

The app creates PKCE S256, state and nonce, then opens the API broker. The broker
redirects to website login on `https://opago.com`. The website uses an active
verified session or completes its HPKE login and required factors, requests a
single-use ticket, and returns to the broker with the original app parameters.
After authoritative session/account revalidation and atomic ticket consumption,
the broker returns a code. The app checks state and issuer, exchanges the code
with its verifier and validates the resulting tokens. Signup alone creates no
session. Credentials and website bearer tokens never enter an app callback.

The required Wallet client is `opago-wallet`, with exact callback
`com.opago.wallet:/oauth/callback`. Issuer is `https://api.opago.com`; Wallet access
audience is `opago-account`. The ticket lasts at most 60 seconds, shortened by
website-session expiry; the code has its own 60-second lifetime. Access/ID tokens
default to 300 seconds; rotating Wallet refresh ends eight hours after the
original authentication. Explicit `prompt=login` and `max_age=0` are unsupported
until the website provides reviewed attempt binding. A default handover may use
an existing active website session.

D1 (website login), Wallet D2 (callback), and D5 (no repeated broker Turnstile)
are now specified. Do not keep requesting the old API-page/website decision.
This is protocol evidence, not evidence that broker tokens work for F3 APIs.
The token contract expressly provides no tenant claim, F3 role-name mapping,
server-side logout/revocation endpoint or API routes accepting broker tokens.
Local logout cannot revoke issued broker tokens. The old public-login logout
endpoint belongs to a different session type.

## Remaining concrete API and website requirements

1. Publish the versioned `/api/v2/app/config` fields and approved login/register
   URLs, including production/test separation and how Wallet signup retains
   private-customer context. AppConfig 0.2.0 remains closed. The Signup API's
   `customer_kind=private` does not define a website query parameter or carry
   that context through authorization. `https://opago.com/login` is explicitly
   still a proposal. Workers is not an authorized ticket origin or production
   fallback; any test use needs an explicit, compatible test contract.
2. Implement the published ticket request and exact-origin preflight, website
   redirect and atomic consume behavior. Replace the API credential form/POST
   path as required by #585. Preserve the original request binding and enforce
   expiry, replay, query-size limits and redaction. This is API/website work;
   no such implementation is added in this Wallet update.
3. Supply reviewed private Compliance routes and adapters for both
   `verify_website_session` and `verify_website_session_reference`, including
   original authentication time, full customer roles and current session/account
   revalidation. These are published port names, not invented HTTP endpoints.
   The existing `/me` response and credential adapter do not establish them.
   Keep the disabled verifier until the authoritative integration exists.
4. Publish and implement broker-token acceptance for wallet binding, Lightning
   addresses and other F3 operations: tenant/party/role mapping, issuer/audience
   checks and the relationship to existing AccountBearer authority. Preserve the
   separate signed-key bootstrap. Neither a legacy public-login bearer nor a
   broker JWT becomes F3 authority by assumption.
5. Confirm environment-specific exposure for website HPKE login and key discovery,
   ticket origin/preflight, and the approved website paths. Supply joint evidence
   for the real website-to-broker flow. No blanket auth-route bypass is implied.

The Wallet can then connect the confirmed config, callback, verified exchange and
session lifecycle while preserving old sessions on failure. Its current app
scheme is `opagowallet`; the required callback scheme must be registered together
with the safe return handler and tested in a new device build. The missing
configuration/signup/API-authority contracts prevent completing that integration;
deployment readiness alone is not the reason to defer generic contract work.
No temporary native login or parallel Turnstile work is required.

## Automated evidence

Application revision remains `604b05cf9198c43c53f84df3e07dc72c7762f952`.
Its [GitHub Wallet quality gate passed](https://github.com/opago-pay/opago-wallet/actions/runs/38751686373/job/116479426116).
The earlier local follow-up recorded 50 focused screen/browser/configuration
tests, typecheck and lint passing, plus local full-suite failures documented in
the [15 October review](auth-contract-review-2026-10-15.md). Those local failures
must not be represented as a successful local full run; the remote result is
separate evidence on the exact application revision.

Coverage uses synthetic configuration and browser/platform responses for entry,
abandon/retry, duplicate taps, app switches, locks, wallet switches, late results,
startup-listener failure cleanup, payment-approval invalidation and independent
local wallet use. It does not verify a live website, ticket, API session or device.
This documentation-only update is checked for diff/whitespace and source accuracy;
no new local application or cross-repository test run is claimed.

Consumer pins rechecked at API main `c345d1e6f9a8db3443c00ccf7d2da08d4884373c`:

| Source | Wallet revision |
| --- | --- |
| `tests/wallet_http/revisions.json`, API main | `b11022e47f45a33436e2dee2420dc829bb5da470` |
| Same file, baseline | `00a63de470f343363a68dfae3aabd5da58f3de28` |
| Same file, API #569 head `1ae78295ff442967f60705bf64297b35f270b0ed` | `93723587b8bdc409626974742721e8a546f9c626` |
| `tests/pos_wallet_http/revisions.json`, API main | `0382e4e3d1ed96f348c908f5bfc0862e795f9b25` |

API #569 is now closed at that unchanged head. It was not modified here. None of
these shared consumer pins covers Wallet #49's current browser entry or the new
ticket contract. Advancing pins and running the matching joint contract tests
remain part of the integration; no shared-CI result is promoted to device or
Turnstile acceptance.

## Outstanding device and live tests

Test registration with private-customer context, email confirmation, login and
verified return together. Exercise Android/iOS cancellation, explicit retry,
double taps, foreground/background, lock, wallet switch, cold start, expiry,
replay and late results. Check old-session retention on failure, token lifecycle
and the intended API operations. Recheck local BTC, Lightning, HBAR, unlock and
12-word recovery independently. No new live or installed-device tests were run.

## Prerequisites for the new Wallet build

Finish and record the missing contracts and adapters, provide the corresponding
API/website test environment, register the exact callback, preserve existing
data/session isolation, pass current automated checks and obtain separate build
authorization. Then perform the joint device/live acceptance above. Neither
this documentation nor browser-code completion authorizes an EAS build, merge,
deployment, store upload or activation. Michael's API Turnstile switch remains
off until registration, email confirmation, login and return pass together with
the new device build.
