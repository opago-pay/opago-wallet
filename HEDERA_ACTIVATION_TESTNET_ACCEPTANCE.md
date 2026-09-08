# First-deposit activation: Android Testnet acceptance

Status: APK built and installed; cold-start and pre-activation UI checks passed on 7 September 2026. First deposit, sender interoperability, funded-account recognition and recovery remain pending. No Mainnet funds are needed or authorized.

## Test build

Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-hedera-activation-test.ps1` from the repository root. The generated Android project and installed SDK/JDK are prerequisites. This builds the current working tree, including uncommitted changes; it does not claim a clean release commit.

Output: `.codex-local-evidence/activation-test/opago-activation-testnet.apk` and `build.json` (base commit, working-tree status, APK SHA-256).

The package ID is `com.opago.wallet.activationtest`, separate from `com.opago.wallet`. It uses local test signing and embeds its JavaScript, so no Metro is required. It is not a production release. Mainnet is disabled, Hedera is pinned to Testnet, and dotenv loading is disabled. Do not clear or uninstall the existing wallet to run this test.

## Sender candidate and limits of evidence

HashPack documents HBAR transfers to public keys and automatic account creation in [Using EVM addresses with HashPack](https://www.hashpack.app/post/using-evm-addresses-with-hashpack), published 12 May 2023, checked 7 September 2026. This establishes a candidate, not verified compatibility with our exact Ed25519 alias string or QR in the installed version.

Record the sender name, version, platform and explicit Testnet account before starting. A funded Testnet sender is required. Do not enter private keys or recovery phrases into chat or test evidence. If HashPack rejects the alias format, stop and record the validation error; do not substitute an EVM address or switch to Mainnet.

## Procedure

1. Install the separate test package. Record the APK hash. Open it and create a fresh test wallet. Save its recovery phrase privately using the app's protected backup flow.
2. Open Receive and select Hedera. Require TESTNET, an activation alias beginning `0.0.`, and the missing-account explanation. No numeric account ID should be invented. Check that Send cannot sign without an account.
3. In the sender's Testnet account, paste the complete activation alias. Confirm it is accepted without truncation or reinterpretation. Send **1 test HBAR**, with creation/transfer fees paid by the sender. Record only the public transaction ID. QR scanning is a separate compatibility check; copying the address does not prove scanning works.
4. Keep Receive foreground. Allow Mirror Node indexing time. Require automatic replacement of activation details with a numeric account ID and a matching on-chain Ed25519 public key. Verify the deposited balance. Do not repeat a transfer just because the account is not visible yet.
5. Force-stop and reopen the test app without Metro. Require the same account and balance. Send another **0.1 test HBAR** to the same alias and require the same numeric account ID, with no second account created.
6. Temporarily disable networking. Require an unavailable/retry state rather than a false success or a claim that a new account must be created. Re-enable networking and require recovery. Background the app and check it resumes lookup on return.
7. Only after privately verifying the backup, use the test app's wallet-reset/recovery flow. Restore the test phrase on a clean test installation or separate device. Require exactly the same public key and numeric account ID. Do not reset the existing `com.opago.wallet` app.

## Evidence checklist

| Check | Result |
| --- | --- |
| APK hash / package ID / Testnet configuration | Passed; see local build.json and observations below |
| Sender name / version / explicit Testnet | Pending |
| Exact alias accepted by sender | Pending |
| QR scanning supported | Pending; separate from clipboard acceptance |
| First-deposit transaction ID / receipt | Pending |
| Account ID / exact Ed25519 key match | Pending |
| Automatic recognition / balance | Pending |
| Cold start without Metro | Passed twice; same pre-activation alias after force-stop |
| Repeat deposit uses the same account | Pending |
| Offline / background / delayed indexing | Pending |
| Recovery to the same account | Pending |

Automated SDK serialization and mocked Mirror tests are already available in `tests/hedera.test.cjs`; they do not replace these live checks.

## Device observations: 7 September 2026

- APK SHA-256: `5b9b4bd03bfe6ed1745fafe52649637eff1e793104148642a7892ce3fd71c21f`.
- Android 14, arm64-v8a, ADB serial `0310841080358690` (device reports model `PG3NBG7YA`).
- APK signature verified with Android apksigner; local Android Debug certificate. Package ID verified using aapt. Embedded Hermes bundle contains the activation UI.
- Separate package installed successfully alongside `com.opago.wallet`; existing wallet was not reset or replaced. Launcher label is currently also `opago-wallet`; use the explicit test package when opening it.
- First cold start returned `Status: ok`; local test-wallet creation reached the portfolio. No recovery phrase was viewed or exported.
- Hedera Receive showed `HEDERA TESTNET`, `ACCOUNT NOT ACTIVATED`, a visible QR and the SDK key alias with copy action.
- After force-stop/relaunch, the same alias was observed. The second `am start -W` timed out after approximately 10 seconds, but the app subsequently reached the portfolio and activation screen; startup latency needs further observation.
- No first deposit or Mainnet transaction was performed. No assertion of sender compatibility or funded-account recovery is made.
- Screenshot and public alias comparison are saved under `.codex-local-evidence/activation-test/`. The test wallet's private material remains on-device.
