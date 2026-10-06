# Public API transaction foundation v3 (BTC and HBAR)

Status: specification, version `3.0.0-draft.1`. This document adds no route,
no runtime code, no table and no Alembic revision. It defines the public v3
contract for Send and Receive of BTC (Lightning and Spark) and HBAR (Hedera).
Buy, Sell, Fiat and Swap are later extensions and are not in this contract.

Files of this contract:

| File | Content |
| --- | --- |
| `spec.md` | Normative rules (this file). |
| `openapi-public.json` | Public v3 operations. `x-opago-*` fields are normative. |
| `schemas.json` | JSON Schema 2020-12 definitions that the operations reference. |
| `errors.json` | Error catalog: code, HTTP status, retry rule. |
| `test-vectors/schema-vectors.json` | Valid and invalid examples for each request and response schema. |
| `test-vectors/migration-v2-v3.json` | v2 to v3 request and response conversion vectors. |
| `test-vectors/error-vectors.json` | Error envelope examples. |
| `CHANGELOG.md` | Version history. |

The structure follows the repository copy of the payment registration
contract 0.2.1 (`docs/contracts/payment-registration/`).

## 1. Governing documents

These documents govern this contract. Where this contract and one of them
differ, that document applies, and the difference is a defect of this
contract:

1. [Payment registration data model and migration plan (M8)](../../payment-registration-data-model.md)
2. [Wallet MVP TME shadow-mode contract](../../wallet-tme-shadow-mode.md)
3. [Wallet customer and service relationship model](../../wallet-customer-relationships.md)

The payment registration contract 0.2.1
(`docs/contracts/payment-registration/`) is the v2 baseline. v3 keeps its
registration semantics and adds the fields in section 7.

The FX rule of [fx-rate-source.md](../fx-rate-source.md) applies to every
EUR value. A client never supplies a valuation rate (section 8.6).

## 2. Terms

| Term | Meaning |
| --- | --- |
| Account | An OPAGO Keycloak account. Its subject resolves to one party and, after registration, to one customer in one tenant (`wallet-customer-relationships.md`). |
| Wallet | One internal `wallets` row. Its custody type is immutable once known. |
| Wallet source | `lnbits`, `spark` or `hedera` (`wallets.wallet_source`). |
| Source wallet ID | The immutable source identity of the wallet (`wallets.source_wallet_id`). |
| Address binding | A receive address (Lightning address, Spark address, Hedera account) that resolves to one wallet. |
| Path A | An OPAGO-registered payment with `registration_id` and an append-only `pre_check_id` history. |
| Path B | A wallet-direct non-custodial payment. OPAGO observes it after the fact and cannot stop it. |
| Payment report | One raw Path B wallet report. Every report is kept with its own receipt. |
| Alias | One known identifier of a payment, wallet-scoped, that points at one canonical transaction. |
| Facade | The public `opago-api` service that forwards v3 calls to api-internal. |

The words MUST, MUST NOT, SHOULD and MAY have their RFC 2119 meaning.

## 3. Transport, headers and idempotency

1. Public identifiers. `wallet_id`, `transaction_id`, `registration_id`,
   `address_id` and `receipt_id` are UUIDs in this contract, as
   `wallet_id` already is in contract 0.2.1. `payment_registrations.id`
   is a UUID in the governing model. `wallets.id` and `transactions.id`
   are integer keys today, and no governing document defines a durable
   public UUID for them. This contract does not define that mapping; it is
   open (OQ-ID-1) and blocks every operation that takes or returns a
   wallet or transaction ID.

2. Every v3 operation uses TLS through the facade. The facade forwards to
   api-internal over the internal TLS transport of contract 0.2.1.
3. Every request MUST send `Authorization`, `X-Opago-Contract:
   tx-foundation-v3`, `X-Opago-App-Build`, `X-Opago-Platform` and
   `X-Request-Id`. Every `POST` MUST also send `Idempotency-Key` (UUID).
4. Every response MUST send `X-Request-Id` and `Cache-Control: no-store`. A
   retryable error MUST send `Retry-After`. The TME default is 5 seconds.
   `openapi-public.json` models the retryable statuses (`503`, `504`) of
   each operation as explicit responses with a required `Retry-After`.
5. The request body limit is 65 536 bytes of plaintext.
6. Idempotency scope:
   - `createPaymentRegistration`: (`tenant_id`, `wallet_id`,
     `ownership_epoch`, `Idempotency-Key`), as `payment_registrations`
     defines it. The digest is the 0.2.1 request fingerprint (amount,
     fiat amount and currency, description, external reference, wallet,
     POS device). v3 adds `direction`, `asset` and `rail` to the digest
     input only when one of them differs from the v2 default (`incoming`,
     `BTC`, `lightning`), and adds the payment hash and request fingerprint
     of an outgoing `payment_request`. A v2 request and the equivalent v3
     request therefore have the same digest, also for rows that exist
     before v3.
   - Every other `POST`: (`tenant_id`, principal, `operationId`, every
     path parameter, `Idempotency-Key`). Its digest covers the normalized
     path parameters and the body, so the same key on another resource
     (for example `sendPayment` or `cancelRegistration` on another
     registration, whose bodies are `{}`) gives `409 idempotency_conflict`
     and never replays the first resource's result.
   - The same key with another digest returns `409 idempotency_conflict`.
   - The same key with the same digest returns the stored result when the
     first attempt ended with a success or a non-retryable error. A
     retryable error (`tme_pending`, `tme_unavailable`,
     `upstream_unavailable`, `upstream_timeout`) is not stored as the
     result: a retry with the same key resumes the operation on the
     durable state (for example the same registration) and can succeed
     (`docs/payment-registration-route.md`, "Behaviour": a retry with the
     same `Idempotency-Key` resumes the same registration).
   - `reportWalletPayment` is an exception for storage: a retry with the
     same key and digest returns the first receipt and stores no second raw
     report. A report with a new key is always a new raw report, also when
     its content repeats an earlier report (section 8.2). Whether a
     transport retry with the same key must also be kept as a raw report
     is open (OQ-EV-5).
