# v3 wallet session primitives (not live activation)

These additive primitives implement the existing `tx-foundation-v3` session
message and issuance response, not the older F3 wallet session lifecycle.
Reference: `opago-compliance` commit `a2afd48b4b31994d13febaac674c6e3f449227a2`,
`wallet_session_proofs.py`, `routers/internal/wallet_sessions.py`, and
`docs/wallet-session-store.md`.

## Implemented

- `lib/wallet-session-proof.ts`: exact canonical message validation and BIP340
  signing through the existing Spark identity-key primitive. The expected
  tenant, verified account subject, Spark identity and installation are fixed
  before consent. The backend message uses `network:-`; this is not silently
  rewritten as mainnet/regtest. The public wallet UUID selects the route and is
  checked in the response; the backend message does not itself contain that UUID.
- `lib/opago/v3-wallet-session.ts`: challenge, explicit-consent issuance, exact
  durable recovery, local expiry inspection and local credential clearing.
  A retry uses the same signature and idempotency key, including after the
  challenge expires; the backend decides whether its original access window
  still permits that retry. It can rotate the access token without extending
  the original deadline. The client does not interpret retries as refresh.
- Only `POST /api/v3/wallets/challenges` and
  `POST /api/v3/wallets/{wallet_id}/sessions` are addressed. There is no invented
  refresh, logout or status route. Reading local state is not server validation;
  clearing local state is not server revocation.

## Deliberately not activated

No bootstrap, runtime, build flag, trust root, route allowlist, native signing
entry point or transport configuration changes. `V3SessionPort` is an injected
boundary: its eventual adapter must authenticate the current approved account,
bind it to the supplied context, retain the approved secure transport and reject
unauthenticated replies. It must never treat F3, merchant or POS device tokens as
v3 AccountBearer credentials. The private store must be device protected. Use one
client owner per context/store key; do not instantiate concurrent writers.

The context must come from authenticated account/wallet data, not a QR. `issue`
requires user/device consent each time a fresh proof is signed. `recover` only
replays a previously consented, privately stored request; it creates no signature.
Account change, wallet lock or logout must call `clearLocal` and invalidate the
native runtime guard. A pending uncertain issuance blocks a new challenge until
recovered or explicitly cleared; there is no background renewal.

Cross-device POS pairing still needs our authenticated signature-request/return
transport integration. This change does not transfer a bearer through a QR,
give the Wallet the POS-confirm role, invent a public session-family identifier,
or claim an end-to-end APK pairing flow. Existing gates remain closed.

## Verification

`tests/v3-wallet-session.test.cjs` exercises actual Schnorr verification with a
synthetic key, all canonical bindings, rejection of old messages, consent and
expiry, exact recovery after restart, wrong response fields, and clearing during
a stalled request. Run `npm run phase5:verify` with the repository's Node version
for the unchanged full gate; no PostgreSQL or live credential generation needed.
