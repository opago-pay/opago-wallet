# Private signup handoff — 12 October 2026

PR #45 remains Draft. The three-field form is implemented; public registration is disabled. No account was created and no live/device signup acceptance is claimed.

## Confirmed product behavior

Private account only: email, E.164 phone (+ followed by a nonzero digit, at most 15 digits), password. No country guessing or local-number rewriting. No MVP SMS, identity photo or KYC. Capturing a phone does not verify it. Intended email confirmation is Keycloak Verify Email. The existing 8-character minimum follows the internal schema; the authoritative realm policy still needs delivery.

No password persistence or automatic retries. Lock, background, navigation and account/wallet changes clear transient input. Existing local wallets, balances, backup and recovery remain available without an OPAGO account.

## Backend and remaining contract

Compliance #843 merged on 2026-10-12 at 07:21:57Z. Inspected main: 58acba32fed2a2d4e70758aec451f0625c1ac59d. POST /internal/v2/users/signup in routers/internal/identity.py still uses ServiceAuth / require_internal_service (admin authorization), not GatewayServiceAuth. It accepts username, phone, pw_signup, required customer_kind and extra internal fields, and returns internal user/CRM data. Tenant/customer/contact persistence, matching-password resumption, completion marker and notification deduplication are implemented internally; they are not a safe public signup contract.

The suggested opago-api-gateway / lightning-gateway client_credentials access has not been established for signup. Our Public API currently calls no signup backend and therefore uses NO signup credential. Do not use realm-admin or direct Keycloak/CRM user creation.

Required before connecting the form:
- Gateway-authorized route/method/transport, server-derived private customer and tenant.
- Sanitized account, activation and email/contact-confirmation response.
- Realm password errors, rate limiting and anti-enumeration behavior.
- Existing account, partial failure, lost response and duplicate-safe resumption.
- Login behavior for incomplete signup and pending Verify Email.

Then implement the API adapter and Wallet activation/error/resumption states, with real client/API integration tests. Public signup success, confirmation and recovery are not implemented or verified yet.

## Verification and dependency boundaries

The October 12 change adds E.164 validation and translated guidance. Targeted form/screen/lifecycle tests and TypeScript pass locally. Full quality CI is recorded on the PR. Baseline: mvp-branch 2ce0b27bbe8e0c8debd9ddcb66af42a2930a89da. #45 and #46 are independent; registration does not activate POS, prove payer identity or change custody. No release build, minimum versionCode, merge or rollout is implied.