7. All timestamps are UTC in the form `YYYY-MM-DDTHH:MM:SSZ`.
8. Every object has `additionalProperties: false`. A strict client MUST
   reject an unknown field. A new field is therefore a contract version
   change.
9. Every string pattern ends with `$(?!\n)`. Some regex engines (for
   example Python `re`) let `$` match before a final line feed; the
   lookahead rejects a trailing line feed in every engine.

## 4. Errors

1. Every error uses the `Error` envelope of `schemas.json`: `error.code`,
   `error.message`, `error.retryable`, `error.details` and `request_id`.
   `error.details` is a closed object (`ErrorDetails`) with the optional
   keys `registration_id`, `wallet_id`, `retry_after_seconds`, `asset`,
   `rail` and `field`. A new key is a contract change.
2. The HTTP status of a code is the status in `errors.json`. A server MUST
   NOT send a code with another status.
3. `error.retryable` is `true` exactly for the codes that `errors.json`
   marks retryable (`tme_pending`, `tme_unavailable`,
   `upstream_unavailable`, `upstream_timeout`). The schema enforces this.
4. The codes that contract 0.2.1 and the current v2 route
   (`docs/payment-registration-route.md`) return keep their meaning and
   status, including `410 registration_cancelled` and the retryable
   `504 upstream_timeout`. v3 adds codes only. Section 11.3 lists the v2
   mapping.
6. The registration operations use the v2 codes for v2 conditions: a
   locked customer account, an inactive or deleted wallet and a wallet with
   unknown custody give `403 forbidden`. A `rejected` registration gives
   its `reject_reason` code with `403`, as v2 does.
5. An authorization failure always gives `403 forbidden`. An unknown
   device, a wrong credential, a wallet of another tenant and a wallet of
   another owner give the same answer, so a client cannot probe for IDs
   (`wallet-tme-shadow-mode.md`, acceptance case 20).

## 5. Authentication

### 5.1 Credentials

| Scheme | Holder | Issued by | Scope |
| --- | --- | --- | --- |
| `AccountBearer` | Wallet app user | Keycloak | One account (subject) in one tenant. On Path A operations, only a wallet without a user-held key (rule 5.3.6). |
| `WalletBearer` | Wallet app installation | `createWalletSession` | One wallet, one installation, one `ownership_epoch`. |
| `PosBearer` | POS device | Device registration (existing) | One active `pos_devices` row. |

The internal `ServiceBearer` of contract 0.2.1 is not a public credential.
It never substitutes end-user authorization.

### 5.2 Facade rules

1. The facade MUST remove every client-supplied `X-Opago-User-*` header.
2. The facade MUST copy the client `Authorization` value into
   `X-Opago-User-Authorization` and authenticate itself to api-internal
   with its own service credential (contract 0.2.1, "Facade").
3. api-internal MUST verify the end-user credential independently. The
   facade check is not sufficient.
4. The facade MUST forward error codes and statuses unchanged.

### 5.3 Principal resolution

1. `AccountBearer`: api-internal verifies issuer, audience, signature,
   expiry and `auth_time`, then resolves the subject to the tenant and the
   party. A request with a tenant that differs from the token tenant gives
   `403 forbidden`.
2. `WalletBearer`: api-internal resolves the token to (`tenant_id`,
   `wallet_id`, `installation_id`, `ownership_epoch`). The token is invalid
   when the wallet ownership epoch has changed, when the wallet is inactive
   or deleted, or when it has expired. An invalid token gives
   `403 forbidden`.
