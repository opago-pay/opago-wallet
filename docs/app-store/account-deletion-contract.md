# Account deletion API contract — open assumption

Status: **not agreed / not enabled**. This document is a client-side proposal, not a claim that server-side deletion exists.

## Proposed request
- Feature flag: `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED=false` by default.
- Endpoint base URL: `EXPO_PUBLIC_ACCOUNT_DELETION_API_URL` (must be HTTPS).
- Proposed operation: `POST {base-url}` with a fresh authenticated account authorization header and no request body.
- Expected success: any 2xx response means only that a request was accepted, not that deletion is complete.
- The client must not locally erase the wallet or imply that on-chain assets have been deleted.

## Backend decisions required
1. Exact route and HTTP method; do not assume the proposed route is final.
2. Required fresh authentication, CSRF/PKCE/session policy and authorization header/token source.
3. Whether confirmation is synchronous or asynchronous and how status is queried.
4. Which account, identity, wallet-binding, support, transaction and audit data are deleted, anonymized or retained.
5. Legal basis and scope for the proposed five-year binding-evidence retention.
6. Idempotency, retry, rate-limit, error and support escalation behavior.
7. Whether users must complete any additional identity or legal confirmation.

The adapter is disabled by default. The settings UI explains the self-custody consequences and legal-retention caveat; until the backend contract and auth integration are accepted, the action remains unavailable and this does **not** satisfy Apple's account-deletion requirement for a production submission.
