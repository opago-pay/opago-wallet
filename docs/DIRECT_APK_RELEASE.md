# Direct Android APK release

The `production-apk` EAS profile builds a standalone Android release APK with the same Mainnet configuration, Node version, version increment, and repository quality gate as the `production` store profile. It uses EAS-managed Android credentials. `preview` stays on test networks, and `production` stays available for a Google Play AAB.

This profile makes a distributable *artifact format*; it does not establish that a wallet is approved for public use. The current release acceptance and privacy work must be closed against the exact artifact before publishing a link. The APK can move real Bitcoin and HBAR.

## Current APK candidate (2 October 2026)

Expo build [`fdeb7449-6fc6-42ef-8c7e-41f1643842ee`](https://expo.dev/accounts/fabcot01/projects/wallet/builds/fdeb7449-6fc6-42ef-8c7e-41f1643842ee) finished successfully. The [APK download](https://expo.dev/artifacts/eas/COpg8-dnW2WHamQR-gTsqSr34EtMZt0bVk-g-bb3jJQ.apk) is also saved locally as `output/opago-wallet-1.0.0-3.apk`. Expo lists the artifact expiry as 16 October 2026; move the verified file to an approved durable host before relying on it as a public download.

- Package: `com.opago.wallet`; version `1.0.0` (`versionCode` 3); minimum Android SDK 24; target SDK 36.
- File size: 166,545,816 bytes; SHA-256: `C34C2C6ED4CE9DB44814D78A10A478F45F45966F2141BB63CA5E11C6C014ACE5`.
- APK signature v2 verifies; certificate SHA-256 matches the EAS release identity below. Android backup is disabled in the manifest.
- No MoonPay-named APK entries or MoonPay strings in the DEX files were found; Sentry is present in DEX. The build log confirms Sentry source-map upload for `com.opago.wallet@1.0.0+3`; event delivery on a device remains unverified. The production EAS environment has `EXPO_PUBLIC_SENTRY_TEST_CONTROLS=false`.
- The build passed its EAS quality gate. It was uploaded from an uncommitted pilot-branch workspace snapshot, so the Git HEAD displayed by Expo is not a complete source identifier. This PR starts from `main` and excludes the separate pilot account-creation feature; its source is therefore not identical to this APK. Build and verify a new APK from the merged release revision before publishing a public link. On 2 October 2026, this exact APK was installed on a connected Android device (serial ending 8685) and `MainActivity` opened without an immediate fatal log entry. Wallet, payment, backup and update acceptance on this artifact is still open.
- Before public distribution, complete device acceptance against this SHA-256, review the reported production dependency advisories, and approve/publish the wallet-specific privacy text including Sentry processing. A SharePoint folder and public link have not been created yet.

## Android signing identity

On 2 October 2026, EAS build credentials named `Opago Wallet Android Release` were created as the default for `com.opago.wallet`. The public certificate SHA-256 fingerprint is `E1:AF:01:1A:9B:8E:07:81:75:68:BC:8D:26:1C:A8:B8:A6:61:2C:FA:64:3E:95:4E:F4:D0:93:DB:37:CE:FD:B8`. Compare every APK against it before distribution. The private keystore remains in EAS and must be backed up privately by the account owner; no keystore or password belongs in this repository.

## Build from an approved revision

1. Finish the [native release acceptance](native-release-acceptance.md), [Lightning Mainnet acceptance](LIGHTNING_MAINNET_ACCEPTANCE.md), independent security/privacy/regulatory reviews, and the updated privacy documentation for retained Sentry diagnostics and the MoonPay-free release documented in the [submission package](app-store-submission-package.md). Freeze the source revision and record its commit and lockfile hash.
2. In the Expo account that owns this project, inspect `eas credentials -p android` for `com.opago.wallet`. Confirm that the selected EAS keystore is a durable release key, distinct from the local Android debug certificate. Back up the keystore and passwords through an approved private process; never commit them. If EAS already holds a key for this package, do not replace it without checking existing installations and the future update path.
3. Run `npm run phase5:verify`, then `eas config --platform android --profile production-apk` to inspect the resolved build settings. Build with `eas build --platform android --profile production-apk`. The EAS build hook runs the quality gate again. Do not use `npm run android:production-candidate` as the public APK; that local candidate has separate signing and package identity.
4. Download the resulting `.apk` from EAS. Check its package ID (`com.opago.wallet`), version code, SHA-256, and signing certificate with Android SDK tools such as `aapt dump badging` and `apksigner verify --print-certs`. Reject a debug certificate; compare the certificate fingerprint with the approved release key. Archive the build ID, commit, lockfile hash, version, APK hash, and signing fingerprint together.
5. Install this exact APK on clean, isolated Android test devices. Complete the wallet, network, payment-state, backup, privacy, and update cases from the release checklist. If code or configuration changes, build a new APK and repeat affected acceptance against its new hash.

## Host and update

After release approval, place the verified APK behind a public SharePoint “Anyone with the link” download link (view access, download allowed) and publish its version and SHA-256 alongside that link. The Android user downloads it in a browser and authorizes installation from that source. No Metro server or ADB connection is needed on the user's phone.

For each update, increment `versionCode` and sign with the same app-signing key. Test an in-place install on a device with a disposable wallet before replacing the download link. Keep old APKs and their hashes for rollback analysis; a lower-version APK cannot normally be installed over a newer version without removing the app, which would risk its device-bound wallet data. Direct downloads have no Google Play update delivery, so OPAGO must provide an update notice and distribution process.

Sources: [Expo EAS build profiles](https://docs.expo.dev/build/eas-json/), [Expo Android signing](https://docs.expo.dev/app-signing/app-credentials/), [Expo APK builds](https://docs.expo.dev/build-reference/apk/), [Android direct distribution](https://developer.android.com/distribute/marketing-tools/alternative-distribution).