3. `PosBearer`: the credential MUST equal `pos_devices.api_key` of the
   active device whose `device_id` is `pos_id`. The device MUST be bound to
   a wallet of its customer (`docs/payment-registration-route.md`, "End-user
   principal").
4. A wallet ID in a path or body MUST belong to the principal's tenant and
   owner. api-internal derives the wallet from the principal, or verifies
   the supplied ID against the authorized tenant and owner record, before
   custody classification or any canonical write. A failed binding is
   rejected with `403 forbidden` and audited, and no canonical transaction
   is created or changed (`wallet-tme-shadow-mode.md`, Path B).
5. A client-supplied custody flag never exists in this contract. Custody
   comes only from the internal wallet record.
6. A wallet session needs a signature with a user-held wallet key
   (section 5.4). An LNbits wallet has no such key. For a Path A operation
   on an LNbits wallet, api-internal therefore accepts an `AccountBearer`
   whose party is the current owner of that wallet. It never accepts an
   `AccountBearer` for a Path A operation on a Spark or Hedera wallet;
   those need a `WalletBearer`. This rule needs confirmation (OQ-AUTH-5).

### 5.4 Challenge message

A wallet binding and a wallet session use a one-time challenge.
`createWalletChallenge` returns `message`. The client signs the exact UTF-8
bytes of `message` with the wallet key. The message has these lines,
separated by one line feed (`0x0A`), with no trailing line feed:

```text
opago-tx-foundation-v3
purpose:<bind|session>
tenant:<tenant_id>
subject:<Keycloak subject>
wallet_source:<spark|hedera>
source_wallet_id:<source wallet ID>
network:<network or "-">
installation_id:<UUID or "-">
challenge_id:<UUID>
nonce:<64 lowercase hex characters>
expires_at:<timestamp>
```

Rules:

1. The schema checks the line structure of `message`. Its `purpose`,
   `challenge_id` and `expires_at` lines MUST equal the sibling fields of
   `WalletChallenge`, and every other line MUST equal the stored challenge.
   The server enforces these equalities; the repository test checks them
   on the vectors.
2. A challenge is valid for one use, for the account that requested it,
   and until `expires_at`. The lifetime is an open question (OQ-AUTH-3).
3. Any failure (unknown, expired, used, other account, signature mismatch)
   gives `400 challenge_invalid`.
4. `createWalletSession` consumes a challenge only when the stored
   challenge has `purpose: session`, its `wallet_id` equals the path
   `wallet_id`, and the issued session carries the stored
   `installation_id`. `bindWallet` consumes only a `purpose: bind`
   challenge. Any mismatch gives `400 challenge_invalid` and does not
   consume the challenge.
5. Hedera: a valid signature from the supplied `public_key` is not
   sufficient. Before `bindWallet` commits, and again before
   `createWalletSession` issues a `WalletBearer` when Hedera sessions are
   enabled, the server MUST verify with an authoritative network read that
   this key is authorized by the current key structure of `account_id` on
   the named network, not only a key that was accepted at bind time. The
   policy for key lists, threshold keys and key rotation is open
   (OQ-AUTH-6); until it is decided, Hedera binding and Hedera sessions
   stay disabled, and a request for either gives `422 rail_not_enabled`.
   A transient failure of that read gives the retryable
   `503 upstream_unavailable`.
6. The signature algorithm and encoding per wallet source are open
   (OQ-AUTH-1). The `Signature` schema is therefore opaque printable ASCII. Until they are decided, `bindWallet` and
   `createWalletSession` MUST NOT be enabled.

## 6. Binding

### 6.1 Account binding

1. An account binds to a party. A customer row exists only after a
   registered service relationship, and the first customer registration
   commits atomically with the first service relationship
   (`wallet-customer-relationships.md`, "Persistence contract").
2. `bindWallet` is that first relationship for a Wallet person. Until M8
   step 5 (party records and the conditional `company_name`) is deployed,
   only wallets of an existing company customer can register
   (`payment-registration-data-model.md`, "Party records"). Person binding
   is therefore blocked until step 5 (OQ-BIND-4).
3. A transaction-only (`unknown`) party never gets a customer row through
   this API.
4. `listWallets` returns the active wallets whose current owner is the
   account's party. An inactive or deleted wallet stays in history but is
   not returned; the schema accepts only `status: active` in the list.
5. `listWallets` and `listAddressBindings` return pages of at most `limit`
   items (default and maximum 100). `next_cursor` is `null` on the last
   page; the client passes it as `cursor` to read the next page. A cursor
   is opaque and valid only for the same principal and operation.

### 6.2 Wallet binding

1. `createWalletChallenge` with `purpose: bind` names the wallet source
   identity: for Spark the identity public key, for Hedera the network,
   account ID and public key.
2. `bindWallet` verifies the challenge signature, then creates the wallet
   row and the ownership interval in one transaction. The HTTP 201 body is
   `BoundWallet`, not the generic `Wallet`. The server sets:
   - `wallet_source` (`spark` or `hedera` only) and `source_wallet_id`
     (immutable);
   - `status` `active`;
   - `custody_type` from the internal classification. A wallet that this
     flow binds is self-custodied by the user, but the classification rule
     for Spark and Hedera wallets is not yet written in a governing
     document (OQ-BIND-1). Until it is, the server stores `unknown`, which
     blocks payment enablement and Path B selection
     (`wallet-tme-shadow-mode.md`, custody classification);
   - `ownership_epoch` from the wallet ownership counter.
   An LNbits, inactive or deleted wallet, or a wallet with known custody,
   is not a valid bind response. `getWallet` still returns the generic
   `Wallet`.
3. The durable identity key is (`tenant_id`, `wallet_source`,
   `source_wallet_id`), as `payment-registration-data-model.md` (`wallets`)
   defines it: `source_wallet_id` is the Hedera account ID or the Spark
   identity public key. The governing key contains no network, so a
   testnet and a mainnet Hedera account with the same number, or one Spark
   key on two networks, collide on it. How to add the network is open
   (OQ-BIND-6) and needs a change of the governing model first. It also covers tombstones. A bind of a key that an
   active wallet or a tombstone holds gives `409 wallet_already_bound`. A
   late task cannot recreate a deleted wallet under a new internal ID
   (`wallet-customer-relationships.md`, acceptance examples).
4. A wallet is counted for `has_non_custodial` only after ownership is
   established by the account session and the wallet proof.
5. Wallet deletion sets `deleted_at` and keeps the row. This contract has
   no public delete operation (OQ-BIND-2). An `AccountBearer` write on an
   inactive or deleted wallet gives `409 wallet_inactive`. A `WalletBearer`
   of such a wallet is invalid and gives `403 forbidden` (rule 5.3.2).
6. Ownership transfer is not a public operation. An ownership change
   increments `ownership_epoch`, invalidates every `WalletBearer` of the
   earlier epoch and starts a new idempotency scope.
7. A wallet's type (`WalletType`: `INBOUND`, `OUTBOUND`, `EXTERNAL`,
   `OTHER`) controls Path A direction today: only `INBOUND` registers
   incoming and only `OUTBOUND` registers outgoing payments. `Wallet.purpose` returns it for an LNbits wallet, so a client can
   choose the wallet for a receive or a send. Spark and Hedera wallets
   have no such type yet; their `purpose` is `null` (OQ-BIND-3).

### 6.3 Address binding

1. `createAddressBinding` binds one receive address to one wallet. Kinds:
   - `lightning_address`: `local@domain`. The domain MUST be a domain that
     the tenant configuration lists (OQ-ADDR-1).
   - `spark_address`: the Spark address of the same wallet. The server MUST
     verify that the address derives from the wallet source identity
     (OQ-ADDR-2).
   - `hedera_account`: MUST equal the Hedera account ID of the wallet.
2. One active binding per (`tenant_id`, `kind`, `value`); for
   `hedera_account` the key also contains the wallet network. A value with an
   active binding to another wallet gives `409 address_taken`.
3. A registration has no address lineage: neither `CreateRegistration` nor
   `payment_registrations` records the address binding that a payer used.
   A replacement or a deactivation of an address binding therefore
   cancels no registration in this contract. The cancel reasons
   `address_changed` and `address_deactivated` keep their 0.2.1 use (for
   example a POS device rebind cancels the open registrations of the
   device). Whether address-level invalidation needs registration-address
   lineage, or a wallet-scope cancellation, is open (OQ-ADDR-3).
4. A binding identifies the wallet. It never changes the wallet custody
   type (`wallet-tme-shadow-mode.md`, custody classification).
5. A POS device binding (`pos_devices.wallet_id`) is not an address
   binding. It stays in the device routes (`createPosBindingIntent`,
   `confirmPosBinding` of contract 0.2.0) and is not in this contract.
