# Wallet recipient approval: signature-only role

The current binding role split is: Wallet reviews/signs, POS confirms and saves
the rotated `pos_api_key`. Source: compliance `docs/pos-binding-runtime.md` and
`docs/pos-login-gateway-handoff.md` at `a2afd48b4b31994d13febaac674c6e3f449227a2`.
No new backend contract is required by this change.

`PosRecipientApproval` implements local review, explicit consent, signing and
signature return. A return acknowledgement is **not** binding success. Its last
successful state is `signature_returned`; there is no `linked` state, POS key,
wallet bearer, `/bindings` call, list, status, operator-confirm or unlink method.
Unknown return retries use the same signature and channel reference without a
second signing. Expired requests require a new review/proof, not silent refresh.
Native lock/background/account changes must clear the controller and invalidate
the channel. A late sign/return callback cannot recreate cleared approval state.

## Integration boundary, not an invented wire protocol

The injected `PosRecipientChannel` is **not authenticated merely by implementing
the interface**. No production channel factory or runtime installation is shipped.
Its eventual adapter must establish all of the following before exposing a request:

- Authenticated known origin and initiating POS/account authority, not an arbitrary
  QR URL, untrusted callback or caller-supplied `verified` flag.
- The verified recipient account, wallet identity, intended installation and the
  same backend WalletSession context across challenge/proof/confirmation.
- Frozen POS ID, binding intent, version, expiry and challenge nonce/message.
- Authenticated return to that exact initiating channel, replay correlation and
  lifecycle invalidation. The opaque `localSessionRef` is a local handle, **not**
  an invented public session-family field or credential.

The 0.2.0 `pos_bind` message binds network, wallet public key and the hash of
POS/intent/version action parameters. **It does not sign installation or account
IDs.** Comparing those metadata fields locally cannot authenticate them; only the
reviewed channel/session integration can. Do not transfer a WalletBearer by QR or
reuse a merchant/F3 token as a v3 WalletSession. That channel is our remaining
API/app architecture work, not another missing compliance endpoint.

The existing old F3 `PosLinking` flow called `/bindings` from the Wallet and
required wallet-readable list/status/review endpoints. It is still reachable only
as an explicitly historical dev fixture; both its constructor and live installer
now reject a backend source. Native bootstrap was already closed, and remains so.
Unrelated account and local self-custodial operations are unchanged.

The runtime POS ID compatibility rule is `^[A-Za-z0-9_-]{1,64}$`, centralized in
`pos-runtime-profile.ts` for reference and signing validation. Immutable contract
snapshots remain unchanged. The new controller uses the existing 0.2.0
`opago-wallet-auth` signer, not the distinct v3 session-message formatter.

`tests/pos-recipient-approval.test.cjs` is the current local role fixture. It checks
real synthetic Schnorr signatures, exact action/context changes, refusal, expiry,
same-signature recovery and interrupted signing/return. The historical F4 fixture
does not constitute production acceptance. Full validation uses the unchanged
`npm run phase5:verify`; no device, database, live proof or deployment is implied.
