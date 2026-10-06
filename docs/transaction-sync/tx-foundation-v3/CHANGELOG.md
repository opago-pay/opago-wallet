# Public API transaction foundation v3 (BTC and HBAR)

This directory holds the v3 public API contract for Send and Receive of BTC
(Lightning and Spark) and HBAR. It covers authentication, wallet, address and
account binding, payment evidence, payment aliases and the migration from the
v2 registration pass-through. Buy, Sell, Fiat and Swap are later extensions.

The structure follows the repository copy of the payment registration
contract 0.2.1 (`docs/contracts/payment-registration/`): `openapi-public.json`,
`schemas.json`, an error catalog (`errors.json`), test vectors
(`test-vectors/`) and the normative text (`spec.md`).

Governing documents, which apply where they differ from this contract:
`docs/payment-registration-data-model.md`, `docs/wallet-tme-shadow-mode.md`
and `docs/wallet-customer-relationships.md`.

Airtable task: `recb95i65wkNTwmwx` ("Define public API transaction foundation
for BTC and HBAR").

## 3.0.0-draft.1 (2026-10-03)

First draft. Specification only: no route, no runtime code, no table and no
Alembic revision.

- Authentication: `AccountBearer` (Keycloak), `WalletBearer` (wallet
  session from `createWalletSession`) and `PosBearer` (device credential).
  The facade strips `X-Opago-User-*` headers; api-internal verifies the
  end-user credential independently. One-time challenge message for wallet
  binding and wallet sessions.
- Binding: `createWalletChallenge`, `bindWallet`, `listWallets`,
  `getWallet`, `createWalletSession`, `createAddressBinding`,
  `listAddressBindings`, `deactivateAddressBinding`. Custody comes only from
  the internal wallet record; the durable wallet identity key also covers
  tombstones. `bindWallet` returns `BoundWallet` (Spark or Hedera, active,
  custody unknown). Hedera `createWalletSession` re-reads the current
  on-network key (OQ-AUTH-6) and lists `upstream_unavailable` and
  `422 rail_not_enabled`. `createAddressBinding` returns
  `ActiveAddressBinding`. `deactivateAddressBinding` returns
  `DeactivatedAddressBinding`. `sendPayment` returns `SentRegistration`
  with a non-null `command`. An unresolved receipt has `transaction_id`
  null. A paid incoming registration keeps its settled invoice when a
  later TME block sets `tme_blocked`.
- Path A: `createPaymentRegistration`, `getPaymentRegistration`,
  `getOrRefreshInvoice`, `cancelRegistration` keep the 0.2.1 rules and add
  the required fields `direction`, `asset` and `rail`. `cancelRegistration`
  lists `410 registration_cancelled`. New outgoing
  Lightning registration and `sendPayment` with the single
  `payment_commands` row. `Registration` adds `direction`, `asset`, `rail`,
  `command`, `transaction_id` and `wallet_id`.
- Path B evidence: `reportWalletPayment`, `getWalletPaymentReport` and
  `getWalletPayment`. Every raw report is kept; the receipt shows the
  current resolution and the OPAGO verification status.
- Aliases: read-only `WalletPayment.aliases`, wallet-scoped, set once. A
  `path_b` payment has at least one alias.
- HBAR: schemas are defined; HBAR writes answer `422 asset_not_enabled`
  until the governing documents define the HBAR binding and evidence rules.
- Migration: v2 to v3 path map, request up-conversion and response
  down-conversion with normative vectors.
- Error catalog: every code that 0.2.1 and the current v2 route return keeps
  its status (including `410 registration_cancelled` and the retryable
  `504 upstream_timeout`); new codes are added.
- 35 open questions are listed in `spec.md`, section 13.

Compatibility: v3 is a new contract next to v2. v2 clients keep the 0.2.1
shapes through the down-conversion in `spec.md`, section 11.