6. `createAddressBinding` returns an `ActiveAddressBinding` (`status:
   active`). `deactivateAddressBinding` returns a
   `DeactivatedAddressBinding` (`status: deactivated`, with
   `deactivated_at` and `deactivate_reason`).

## 7. Path A: registered Send and Receive

### 7.1 Registration

`createPaymentRegistration` keeps every rule of contract 0.2.1 and adds
three required fields: `direction`, `asset` and `rail`.

| Variant | `direction` | `asset` | `rail` | Target | Amount |
| --- | --- | --- | --- | --- | --- |
| Wallet receive, msat | `incoming` | `BTC` | `lightning` | `wallet_id` | `amount_msat` |
| Wallet receive, fiat | `incoming` | `BTC` | `lightning` | `wallet_id` | `amount`, `currency` |
| POS receive, msat | `incoming` | `BTC` | `lightning` | `pos_id` | `amount_msat` |
| POS receive, fiat | `incoming` | `BTC` | `lightning` | `pos_id` | `amount`, `currency` |
| Wallet send | `outgoing` | `BTC` | `lightning` | `wallet_id` | encoded in `payment_request` |

Rules:

1. Custody comes from the wallet record. A wallet with custody `unknown`,
   an inactive or deleted wallet and a locked customer account give
   `403 forbidden`, as in v2 (section 4, rule 6).
2. The registration wallet MUST have `wallet_source = 'lnbits'` until a
   later step adds invoice issuance and settlement binding for Spark and
   Hedera wallets (`payment-registration-data-model.md`, constraints).
   A Spark or Hedera wallet gives `422 rail_not_enabled`.
3. `asset` is `BTC` only. HBAR Path A is rejected until the HBAR binding
   rules exist (section 10). The schema restricts `asset` to `BTC` for
   registrations, so an HBAR registration request fails schema
   validation and gives `400 invalid_request`. `422 asset_not_enabled`
   applies only to HBAR wallet reports, whose shape the schema defines.
4. POS rules of contract 0.2.1 apply unchanged: server-issued `pos_id`,
   `direction = 'incoming'`, the device's bound `INBOUND` wallet, the stored
   `customers.fee_percent`, and a unique `external_reference` per device
   (`409 payment_exists`). A POS registration MUST carry a non-null
   `external_reference`: the governing model stores it as
   `client_reference`, NOT NULL for `channel = 'pos'`.
5. Wallet send: the `payment_request` MUST decode, MUST carry an amount,
   MUST NOT be expired and MUST be for the deployment network. Otherwise
   `400 payment_request_invalid`. The registration stores the payment hash
   and the request fingerprint. One external invoice has at most one live
   outgoing registration per wallet; a second one gives
   `409 payment_exists`.
