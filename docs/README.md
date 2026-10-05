# Documentation

Start with the repository [README](../README.md), [SECURITY](../SECURITY.md) for security boundaries, and [release notes](../RELEASE_NOTES.md) for recorded changes.

For the current production status, installation link, signed builds and Mainnet evidence, start with [Production release status](PRODUCTION_RELEASE_STATUS.md). The implemented wallet features are production-ready; older grant/debug candidates are historical artifacts.

Commands and source paths in these documents are relative to the repository root unless stated otherwise. Dated reports and milestone records describe the state tested at that time; they do not establish current release readiness.

## Product and implementation

- [Feature matrix](FEATURE_MATRIX.md)
- [Mainnet scope](MAINNET_SCOPE.md) and [threat model](MAINNET_THREAT_MODEL.md)
- [Hedera activation service requirements](hedera-activation-service-requirements.md) and [implemented activation API](HEDERA_ACTIVATION_API_V1_APP.md) — Mainnet account activation is integrated; the September first-deposit model is historical.
- [Wallet data flows](wallet-data-flows.md)
- [Wallet privacy policy (German)](wallet-datenschutzerklaerung.md) and [English](wallet-privacy-policy-en.md)
- [Lightning send performance](LIGHTNING_SEND_PERFORMANCE.md)
- [Spark pending-send integration](SPARK_PENDING_SEND_INTEGRATION.md) and [support investigation](SPARK_SUPPORT_REQUEST.md)
- [Local eID reference testing](TESTING_EIDAS.md)

## Operations and release checks

- [Current device testing status](DEVICE_TESTING_STATUS.md) — implemented features are already being tested by more than ten people through TestFlight and Android distribution.

- [Direct Android APK release](DIRECT_APK_RELEASE.md)
- [Optional Sentry crash diagnostics](sentry-diagnostics.md)
- [Hedera Mainnet deployment runbook](HEDERA_MAINNET_DEPLOYMENT_RUNBOOK.md)
- [Lightning operations runbook](LIGHTNING_OPERATIONS_RUNBOOK.md)
- [Public release readiness](PUBLIC_RELEASE_READINESS.md)
- [Native release acceptance](native-release-acceptance.md)
- [Lightning Mainnet acceptance](LIGHTNING_MAINNET_ACCEPTANCE.md)
- [Bitcoin payment acceptance](BITCOIN_PAYMENT_ACCEPTANCE.md)
- [App Store submission package](app-store-submission-package.md)

## Historical milestone and acceptance records

- [Thrive milestone 2 submission](THRIVE_MILESTONE2_MAINNET.md)
- [Hedera Mainnet canary](HEDERA_MAINNET_CANARY_ACCEPTANCE.md)
- [Hedera Mainnet account lifecycle](HEDERA_MAINNET_ACCOUNT_LIFECYCLE.md)
- [Hedera activation testnet acceptance](HEDERA_ACTIVATION_TESTNET_ACCEPTANCE.md)
- [Mainnet Android baseline](MAINNET_ANDROID_BASELINE_ACCEPTANCE.md)
- [Phase 4 testnet acceptance](PHASE4_ACCEPTANCE.md)
- [Phase 5 testnet milestone](PHASE5_MILESTONE.md)
- [Acceptance report, 2026-09-21](TEST_ACCEPTANCE_2026-09-21.md)
- [Acceptance report, 2026-09-22](TEST_ACCEPTANCE_2026-09-22.md)
- [Usability review, 2026-09-24](design-usability-recheck-2026-09-24.md)

Additional dated investigations and protocol specifications are retained alongside these documents.
