# Personal Lightning addresses: implementation and acceptance boundary

Base: `mvp-branch` at `4543f8e` (12 October 2026). The 10 October F3 decision
removes photo KYC from MVP address activation. It grants neither identified
status nor UMA/custodial payment permission. The immutable 0.2.0 wire schemas
remain unchanged; `photoMatchReady` is retained for the separate UMA flow.

## Delivered

Personal address set, rename and reactivation use authenticated account status,
an active non-custodial Spark wallet bound to that account, a wallet-scoped
unexpired session, and the existing signed action proof. No new entitlement
field is sent or inferred. Backend denials, including historical `kyc_required`,
remain denials. `pending_kyc`, inactive and deactivated addresses never become
receivable.

After a successful mutation, `/api/v2/wallet/me` must return the same address
ID, name, status, address, LNURL and QR payload for this wallet. Until then the
durable operation remains recoverable and display/copy/share is hidden. A
restart clears cached wallet authority. Explicit restore keeps the address
deactivated until separately reactivated. Account/session/key/generation changes
reject delayed responses, newer reads supersede older ones, and lock/unlock
discards cached runtimes even when the Spark object is reused.

The receive QR and account screen share the same freshness/ownership validator.
Copy/share re-read account and wallet status first. Existing origin, name,
uppercase Bech32, exact discovery path and `lightning:` payload checks remain.
Errors distinguish account access, missing wallet binding, name conflicts,
rename limits and service availability. UI messages include German, French,
Spanish and Italian. Ordinary wallet receive, keys, funds and recovery remain
independent of account login.

## Unresolved backend contract (Michael / backend owner)

Read-only inspection of Compliance main
`58acba32fed2a2d4e70758aec451f0625c1ac59d` found:

- The vendored F3 `protocol.md` still requires photo approval and intake for
  activation/binding. The product decision needs a coordinated contract update
  specifying no-photo binding, account restrictions and activation semantics
  using authoritative server state. The client does not synthesize approval.
- Current `docs/wallet-lightning-address-registration.md` describes LNbits
  provider IDs and `PENDING_IDENTITY_MATCH`, not this Spark F3 flow.
- `docs/wallet-session-store.md` exposes a different v3 session-only producer
  for existing UUID wallets. It has no F3 refresh endpoint; `purpose: bind` is
  rejected. A four-field v3 session cannot be relabeled as the F3 access/refresh
  session. Account listing, party/generation mapping and the F3 bind/restore/
  address operations still need confirmed corresponding backend producers.
- `lnurl_public_discovery.py` explicitly says its pure functions have no route
  integration or context store yet. Do not present these functions as a deployed
  Spark invoice service or substitute the custodial LNbits path.

No dependent production route/adapter is invented. The local F3 backend models
the desired no-photo authorization only for tests; that is not confirmation of
the backend contract amendment or of its deployment.

## Validation and later live acceptance

Run `npm test`, `npm run typecheck`, `npm run lint`. Focused regressions are in
`tests/f3-account-uma.test.cjs` and `tests/f3-ui.test.cjs`; the API companion PR
pins this client for actual local HTTPS/HPKE integration, reuses this synthetic
F3 adapter and the existing `createSparkInvoiceAdapter`, and supplies simulated
Compliance/Spark. The API handoff records exact revisions, test totals, runtime
configuration and read-only public diagnostics. No native device, production
binding, production invoice or payment has been accepted by these tests.

After backend contract/configuration and public routing are ready, use an
existing designated test account: sign in, prove and bind the intended Spark
wallet, activate an available name, compare the confirmed address/QR, resolve
it from a genuinely external network, and only after separate payment approval
send a small test amount and confirm it arrived at that same wallet. Repeat
rename, deactivation, restart/restore, revoked session and old callback tests.
Dashboard login alone does not satisfy these steps.

Merge the Wallet PR before the API companion PR whose CI pins this commit.
Neither merge authorizes deployment or feature activation. To withdraw the
public address service, keep/turn `WALLET_MVP_DISCOVERY_ENABLED` off through the
operator's approved process; per-wallet deactivation uses the existing signed
action. A client rollback can hide the UI but cannot revoke public contexts.
Backend deactivation must fence existing contexts. Do not reset local seeds,
wallets, balances or transaction history. No infrastructure change is included.