6. The custodial lock, the identification gate and the TME pre-check rules
   of `payment-registration-data-model.md` ("Eligibility is computed, not
   stored") apply unchanged. Shadow fail-open applies only to the TME
   shadow check of a non-custodial registration.
7. The wallet target needs a `WalletBearer`, or an `AccountBearer` under
   rule 5.3.6. Until the wallet session store and that rule exist,
   api-internal rejects the wallet target with `403 forbidden`
   (`docs/payment-registration-route.md`, "End-user principal").
8. `getOrRefreshInvoice` on an outgoing registration and `sendPayment` on
   an incoming registration give `400 invalid_request`.

### 7.2 Receive

`getOrRefreshInvoice` and `cancelRegistration` keep the rules of contract
0.2.1 and `docs/payment-registration-route.md`, including
`410 registration_cancelled` and `504 upstream_timeout`. Cancellation stops further
invoices. It does not make an issued invoice unpayable. A late settlement is
recorded on the canonical transaction and the registration stays
`cancelled`.

### 7.3 Send

1. `sendPayment` reserves and dispatches the single `payment_commands` row
   of an outgoing registration through the dispatch fence of
   `payment-registration-data-model.md` ("Dispatch fence").
2. The command has one server-generated provider idempotency key. A retry,
   a timeout and the reconciler reuse the command and its key. A command in
   `dispatched` or `unknown` is never sent again.
3. The response is a `SentRegistration`: an outgoing `Registration` whose
   `command` is the reserved or dispatched `PaymentCommand`, never `null`.
   `command.amount_msat`
   equals the pre-check `authorized_amount_msat`. `command.transaction_id`
   is set only when `dispatch_state` is `succeeded`, because an outgoing
   canonical transaction requires a succeeded command
   (`payment-registration-data-model.md`, `transactions` (extend)).
4. A `failed` command is final. A new send needs a new registration. The
   registration status after a failed command is open (OQ-PA-1).
5. Only a Path A send can be stopped before network execution. A Path B
   send can never be stopped (`wallet-tme-shadow-mode.md`, "Shadow
   behavior").

### 7.4 Registration response

`Registration` keeps every 0.2.1 field and invariant and adds:

| Field | Rule |
| --- | --- |
| `direction` | Echo of the request. |
| `asset` | `BTC`. |
| `rail` | `lightning`. |
| `command` | `PaymentCommand` for an outgoing registration after `sendPayment`; else `null`. Always `null` for an incoming registration. |
| `transaction_id` | The first settlement of the registration, for incoming and outgoing registrations; `null` while none exists. Required when `status` is `paid`. A late settlement after `cancelled` or `rejected` also sets it. The client reads the payment with `getWalletPayment`. |

Invariants:

1. For an outgoing registration, `invoice`, `amount` and `currency` are
   `null` and `amount_msat` is the amount of the payment request.
2. An `invoice_issued` registration can show `invoice: null`. The server
   shows an unpaid invoice only while the current policy still permits it,
   and withholds it otherwise (`docs/payment-registration-route.md`,
   "Behaviour"; `tme_blocked` also forces `null`).
3. `pre_check_valid_until` is the effective deadline of the current
   pre-check: the earlier of the stored `preliminary_valid_until` and
   `checked_at + 24 hours`, or `checked_at + 24 hours` when no stored
   deadline exists. It is therefore always set for an `ok` pre-check.
4. A fiat registration with an `ok` pre-check has `amount_msat` set (the
   `authorized_amount_msat` of that check). `reject_reason` is set exactly
   when `status` is `rejected`.
5. For an incoming registration, the requested amount is either the fiat
   pair (`amount` and `currency` both set) or the msat request (`amount`
   and `currency` both `null`, `amount_msat` set).
6. `cancel_reason` is set exactly when `status` is `cancelled`
   (`payment-registration-data-model.md`, `payment_registrations`).
7. `command.registration_id` MUST equal `registration_id`,
   `command.pre_check_id` MUST equal `pre_check_id`, and
   `command.amount_msat` MUST equal `amount_msat`. When
   `command.transaction_id` is set, `transaction_id` MUST equal it.
   JSON Schema cannot compare two fields, so the server MUST enforce
   these equalities, and the repository test checks them on the vectors.
8. Command timestamps: `dispatched_at` is set for `dispatched`, `unknown`
   and `succeeded`; it is `null` for `reserved` and for a `failed` command
   that the dispatch claim failed before the send. `outcome_at` is set
   only for `succeeded` and `failed`.
9. `transaction_id` is `null` while the registration is in an open state
   (`open`, `invoice_issued`, `expired_awaiting_refresh`). A paid outgoing
   registration has a `command` with `dispatch_state: succeeded`, and a
   `succeeded` command implies `status: paid` (the dispatch fence projects
   the settlement before a cancellation or rejection can commit).
10. `tme_blocked: true` withholds the invoice and prevents a new dispatch.
    It does not hide a command that is already `reserved`, `dispatched` or
    `unknown`; the registration shows it until the provider outcome is
    known (`payment-registration-data-model.md`, rejected projection).
    Exception: a settlement can race a later enforcing rejection of an
    issued invoice. A `paid` incoming registration then keeps its settled
    invoice although `tme_blocked` is `true`.
11. `pre_check_id` is `null` only while the registration has no pre-check
    row yet (a registration is durable before its first check;
    `docs/payment-registration-route.md`, "Behaviour"). Every pre-check row
    has a non-null `pre_check_id`.
12. `wallet_id` is the registration wallet. For a POS registration it is
    the wallet that the device was bound to at registration, so a POS
    client can call `getWalletPayment` with it.
13. An outgoing registration never has `invoice_issued` or
    `expired_awaiting_refresh`. A `cancelled` or `rejected` outgoing
    registration has no command or a `failed` command, and
    `transaction_id: null`: the fences delay both terminal transitions
    while a command is in flight, and a succeeded command projects `paid`.
14. An incoming `paid` registration shows the invoice that settled, with
    `invoice.status: paid` (`docs/payment-registration-route.md`,
    "Behaviour"). Whenever an incoming invoice shows `status: paid`, also on a
    `cancelled` or `rejected` registration after a late settlement,
    `transaction_id` is set.
15. `custodial` stays a boolean. Today every registration is on an LNbits
    wallet and therefore custodial (rule 7.1.2); the non-custodial and
    shadow branches of the schema stay for Spark Path A (OQ-PA-2), so that
    enabling it is not a breaking contract change.

## 8. Path B: payment evidence

### 8.1 Report intake

`reportWalletPayment` accepts one raw report of a wallet-direct payment.
The wallet sends it for every observed incoming and outgoing payment,
including pending, failed and canceled attempts. TME evaluation covers
every report; there is no amount threshold (`wallet-tme-shadow-mode.md`,
coverage).

Report fields (BTC):

| Field | Rule |
| --- | --- |
| `asset` | `BTC`. |
| `rail` | `spark` for `SPARK_TRANSFER_ID`; `lightning` for `SPARK_LIGHTNING_REQUEST_ID`. |
| `id_source` | `SPARK_TRANSFER_ID` or `SPARK_LIGHTNING_REQUEST_ID`. |
| `source_payment_id` | Stable SDK payment or invoice ID. MUST survive app restarts and retries. A request UUID is not sufficient. `null` when the wallet has none; the server then quarantines the report. |
| `direction` | `incoming` or `outgoing`. |
| `sdk_status` | Raw SDK status, kept as evidence. |
| `status` | Normalized status, or `null` when the app cannot map it. An unknown status stays unresolved. |
| `amount_msat` | Absolute positive amount, or `null` when unknown. Required when `status` is `settled`. For a settled zero-amount invoice, the actual paid amount. |
| `payment_hash`, `bolt11` | Optional; Lightning request reports only. |
| `preimage` | Optional; Lightning only; requires `payment_hash`. |
| `observed_at` | Optional client time. Information only; never an effective time. |

### 8.2 Intake rules

1. The server derives the wallet from the `WalletBearer` principal. The
   path `wallet_id` MUST equal it.
2. The report rail MUST match the wallet source before any write. A BTC
   report (`SPARK_TRANSFER_ID`, `SPARK_LIGHTNING_REQUEST_ID`) needs
   `wallet_source = 'spark'`. An HBAR report needs
   `wallet_source = 'hedera'` and the wallet network (when HBAR is
   enabled). A mismatch gives `400 invalid_request`, is audited, and
   stores no observation and no canonical row.
3. The server generates `receipt_id` and `received_at`. Values from the
   client do not exist in the schema.
4. Every raw report is kept. Reports of the same logical payment
   (`tenant_id`, `wallet_id`, `id_source`, `source_payment_id`) share one
   wallet payment identity. Resolution and coverage are recorded on the
   identity, so a retried report does not count twice.
5. For a valid report the server commits, in one database transaction, the
   raw observation, the canonical link or upsert, the evidence revision and
   the pending evaluation work. For an incomplete or quarantined report it
   commits the raw observation, the unresolved state and `retry_due_at`.
6. The canonical `external_id` is `spark-transfer:<source_payment_id>` for
   `SPARK_TRANSFER_ID`, `spark-lightning-request:<source_payment_id>` for
   `SPARK_LIGHTNING_REQUEST_ID` and `hedera-tx:<source_payment_id>` for
   `HEDERA_TRANSACTION_ID`. The schema ties each namespace to its
   `id_source`. The suffix MUST equal `source_payment_id` exactly. JSON
   Schema cannot compare two fields, so the server MUST enforce it, and the
   repository test checks it on the vectors. `id_source` is set
   explicitly, never to the `LNBITS_CHECKING_ID` default.
7. Before an upsert at (`wallet_id`, `external_id`), the server compares
   `id_source` and the raw source identity of an existing row. A
   cross-source collision is quarantined and neither row changes.
8. A report for a wallet with custody `unknown` is accepted and kept. Its
   evaluation records custody `unknown` (`wallet-tme-shadow-mode.md`,
   custody classification: an observed payment is preserved for shadow
   evaluation). Unknown custody blocks Path B selection and payment
   enablement, not observation.
9. A schema-invalid report gives `400 invalid_request` and nothing is
   stored. Whether a schema-invalid report from an authenticated wallet
   must also be kept as a raw quarantined observation is open (OQ-EV-1).
10. A Lightning preimage is validated transiently against `payment_hash`
    and is never persisted. A matching hash and preimage never proves
    settlement. When a report carries both `bolt11` and `payment_hash`,
    the hash decoded from `bolt11` MUST equal `payment_hash`; a mismatch
    gives `400 invalid_request`, is audited, and stores nothing. JSON
    Schema cannot decode an invoice, so the server enforces this rule.
11. The wallet sends no rate and no fiat value. The server values the
    payment from a server-side rate at the effective time (section 8.6).

### 8.3 Status lifecycle

1. A later or retried `pending` report never replaces a terminal state
   (`settled`, `failed`, `canceled`).
2. A duplicate terminal report never changes the first terminal receipt
   time.
3. Conflicting terminal reports stay unresolved until independent
   reconciliation. Arrival order never decides.
4. A direction correction changes the same canonical row and its
   revisions. It never creates a second canonical transaction.
5. A failed or canceled report with a known amount is an attempted
   non-payment. It is evaluated and excluded from confirmed aggregates.
6. A pending zero-amount report without a paid amount stays unresolved
   evidence. It closes only through a settlement (then canonical) or an
   audited `non_payment` disposition.

### 8.4 Receipt

`WalletPaymentReceipt` returns the current resolution of the identity:

| `resolution` | Meaning |
| --- | --- |
| `linked` | The identity points at `transaction_id`. |
| `unresolved` | Required facts are missing. `retry_due_at` is set and `transaction_id` is `null`. |
| `quarantined` | Missing or conflicting source identity, or a key collision. `retry_due_at` is set. |
| `non_payment` | An audited disposition closed the identity, or a quarantined report without a source identity, without a payment. |

`verification_status` is `wallet_reported` until a verified provider
record, an authorized network read or another independently checkable
receipt supports the payment. It is separate from the wallet's final SDK
status. A `wallet_reported` settled payment is real on the network but
counts only in a provisional metric, never in confirmed rolling TME sums or
counts.

### 8.5 Effective time

1. An app-only observation uses its first server receipt time as a
   provisional effective time (`effective_time_kind: provisional`).
2. The first settled report's receipt time is the provisional payment
   time. A verified settlement time supersedes it
   (`effective_time_kind: verified`).
3. `observed_at` from the client is never an effective time.

### 8.6 Valuation

The EUR value follows [fx-rate-source.md](../fx-rate-source.md): a fixed
payer-facing fiat amount first; otherwise a server-side quote of the exact
asset amount at the effective time. A client rate is never a valuation
source. A missing rate never produces zero; EUR-dependent rules are
`unavailable` and retried.

### 8.7 Provider evidence

Provider evidence (`provider_payment_evidence`) is internal. It has no
public v3 operation. It attaches to the same canonical transaction through
aliases (section 9).

### 8.8 Payment read

`getWalletPayment` returns the canonical transaction with its signed
amount, normalized status, verification status, effective time, path,
Path A lineage and aliases. A `path_a` payment has `verification_status: verified` and a verified
effective time, because its canonical row exists only after a verified
settlement or succeeded send. A `path_a` payment is `BTC` on `lightning`, the only
rail on which this contract creates a registration, and has `status:
settled`: a Path A canonical transaction exists only for an invoice
settlement or a succeeded send. A `legacy` payment is an existing LNbits
row without registration lineage, verified by the provider ingest
(`verification_status: verified`), (`payment-registration-data-model.md`,
`transactions`): `BTC` on `lightning`, never labelled `path_b`. A
`PosBearer` reads only payments of registrations that the device created,
on the wallet that the device is bound to. An `AccountBearer` reads only wallets that its
party owns at the time of the read.

## 9. Aliases

1. `aliases` contains each alias key (`id_source`, `provider_id`,
   `source_id`) once. An empty array is valid only for `legacy` and
   `path_a` rows created before `payment_identity_aliases` existed
   (M8 step 4 has no backfill). A `path_b` payment MUST have at least one
   alias, because linking creates the canonical transaction and its aliases
   in one write. The schema rejects exact duplicates and a `path_b` payment
   with no alias; the server enforces the key uniqueness, and the
   repository test checks it on the vectors.
2. The alias kinds of a payment match its asset: a `BTC` payment has no
   `HEDERA_TRANSACTION_ID` alias, and an `HBAR` payment has only
   `HEDERA_TRANSACTION_ID` and `PROVIDER_PAYMENT_ID` aliases.

3. An alias is one known identifier of one payment: (`tenant_id`,
   `wallet_id`, `id_source`, `provider_id`, `source_id`), unique.
4. `provider_id` is the provider for a provider payment ID and for an
   LNbits checking ID. It is the empty string for Spark transfer IDs,
   Lightning request IDs, payment hashes and Hedera transaction IDs.
5. Aliases are wallet-scoped. The sending and the receiving wallet of one
   internal transfer have separate aliases and separate canonical
   transactions.
6. An alias target is set once and never changes. Aliases are never
   deleted.
7. Linking takes a lock on each known identifier in a fixed order, then:
   - one existing target: consistent newer facts revise it; contradicting
     facts quarantine the evidence;
   - no target: the physical key (`wallet_id`, `external_id`) decides; a
     same-source row is the target; an other-source row quarantines the
     evidence; else a new canonical row is created only when every
     required fact is present;
   - more than one target: the evidence is quarantined and an operator
     reconciles it. Money movements are never merged automatically.
8. The public API exposes aliases read-only in `WalletPayment.aliases`.
   A client never creates an alias.
9. The alias `id_source` values `PAYMENT_HASH` and `PROVIDER_PAYMENT_ID`
   name identifier kinds of `payment_identity_aliases`. They are not
   `transactions.id_source` values. Their final names in the alias table
   are open (OQ-AL-1).

## 10. HBAR

1. The schemas define the HBAR shapes: `WalletPaymentReport` with
   `asset: HBAR`, `rail: hedera`, `id_source: HEDERA_TRANSACTION_ID`,
   `amount_tinybar`, and `WalletPayment.amount_tinybar`.
2. The canonical `external_id` is `hedera-tx:<transaction_id>` with
   `id_source` `HEDERA_TRANSACTION_ID`
   (`payment-registration-data-model.md`, `transactions` (extend)).
3. Path B in the governing documents is `asset=BTC` only, and M8 writes no
   HBAR row until the governing contract defines the HBAR binding rules
   (authorized amount and settlement reference) and the HBAR validation and
   evidence rules. Until then the server MUST answer an HBAR report with
   `422 asset_not_enabled` and store nothing canonical.
4. The HBAR send and receive rules are open (OQ-HBAR-1 to OQ-HBAR-4).

## 11. Migration from v2 to v3

v2 is the public pass-through of contract 0.2.1:
`/api/v2/payments/registrations…` (`docs/payment-registration-route.md`,
"Consumers"). v3 replaces it. Both run in parallel during the migration.

### 11.1 Path mapping

| v2 public path | v3 public path | Internal path |
| --- | --- | --- |
| `POST /api/v2/payments/registrations` | `POST /api/v3/payments/registrations` | `POST /api/payments/registrations` |
| `GET /api/v2/payments/registrations/{registration_id}` | `GET /api/v3/payments/registrations/{registration_id}` | `GET /api/payments/registrations/{registration_id}` |
| `POST /api/v2/payments/registrations/{registration_id}/invoice` | `POST /api/v3/payments/registrations/{registration_id}/invoice` | `POST /api/payments/registrations/{registration_id}/invoice` |
| `POST /api/v2/payments/registrations/{registration_id}/cancel` | `POST /api/v3/payments/registrations/{registration_id}/cancel` | `POST /api/payments/registrations/{registration_id}/cancel` |

Every other v3 operation is new and has no v2 counterpart.

The internal path is shared, but the internal request and response schemas
differ (0.2.1 objects are closed). The facade therefore forwards
`X-Opago-Contract` to api-internal. api-internal validates the body
against the selected contract: no header selects 0.2.1, and
`tx-foundation-v3` selects this contract. The v3 internal OpenAPI copy is
not in this folder; it is a follow-up of the implementation step
(OQ-MIG-5).

### 11.2 Request up-conversion (v2 to v3)

1. A v2 `CreateRegistration` maps to v3 by adding `direction: "incoming"`,
   `asset: "BTC"` and `rail: "lightning"`. Every other field is copied
   unchanged.
2. Headers are copied unchanged. The facade adds `X-Opago-Contract`.
3. The v2 and v3 requests of one registration have the same idempotency
   digest (section 3, rule 6). A v2 retry after a v3 create with the same
   key returns the same registration, and the reverse.
4. A v2 POS request with `X-API-KEY` maps to `Authorization: Bearer <key>`
   in the facade, as in v2. Whether v3 POS clients still send `X-API-KEY`
   is open (OQ-MIG-2).
5. A v2 POS request without `external_reference` (or with `null`) has no
   v3 equivalent, because the governing model requires the POS client
   reference. The v3 request gives `400 invalid_request`. The migrated POS
   app always sends the device-local payment ID as `external_reference`.

### 11.3 Response down-conversion (v3 to v2)

1. A v3 `Registration` maps to v2 by removing `direction`, `asset`, `rail`,
   `command`, `transaction_id` and `wallet_id`. Every other field is copied unchanged.
2. A registration that v2 cannot represent (an outgoing registration) is
   not visible through v2. The proposed v2 answer is
   `404 registration_not_found` (OQ-MIG-1).
3. Error envelopes are identical. The v2-mapped operations keep the v2
   codes (section 4, rules 4 and 6). A v2 body cannot express an outgoing
   payment or another asset, so `payment_request_invalid` and
   `asset_not_enabled` cannot occur on v2. The only v3-only code that a v2
   request can reach is `rail_not_enabled` (a non-LNbits wallet); on v2 it
   maps to `403 forbidden`, the code that v2 uses for a wallet it cannot
   serve. This mapping needs confirmation (OQ-MIG-3).

### 11.4 Cut-over

1. The v2 routes stay until every client uses v3. The removal date is open
   (OQ-MIG-4).
2. No data migration is needed for registrations: v2 and v3 read the same
   `payment_registrations` rows. Existing rows are `incoming`, `BTC`,
   `lightning`.
3. The legacy POS v2 routes (`/opago-pos/api/v2/*`, `/lnpos/*`) stay
   removed. They are not v2 of this contract.

`test-vectors/migration-v2-v3.json` holds the normative conversion
vectors.

## 12. Test vectors

1. `schema-vectors.json`: for each named definition, `valid` examples MUST
   validate and `invalid` examples MUST fail.
2. `migration-v2-v3.json`: for each vector, the v3 side MUST validate
   against `schemas.json`; the conversion of section 11 applied to the v2
   side MUST give the v3 side (request) and the reverse (response).
3. `error-vectors.json`: each envelope MUST validate against `Error`, and
   its HTTP status MUST equal the catalog status of its code.

The repository test `tests/unit/contracts/test_tx_foundation_v3_contract.py`
checks these rules and reads only this folder.

## 13. Open questions

Each item needs a decision by the owner named in the Airtable task
(`recb95i65wkNTwmwx`) before the dependent operation is enabled. This
contract does not answer them.

| ID | Question | Blocks |
| --- | --- | --- |
| OQ-AUTH-1 | Signature algorithm and encoding for a Spark identity key and for a Hedera account key (ED25519 or ECDSA secp256k1), including message hashing. | `bindWallet`, `createWalletSession` |
| OQ-AUTH-2 | `WalletBearer` format (opaque or JWT), lifetime, refresh and revocation. The 0.2.0 wallet authorization routes (not copied to this repository) may already define it. | `createWalletSession`, every `WalletBearer` operation |
| OQ-AUTH-3 | Challenge lifetime and rate limits per account. | `createWalletChallenge` |
| OQ-AUTH-4 | Whether `installation_id` is client-generated or server-issued, and how many installations one wallet may have. | `createWalletSession` |
| OQ-AUTH-5 | `AccountBearer` for Path A operations on an LNbits wallet that the account owns (rule 5.3.6), because an LNbits wallet has no user-held key for a `WalletBearer`. | Path A wallet target on LNbits wallets |
| OQ-AUTH-6 | Hedera key proof policy: authoritative read of the account key structure, key lists, threshold keys and rotation, including a fresh read before `createWalletSession`. | `bindWallet` and `createWalletSession` for Hedera |
| OQ-BIND-1 | Custody classification rule for a Spark or Hedera wallet that `bindWallet` creates (expected `non_custodial`, not yet written in a governing document). | Path B enablement for bound wallets |
| OQ-BIND-2 | Public wallet close or delete operation and its effect on open registrations (`wallet_closed`). | Wallet lifecycle |
| OQ-BIND-3 | Wallet purpose (`INBOUND`/`OUTBOUND`) for Spark and Hedera wallets, which do both directions. | Path A on non-LNbits wallets |
| OQ-BIND-4 | Person customer creation before M8 step 5. | `bindWallet` for a Wallet person |
| OQ-BIND-5 | Hedera accounts that OPAGO sponsors (`hedera_accounts`, no user binding): who holds the key, and how the activation links to `bindWallet`. | HBAR binding |
| OQ-BIND-6 | Network in the wallet identity key: the governing key (`tenant_id`, `wallet_source`, `source_wallet_id`) has no network, so a Hedera account number or a Spark key on two networks collides. Needs a change of `payment-registration-data-model.md`. | `bindWallet` for Spark and Hedera |
| OQ-ID-1 | Durable public UUID for `wallets.id` and `transactions.id` (integer keys today): a new column, a mapping table, or integer IDs in the public API. Needs a change of `payment-registration-data-model.md`. | Every operation with `wallet_id` or `transaction_id` |
| OQ-ADDR-1 | Lightning address domain list per tenant, local-part rules and reserved names. | `createAddressBinding` |
| OQ-ADDR-3 | Address-level invalidation of open registrations: registration-address lineage, wallet-scope cancellation, or none. | `deactivateAddressBinding`, `createAddressBinding` |
| OQ-ADDR-2 | Spark address format and derivation check. | `createAddressBinding` for `spark_address` |
| OQ-PA-1 | Registration status after a `failed` outgoing command (contract 0.2.0 defines none). | `sendPayment` |
| OQ-PA-2 | Spark and Hedera Path A issuance and settlement binding. | Path A on non-LNbits wallets |
| OQ-PA-3 | Outage pre-check authority (what an `unavailable` pre-check may authorize), tracked in #545. | Shadow fail-open details |
| OQ-EV-1 | Whether a schema-invalid report from an authenticated wallet is also kept as a raw quarantined observation. | `reportWalletPayment` |
| OQ-EV-2 | Additional `verification_status` values (for example retracted or disputed) and how a retraction shows in `WalletPayment`. | `getWalletPayment` |
| OQ-EV-3 | Exact Spark SDK status set and its mapping to the normalized `status`. | Wallet app |
| OQ-EV-4 | Format and stability of the Spark `source_payment_id` and `identity_public_key` (the schema uses opaque ASCII and 32 or 33-byte hex). | `reportWalletPayment`, `createWalletChallenge` |
| OQ-EV-5 | Whether a transport retry of `reportWalletPayment` with the same `Idempotency-Key` and digest is a new raw report (`wallet-tme-shadow-mode.md`: every raw report is kept) or only returns the first receipt (proposed). | `reportWalletPayment` |
| OQ-AL-1 | Final alias kind names for payment hashes and provider payment IDs in `payment_identity_aliases`. | `WalletPayment.aliases` |
| OQ-HBAR-1 | HBAR binding rules: authorized amount and settlement reference. | Every HBAR write |
| OQ-HBAR-2 | HBAR validation and evidence rules (mirror node read, consensus timestamp, finality). | HBAR Path B |
| OQ-HBAR-3 | HBAR send: Path A command or Path B report only. | HBAR send |
| OQ-HBAR-4 | Hedera token transfers (HTS) and memo handling; this contract covers HBAR only. | HBAR scope |
| OQ-MIG-1 | v2 answer for a registration that v2 cannot represent (proposed: `404 registration_not_found`). | v2 and v3 parallel run |
| OQ-MIG-2 | Whether v3 POS clients keep `X-API-KEY` or move to `Authorization: Bearer`. | POS v3 switch |
| OQ-MIG-3 | v2 mapping of `rail_not_enabled` (proposed: `403 forbidden`). | v2 and v3 parallel run |
| OQ-MIG-5 | Internal OpenAPI copy for the v3 registration bodies and the internal contract selection header. | Implementation of v3 Path A |
| OQ-MIG-4 | v2 removal date and client minimum build. | v2 removal |
| OQ-TEN-1 | Tenant selection on the public facade (host name, token claim or both). | Every operation |

## 14. Out of scope

- Buy, Sell, Fiat on-ramp and off-ramp, and Swap.
- Provider evidence intake routes (internal).
- POS device registration and POS binding routes.
- Fee payment of the non-custodial POS (variant C).
- Travel Rule message exchange and identity photo flows.
- Any runtime code, table, column or Alembic revision.
