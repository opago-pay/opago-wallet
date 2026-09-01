# Android Mainnet baseline acceptance

- **Executed:** 31 August 2026
- **Device:** UMIDIGI Z92, Android 14
- **Network under test:** Hedera testnet
- **Result:** passed

This acceptance proves that the Mainnet-preparation changes preserve the established Android wallet behavior and that network isolation fails closed on a physical device. It does not authorize Mainnet funds, deploy a Mainnet contract, or complete the Mainnet account-onboarding milestone.

## Tested build and runtime

- The app was started as an Expo development client from the current working tree through Metro on port `8083`.
- The installed Android package was `com.opago.wallet`.
- The app reached the portfolio without a render error or JavaScript exception.
- A forced stop followed by a cold launch recovered without user intervention.
- After the cold launch, the wallet rediscovered and validated Hedera testnet account `0.0.10030291` and loaded its balance.
- Android log inspection after the acceptance found no fatal exception, unresolved module, bundle-load failure, or React Native runtime error.

The cold-start check validates the public account-binding cache and Mirror Node revalidation path on Android. The recovery phrase and private key were not displayed, logged, exported, or added to this evidence.

## Network-isolation negative test

The app received the deliberately wrong-network request:

```text
opagowallet://hedera-checkout?network=mainnet
```

After **Review payment**, the app rejected it with:

```text
Only Hedera testnet checkout requests are accepted.
```

No review state containing a payable Mainnet request was created, nothing was signed, and no transaction was submitted. This physically verifies the Milestone 1 cross-network rejection path.

## Testnet transfer evidence

The wallet reviewed and submitted the following deliberately small testnet transfer:

| Field | Value |
| --- | --- |
| Sender | `0.0.10030291` |
| Recipient | `0.0.9959245` |
| Amount | `0.0001 HBAR` |
| Transaction ID | `0.0.10030291@1788179440.343165660` |
| Consensus result | `SUCCESS` / `CRYPTO TRANSFER` |
| HashScan | [Open testnet transaction](https://hashscan.io/testnet/transaction/0.0.10030291%401788179440.343165660) |

The wallet balance changed from `100.46219726 HBAR` to `100.46075374 HBAR`. The difference is the exact transfer plus the Hedera network fee. The portfolio history then showed `Sent 0.0001 HBAR · success · HashScan` with the device-local timestamp `31.8.2026, 14:30:47`.

The success screen opened the network-bound HashScan URL in Chrome without the previous Expo Linking bundle error. HashScan independently displayed the transaction as `SUCCESS`, identified it as `CRYPTO TRANSFER`, and showed both testnet accounts.

## Acceptance conclusion

The following physical-device gates passed:

- Android launch and cold restart;
- deterministic wallet/account reattachment;
- Hedera testnet balance refresh;
- wrong-network checkout rejection before signing;
- explicit amount and recipient review;
- direct testnet HBAR submission and consensus confirmation;
- network-bound HashScan navigation;
- post-payment balance and history reconciliation;
- absence of fatal runtime errors during the test.

Mainnet remains blocked until the human decisions, account-onboarding implementation, independent review, verified Mainnet deployment, signed release, and real-user pilot gates in the README are complete.
