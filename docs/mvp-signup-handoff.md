# Private signup handoff — 13 October 2026

Wallet #45 and #47 are merged. The former missing-public-contract blocker is
superseded by API #567 (`fbeb8b3`, current main at implementation start), whose
`docs/public-identity-deployment.md` is authoritative. No open API PR or later
main commit was present on the initial check. This change does not duplicate
Michael's public-ingress/security/header work or activate a production flag.

## Working matrix

| Area | Already present | Delivered here | External dependency |
| --- | --- | --- | --- |
| Signup | Three fields, E.164, optional account entry | Real public JSON POST; strict response and safe error handling | Operator-controlled SIGNUP_ENABLED and public route access |
| Account login | Browser OIDC with PKCE and cryptographic token verification | Remove the old email-confirmation login requirement in verifier and login acceptance | Correct deployed realm/client and callback configuration |
| Account/wallet separation | Ownership proof, explicit binding, backup and recovery | Existing flows retained; signup never touches keys or account storage | Authenticated account/binding endpoints must be available; signup alone does not prove readiness |
| Contact | Email/phone fields | Distinct pending/confirmed/not_required email state | Email delivery and existing website confirmation/reset landing pages |
| Recovery | Sensitive input clearing | One-shot submission, explicit same-password resume, stale-response fences | Compliance remains authoritative for resumed/partial/conflicting registrations |

## Confirmed behavior

`POST /api/v2/user/signup` receives normalized lowercase email as `username`,
trimmed E.164 `phone`, unchanged `pw_signup`, fixed `customer_kind=private`, and
`language=de` for German or `en` for other app languages (the only supported API
languages). The only local password rule is the published eight-character
minimum, counted as Unicode characters. The server remains authoritative for
additional policy; signup exposes generic 422 `Invalid signup input`, not a
field-specific password-policy code. The 16 KiB request limit is enforced.

Only HTTP 201 with exactly `status=created|resumed`, `account_state=active`, and
`email_verification=pending|confirmed|not_required` is accepted. No success is
inferred from incomplete/unknown states or malformed responses. `not_required`
does not mean confirmed. A pending email does not block browser login. The
existing separate binding/address requirements, including server-reported email
assurance, are retained; no approval or binding is fabricated.

The result screen offers the existing account sign-in screen. It does not create
a session, prove wallet ownership, bind a wallet, perform KYC or create a new
local wallet. Local balances, keys, backup and recovery stay available without
an account. Contact capture proves no phone ownership. No SMS or photo flow.

## Safety and recovery

The existing strict native HTTPS transport is reused, with cancellation and no
cookies, redirects or automatic write replay. Gateway credentials never enter
the Wallet. The HKA account mutation outbox is deliberately not used because it
persists requests and retries writes. Signup has no durable recovery data.

The password input is cleared at dispatch. Lock, background/inactive, navigation,
unmount and wallet/session replacement abort the request and discard form state;
a generation/context fence also ignores responses when cancellation is too late.
Double taps are fenced synchronously. All error messages are local translations;
no raw response, credentials, full registration payload or exception cause is
logged or reported. The existing crash-report privacy filters stay active.

Timeout, malformed success, lost response, 502/503 and partial failures never
claim definite account-creation failure. The user can try sign-in, or explicitly
continue with the same email/phone/password. Within that form, contact fields
stay fixed for recovery and the password must be entered again. Only the backend
can confirm resumption. No second-account or password-change repair is attempted.
All 409 details share one neutral message; there is no account-existence lookup.
Numeric Retry-After postpones the next submission; it never schedules a retry.
Closed signup remains closed with no legacy or direct identity-provider fallback.

## Confirmation and password recovery boundary

There is no established Wallet email-link/token callback in the existing
navigation. Confirmation and password-reset email links remain with the
operator-configured website flow described by the API contract, and the existing
browser sign-in remains the account recovery entry. This change adds no website,
URL scheme, token parser, token persistence or automatic confirmation on link open.
A successful signup does not assert message delivery. These API routes exist;
their existence is not an app deep-link or live-delivery acceptance.

## Verification and later device acceptance

Wallet unit/screen tests exercise validation, immutable password/private context,
closed response validation, safe refusal/rate-limit/unknown states, duplicate taps,
explicit resume, cancellation and late responses. Signed OIDC tests accept
pending/absent email assurance without weakening signature, issuer, audience,
nonce, subject, expiry, PKCE or callback checks. Existing binding checks still
refuse an unconfirmed account. All five app languages have signup copy.

The API companion PR extends the existing shared HTTPS runner with the actual
`PublicSignupClient`, `nativeHkaHttp`, `strictFetch` and registered public Flask
routes. Only native socket I/O, Compliance/IdP state and (in the Wallet-only run)
Redis are simulated. It checks created/resumed, all email states, invalid phone,
server policy refusal, closed gate, neutral conflicts, partial registration,
lost response, rate limit, timeout, outages and cancellation/session changes.
This is not a real-device browser-login, email-delivery or production acceptance.
The API result records exact committed consumer/API revisions and dirty-source
status. Final PR evidence records quality/CI results; no check is weakened.

Later, after separate operator approval, test on an Android and iOS device with
an approved test account and deployed build: preserve an existing funded wallet
and backup; register three fields; verify the active/pending distinction; sign in
without first confirming email; separately inspect/prove/bind using existing
account controls; explicitly open and confirm the email on the configured site;
check password recovery there. Also interrupt submission by locking/backgrounding,
then try sign-in or same-password continuation and verify one account. Confirm
wallet keys, balances and recovery are unchanged. Never use a real account or
send a real message as part of this local/CI suite.

Merge order: Wallet implementation first, then the API test/pin PR. The API
runtime dependency (#567) is already merged. Pins must identify the exact tested
Wallet commit; after squash/rebase, update and rerun the API pin checks. No merge,
deployment, release build, Signup enablement or other production switch is part
of this delivery.
