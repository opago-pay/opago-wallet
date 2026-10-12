# OPAGO POS payer handoff — 12 October 2026

Incomplete: PR #46 stays Draft. No POS payment activation or minimum versionCode.

This replaces prior assumptions about WalletBearer, POST/HPKE payer submission and provisioned payer lists. Production scanner, LNURL, cached endpoint, OCP and payment paths still stop OPAGO POS before P01, which can register a sale despite GET. Supported external payments remain available. No production P01/P02 request or payment was made.

## Authoritative inputs

Michael confirmed P01/P02, no Wallet bearer, signed payerdata, signatureNonce = attempt = callback path token, live UMA / backend Trust/TRISA. No payer list in Secrets/Key Vault or invented Wallet/VASP signatures.

Inspected Compliance main: 58acba32fed2a2d4e70758aec451f0625c1ac59d, docs/pos-payer-data.md, docs/pos-handoff-contracts.md, pos_protocol.py and routers/pos_protocol.py. The interim provisioned verifier and historical status table are NOT implementation bases. API baseline c13341a1c5d20bc0aaf3164c50493771c7058227; POS baseline 2a5350a9c7ea5b425d78d71770a2499d78daf081 (read only).

Airtable recrrT5rjfwjIagIe places the live verifier after Monday MVP; custodial licensing is closed and non-custodial invoice issuance inactive.

## Prepared code and exact limits

lib/opago/pos-contract.ts parses P01 and prepares P02 GET without dispatch. It checks same-origin public callback, unique 32-lowercase-hex attempt/path token, fixed positive whole-satoshi msat amount, exact metadata and mandatory profile fields. It retains the original signed JSON string, checks the nonce and repeats identical decoded payerdata. No Authorization or replacement signature is added. It enforces 8192-character payerdata and 8000-byte request-target limits. Fixed errors contain no query; JSON serialization of the attempt exposes no payerdata. Closing an attempt blocks further requests/invoice acceptance.

Invoice inspection reuses signature/network/payment-secret/expiry validation and checks amount and SHA-256(exact metadata + exact payerdata). Changed invoices on the same in-memory attempt are refused. Results explicitly contain paymentEnabled:false and recipientBindingVerified:false. Current P01 advertises neither the merchant node nor a reliable client offer deadline; neither is invented. This code does not verify payer trust/account association, authorize payment, provide durable replay protection or execute success actions. No PIN/success is fabricated.

The API facade must allow omitted payerdata and leave custody-dependent authorization to Compliance. Omission is not payer authentication. Lowercase payerdata is canonical, payerData only a legacy alias; both together are rejected. Exact retries retain bytes.

## Required deliveries and remaining Wallet work

- Live signed payerdata source, signer/trust/freshness/revocation rules and logged-in-account association; no bindings-file replacement.
- Backend-authoritative eligibility for non-KYC: logged-in account, non-custodial payer and merchant wallets, active TME shadow. Local login, role or caller flags are insufficient. Custodial merchants require verified payer data.
- Active invoice path and live verifier; do not enable identityPayments/UMA globally.
- Merchant-node/offer-deadline contract and recovery/settlement lookup for uncertain callback/payment results.
- POS producer alignment: current app emits local_payment_id/created_at; Compliance requires UUIDv7 payment_id and authenticated sale terms.
- Operator proof of TLS on every hop, no P01/P02 query logging/telemetry, no-store and 8000-byte request targets.

After delivery, connect a transport that excludes query telemetry, show authoritative login/denial/unavailable states, bind the recipient invoice, require explicit confirmation and use the durable payment journal. Recheck session generation, binding, expiry and policy; reconcile unknown outcomes before another attempt. Until then the existing service-unavailable state is accurate; a login loop would falsely promise resolution.

Device HPKE, payer proof and POS pairing are separate. Account/Wallet listing with wallets[].custodial and full pairing intent/QR, consent, status/list, expiry/cancel/resume, operator auth and PosLinkSource contracts remain incomplete. Unknown custody stays unknown. No placeholder pairing PR is added.

## Verification and dependencies

Local parser/invoice tests use synthetic, unpayable regtest invoices. Production-path guard tests prove no P01/P02 request occurs and supported external Lightning still works. Shared HTTP evidence is recorded on the API PR. Fixtures do not prove backend runtime acceptance. No device test, payment, EAS release build, deployment or activation is claimed.

#45 and #46 share mvp-branch baseline 2ce0b27bbe8e0c8debd9ddcb66af42a2930a89da and have no source dependency. Neither completes the other. CI and combination evidence are recorded separately; rerun resulting combinations before merge.
