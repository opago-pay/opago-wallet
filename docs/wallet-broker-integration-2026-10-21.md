> **22 October update - historical checkpoint below:** AppConfig and broker
> discovery are now publicly reachable and resolved by the Wallet runtime client
> (#65, MVP `fad8c72`). Client-only logout uses the existing API RFC 7009 endpoint;
> see `wallet-client-logout.md`. The earlier global-logout requirement below is
> superseded. Neither item requires another delivery from Michael.
>
> API main reviewed: `738bbaf`; Compliance main reviewed:
> `7cf4941108744c5fa2fe4d279978117d48dc4663`. The supplied
> `docs/wallet-account-bearer.md` still describes the old realm audience
> `opago-compliance-api`; `docs/wallet-session-store.md` describes v3 sessions for
> an already bound wallet and explicitly has no refresh endpoint. These files
> are not an implementation of the Wallet's v2 account/linking/renewal adapter.
> Treat that adapter as remaining integration work: reconcile the actual v3
> producer and service-identity routes before enabling F3. Do not translate a
> broker credential directly into a wallet-scoped credential or declare all work
> blocked on a missing delivery.

# Wallet broker integration checkpoint — 21 October 2026

Reviewed sources: Wallet `mvp-branch` `bd19d189affe0f928b79221cdbe0c44c652474da`; API
`main` `0bec3a19037107e57fe43bdfe187d1f9f29f76fe` (#604).
API contracts: `docs/contracts/wallet-auth-broker.md` and
`docs/contracts/broker-session-contract.md`; token implementation: `services/auth_broker.py`.
Historical paragraphs in the handover docs are not evidence of current deployment.

## Implemented in this follow-up

- OIDC callbacks require the exact expected `iss` in addition to matching state,
  callback location, no duplicate parameters and no protocol error. A missing or
  wrong issuer causes no token exchange and no credential write.
- An explicit Wallet broker verification profile uses ES256 only, `at+jwt` for
  access tokens and `JWT` for ID tokens. It binds issuer, client `opago-wallet`,
  audience `opago-account`, canonical subject UUID, customer roles, original
  authentication time and access-token hash. Token lifetimes respect the broker's
  configured 60–900 second range. An unverified email remains unverified.
- The protocol profile pins the documented API endpoints and callback
  `com.opago.wallet:/oauth/callback`. These are verification constraints, not a
  new AppConfig wire schema or a guessed Portal login/signup URL.
- `app.json` explicitly registers both the legacy `opagowallet` scheme and the
  confirmed broker scheme `com.opago.wallet`. Expo's actual Android and iOS
  manifest transforms are tested. iOS also derives the bundle scheme automatically;
  the explicit configuration makes the callback requirement visible on both platforms.
- Tests use locally generated ES256 signatures and exercise the actual PKCE login
  class and verifier together. No production account, request, payment or activation
  is involved. Server-side logout/revocation checks remain the API's responsibility.

## Integration still closed

`website-account-config.ts` still returns unavailable for AppConfig 0.2.0 and
`bootstrap-native.ts` still raises `wallet_session_contract_pending`. The strict
broker verifier is prepared, but is not installed into the production runtime.
There is no new APK or supported production POS minimum build from this change.

A browser callback must never be converted directly into a wallet signing session.
Broker account credentials and wallet-scoped credentials are distinct. Retain the
wallet ownership challenge and authenticated account/wallet API responses.
Cold-start callback recovery, account lifecycle and refresh/global logout still
need to be connected and exercised with the final native account adapter.

## Remaining decisions and owners

| Requirement | Evidence / remaining action | Owner |
| --- | --- | --- |
| Versioned AppConfig | Current 0.2.0 schema is closed and has no Portal login/signup fields. Agree exact fields/revision and publish test configuration. Do not overload legacy `oidc` fields or change the public contract for internal Spark helper 0.2.2. | API/Wallet implementation: Fabian; contract and runtime configuration: coordinate with Michael |
| Signup context | Confirm how a Wallet-originated signup selects PrivateCustomer and preserves the original Wallet OAuth request through signup, email confirmation and login. Do not assume the Dashboard client or its cookie. | Portal implementation: Fabian; cross-service behavior: agree with Michael/Compliance |
| AccountBearer acceptance | Specify and deliver acceptance of `opago-wallet` broker tokens on the required `/api/v2/account*` and wallet authentication/binding routes, including upstream authorization, ownership and errors. API currently forwards ordinary account credentials for internal verification; POS Binding and Dashboard acceptance do not establish this path. | API: Fabian; internal route contracts/verification: Michael/Compliance |
| Native session integration | Connect configuration, browser auth, verified token exchange, secure storage, refresh rotation, account change and logout to the live F3 runtime. Recheck API authority after local verification; signatures cannot prove current revocation state. | Fabian, after the above interface decisions |
| Deployment and device acceptance | Register the exact Wallet callback/client, publish approved configuration, prove account routes, then build and test on Android. Preserve recovery and local balances. | Michael: runtime evidence; Fabian: build and device tests |

## Focused message for Michael (draft, not sent)

The Wallet callback and PKCE/token protocol are already specified; we are preparing
that part and do not need another D6 decision. For the working Wallet account flow,
please point us to (1) the versioned AppConfig fields/test values, (2) the agreed
PrivateCustomer signup context and preservation of the Wallet authorization request,
and (3) the internal account/wallet route contract that accepts the Wallet broker
identity. We implement our API and Wallet adapters against those contracts.
The Dashboard rollout alone does not enable Wallet account or payment authority.

## Acceptance after integration

1. Fetch the approved AppConfig and signed HPKE document with the pinned root.
2. Signup as PrivateCustomer, confirm email, login, and return via the exact Wallet callback.
3. Verify account identity, then separately prove ownership and bind the Spark wallet.
4. Reject wrong issuer/client/audience, unknown key, stale/duplicate callback and
   delayed callbacks after lock/logout/account change, including app cold starts.
5. Check refresh rotation and global logout across Portal and Wallet; failed or
   replayed exchanges must not silently replace a working account session.
6. Exercise account reads, Lightning address, supported transaction synchronization
   and separately approved payment paths on the declared network.
7. Record source SHA, EAS build ID, actual versionCode, APK checksum and device results.
   Do not mark the APK as production MVP-ready based only on mocked protocol tests.
