# Wallet broker runtime configuration

## Delivered

`RuntimeConfigClient.brokerConfiguration(signal)` reads AppConfig first, enforces
minimum builds and validity, and rejects legacy/internal issuers before requesting
discovery. It accepts only the approved `opago-wallet` client, the exact
`com.opago.wallet:/oauth/callback` return URI and `openid email profile` scopes.

Discovery is fetched anonymously from the approved Public API origin. Its issuer,
authorize/token/JWKS endpoints, S256, code/query flow, ES256, public-client token
exchange and refresh support must match the existing Wallet broker verifier.
Redirects, HTML, transport failures, cancellation and expired configuration remain
errors. Returned `config`, `discovery` and `trusted` values match the existing
`OidcAccountLogin` and `createWalletBrokerVerifier` interfaces. Callers must obtain
fresh configuration when `expiresAt` is reached; no cached fallback is introduced.
The lease is capped by both AppConfig validity and `cache_max_age`.

No new AppConfig wire fields or contract version were introduced. The checked-in
0.2.0 schema remains unchanged. Endpoint checks are a local trust policy, never a
fallback for missing or conflicting server values.

## Live evidence, 22 October 2026

At 08:55 UTC, the implemented RuntimeConfigClient resolved the live AppConfig and
discovery successfully using anonymous GET requests:

- API: `https://api.opago.com`
- Client: `opago-wallet`
- Callback: `com.opago.wallet:/oauth/callback`
- AppConfig: `contract_version=0.2.0`, Cache-Control `no-store`
- Discovery: `/.well-known/openid-configuration`, HTTP 200 JSON

Public JSON snapshots are in `tests/fixtures/*-2026-10-22.json`; no credentials or
user data are included. CI uses these snapshots with a fixed clock, not production.

## Remaining integration

This delivers configuration resolution, not an active native login UI. AppConfig
still has no Portal registration/handover fields. `websiteAccountAvailability`
therefore stays unavailable and native F3 bootstrap stays closed. A configuration
GET does not prove browser login, code exchange, API access or wallet linking.
The account-to-wallet/session mapping and the revised client-only logout contract
must be integrated separately.

PR #64 was merged into `codex/wallet-mvp-build-20261022` after #63 reached
`mvp-branch`. Its account-wide logout is absent from MVP revision `d81352c` and is
not included in the configuration change, because Michael subsequently specified client-only logout.
The follow-up in `wallet-client-logout.md` reuses its local cleanup but replaces
the global remote call with the existing client-bound RFC 7009 endpoint.
