# Opago Android seed derivation

Local Expo module, automatically discovered from `modules/`. It uses Android's
`SecretKeyFactory` with PBKDF2-HMAC-SHA512, 2048 iterations, 64 output bytes and
the existing empty BIP39 passphrase. `AsyncFunction` runs on the module queue,
allowing the JavaScript/UI thread to keep painting during derivation.

The TypeScript entry point validates and canonicalizes the English BIP39 phrase
before invoking native code. The native boundary accepts only canonical ASCII
phrases with 12, 15, 18, 21 or 24 words. It checks its provider against a public
known-answer vector on first use and returns a generic error if anything fails.
There are no logs, storage writes, network calls or permission changes.

The app shares the derived seed between the existing Hedera derivation path and
Spark's documented `mnemonicOrSeed` byte-array input. Startup-owned buffers are
erased on completion, failure or session invalidation. An already-running SDK
operation owns its temporary copy until that operation settles; the existing
session resource disposes late wallet instances. This is best-effort buffer
erasure, not a guarantee about garbage-collected or SDK-managed copies.

iOS and web currently keep the asynchronous JavaScript BIP39 implementation,
but benefit from the single shared derivation. No native acceleration for those
platforms is claimed.

Native regression checks: `:opago-wallet-crypto:testReleaseUnitTest` from the
Android Gradle project. App checks: `npm test`, including synthetic seed/key
equivalence, signing, malformed results, retries and lock-during-startup cases.
