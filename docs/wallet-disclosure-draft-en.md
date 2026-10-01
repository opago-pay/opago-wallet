# OPAGO Wallet – How It Works and Key Risks (Draft)

**Working draft as of 1 October 2026. Not published or legally approved.** This document explains the mobile consumer wallet and the main consequences of using it. It does not replace the [Wallet Privacy Policy](wallet-privacy-policy-draft-en.md) or appropriate wallet terms of use. It describes the intended release without Sentry and MoonPay; the actual signed build must be checked before publication.

## 1. Who provides the wallet

The OPAGO Wallet is provided by OPAGO GmbH, Moosstraße 4, 83404 Ainring, Germany. Wallet support is available at **support@opago.com**. The wallet is a service for users to manage and use Bitcoin via Spark/Lightning and, where available in the app, HBAR on the Hedera network. The existing OPAGO Pay terms concern the merchant solution. Separate terms of use for the consumer wallet still need to be finalised before its public release.

## 2. What the app provides

The app lets you create and restore a wallet, view available balances and activity, and send and receive funds through supported payment methods. Bitcoin payments may use Lightning/Spark or the Bitcoin network. The available Bitcoin balance shown in the app is managed through Spark; it is not simply a collection of ordinary Bitcoin on-chain outputs at a single address. A deposit from the Bitcoin network may require a separate, potentially fee-bearing step to make it available in your Spark balance.

HBAR functions require a usable Hedera account. HBAR payments sent from the app are executed through the configured OPAGO Checkout smart contract; this may incur higher network fees than a direct Hedera transfer. The Buy section currently only says “Coming soon”. This draft does not promise coin purchases or exchanges as an available feature.

## 3. Control of keys and recovery

Recovery words and the wallet keys derived from them are processed on your device. You must keep the words safe yourself and never share them with support or anyone else. OPAGO cannot recover lost words for you or authorise a payment solely because you contacted support. If you lose your device, your recovery words or access to them, you may permanently lose access to your funds.

Spark functions also require Spark operators and compatible software. Knowing your recovery words alone does not guarantee that every future app version or another wallet provider can immediately restore all Spark functions and past activity. Check the app's backup guidance and keep your backup current.

## 4. Confirming payments, status and finality

Before confirming a payment, check the network, recipient, amount and displayed fee. Once confirmed on the relevant network, a payment to the wrong destination generally cannot be reversed. Processing time and success depend on the network, its operators and the payment destination.

After a connection is lost, a submitted payment may initially have an unclear status. **Do not simply send the same amount again** before checking its status: another payment may result in a duplicate payment. The app attempts to reconcile pending activity with the network; immediate resolution, or resolution in every case, is not guaranteed. If a payment remains unclear, contact support with the transaction identifier or the details shown in the app. Never send recovery words or private keys.

## 5. Fees and euro values

OPAGO does not charge its own fee for payments made in the wallet app. Lightning/Spark, Bitcoin on-chain and Hedera payments may still incur fees charged by the network, its operators or other services. Before a payment, the app shows the amount and, where available, a fee estimate or maximum. The actual fee may depend on the payment method and network conditions; quotes may expire and require another review. Making a Bitcoin on-chain deposit available in your Spark balance may also incur a fee.

Balances and historical values shown in euros are approximate, non-binding estimates based on external exchange rate data. They are not a promise that coins can be sold or exchanged for that amount. Exchange rates and the market value of Bitcoin and HBAR can fluctuate significantly.

## 6. External services and availability

Spark operators and their service providers are needed for Bitcoin/Lightning functions. HBAR functions use the Hedera network and mirror nodes. For certain payment destinations, the app connects to an endpoint chosen by the user, for example for a Lightning Address or LNURL request. These services may be unavailable, change their fees or restrict features. OPAGO cannot guarantee the availability of third-party networks or a specific confirmation time.

Public Bitcoin on-chain and Hedera transactions may remain visible to others permanently. Deleting a wallet locally does not remove network transactions that have already taken place. The [Wallet Privacy Policy](wallet-privacy-policy-draft-en.md) explains the information processed locally and by external services.

## 7. Security and support

Protect your device, your wallet PIN or device lock, and your recovery words. Check payment requests, including those from a QR code or the clipboard. Deleting a wallet locally removes its associated app data from the device; without a saved copy of your recovery words, you cannot restore it afterward.

You can reach wallet support at **support@opago.com**. OPAGO can answer general questions about the app and investigate technical activity, but it cannot recreate lost private keys or reverse a completed network payment on its own.

## Internal approval items – remove before publication

1. **Legal form and scope:** Decide whether this is a separate risk notice or part of the wallet terms of use. OPAGO states that the [existing OPAGO Pay terms](https://www.opago.com/terms/) apply to its merchant solution only. Because the published text also refers broadly to apps and payers, make that separation explicit and approve separate consumer wallet terms.
2. **Fees:** OPAGO states that it charges no fee of its own for payments in the wallet app. Verify this against every active payment route and the final build; check third-party charges and statements about fee maxima. Do not import any fee amount from the Wallet of Satoshi example.
3. **Third parties:** Verify the Spark/Lightspark operators actually used, the applicable public terms, exit and recovery procedures, and dependencies. OPAGO reports no direct contracts with the external network and information providers. The public [Spark terms](https://www.spark.money/terms) and [Spark privacy policy](https://www.spark.money/privacy-policy) do not establish every SDK configuration or the app's exact data flows.
4. **Legal review:** Review consumer information, any withdrawal rights, regulatory classification, target countries, minimum age and mandatory liability rules for the specific EU wallet offering. Do not adopt another provider's liability exclusions or Australian clauses.
5. **Release check:** Remove Sentry and MoonPay from the signed release as decided; check the available Bitcoin/HBAR functions, account activation, fees, backup and payment status behaviour in the final build. Then approve and publish the German and English versions.

Comparison source for distinguishing self-custody, third parties and network risks: [Wallet of Satoshi Disclosure](https://www.walletofsatoshi.com/disclosure). Its custody model, stablecoins, fees and Australian legal rules are not statements about OPAGO.
