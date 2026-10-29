# Wallet HPKE signing root

The release pin in `lib/opago/hpke-roots.ts` was supplied by Michael on
19 October 2026, independently of the API response it authenticates.

- Root ID: `opago-hpke-root-1`
- Ed25519 raw public key (base64url): `Pus0lthp1p3EtJkixJuBanqaC5T1on5FALRUK_PDNaU`
- Source: Azure Key Vault `api-wallet-hpke-signing-roots`
- Version: `1612ed385ebc4185992b0096eedfb213`
- Audience: `https://api.opago.com`
- Maximum approved HPKE key `not_after`: `2027-04-30T00:00:00Z`

The HKA transport uses this bundled pin when no explicit root set is supplied
for the production audience. Explicit test or rotation root sets retain their
existing validation; an explicit empty set fails closed. AppConfig and the key
document cannot introduce trusted roots. The known production root is restricted
to its approved audience and maximum key expiry. Normal signature, revocation,
expiry and rollback checks still apply. A replacement root needs another reviewed
release; the public key does not authorize access to private key material.

`tests/fixtures/hpke-root-1-public-document.json` is the public signed response
retrieved from `GET /api/v2/auth/hpke-key` on 19 October 2026, with document
`issued_at=2026-10-19T17:51:13Z`. The regression verifies its real signature
offline and rejects changes, revoked roots/keys, unknown roots and expired keys.

This change does not enable F3 wallet sessions, POS payments or transaction sync.
`createNativeF3Integration()` still refuses integration until the wallet
authentication contract is delivered. Website broker login does not itself grant
AccountBearer/WalletBearer authority. No native login or Keycloak discovery is
restored, and no public contract version changes.
