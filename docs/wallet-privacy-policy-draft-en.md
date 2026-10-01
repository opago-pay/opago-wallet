# Privacy Policy for the OPAGO Wallet – Draft

**Working draft as of 1 October 2026. Not published or legally approved.** This text describes the planned mobile consumer wallet **after Sentry and MoonPay have been removed from the final build**. It is intended for publication at `https://www.opago.com/privacy/app` and must be aligned with the existing [website privacy policy](https://www.opago.com/privacy/). The internal approval items below must be removed from the public version.

## 1. Controller and contact

OPAGO GmbH, Moosstraße 4, 83404 Ainring, Germany, is the controller for processing activities whose purposes and means OPAGO determines. Send privacy questions and requests to exercise your rights to **contact@opago.com**. Operators of independent payment networks or recipients of payments may be separate controllers for their own processing.

OPAGO has appointed a data protection officer. **Their contact details will be added before publication.**

## 2. Information processed on your device

When you create or restore a wallet, the app processes your recovery words and the keys derived from them. The recovery words are stored in protected storage on your device; keys are used for wallet functions and to sign payments. The app also stores public wallet and account identifiers, settings, cached balances, payment requests for receiving funds, payment statuses and a local activity history. Not all local payment data is stored in the protected key store.

Based on the app code reviewed so far, the app does not automatically upload recovery words to OPAGO. Never share these words with support or anyone else. Your device settings and operating system backup features may affect which local data is included in backups; the exact backup behaviour still needs to be confirmed for the published iOS build.

According to OPAGO, it does not store wallet identifiers, balances or payment data from the app on its own servers. This is separate from data held by external network services, public blockchain data and information you choose to send to support.

## 3. Payments and network requests

For Bitcoin and Lightning functions, the app connects to Spark services and, depending on the payment, the Bitcoin or Lightning network. Public wallet identifiers, payment requests, amounts, transaction identifiers and status data may be transmitted. Data about a Bitcoin on-chain payment may be visible on the public network and remain accessible permanently.

For HBAR functions, the app queries Hedera nodes and mirror nodes for account, balance and transaction information. HBAR payments sent from the app are submitted through the configured OPAGO Checkout smart contract. In particular, account and transaction identifiers, amounts and the payment data needed to execute the contract are processed. Hedera transactions and contract calls are generally publicly traceable and cannot be removed from the network when you delete your wallet locally.

If you use a Lightning Address, LNURL or another supported payment request, the app connects to the endpoint you have chosen. That endpoint may receive the request, the amount when an invoice is retrieved and technical connection data. The endpoint is not necessarily operated by OPAGO. Network service providers may also see your IP address when you connect and process it under their own rules.

For Bitcoin transaction information, the app may query `mempool.space` using a transaction identifier. If you open a blockchain explorer in your browser, the privacy information of that website's operator applies.

## 4. Euro values and historical exchange rates

The app requests public exchange rates from CoinGecko. If a rate is unavailable there, it uses Kraken as a fallback. For historical euro values of transactions, it may retrieve exchange rate data from Binance Vision and the confirmation time of a Bitcoin transaction from `mempool.space`. Based on the app code currently visible, exchange rate requests do not contain a wallet identifier or balance amount. However, transaction identifiers requested from `mempool.space` and your IP address, which is technically exposed when connecting, may be visible to the respective services. Euro values are estimates.

## 5. Camera, clipboard and external links

With your permission, the app uses the camera to read payment QR codes on your device. The app code currently visible does not send camera images to OPAGO. The recognised payment information may then be used for a network request or a payment you confirm. Payment information pasted from the clipboard is processed in the same way.

When you open contact, help or legal links, you leave the wallet and access the respective website. Based on the app code currently visible, the wallet does not append a wallet identifier to these links. Information you enter there and ordinary browser connection data are also subject to the website operator's notices.

## 6. Support requests

If you email **support@opago.com**, OPAGO processes your email address, the content of your message and the information needed to reply. Do not send recovery words or private keys. **The email provider, storage location, any processing outside the EU and the applicable deletion period still need to be confirmed before publication.**

## 7. Retention, deletion and public networks

If you delete your wallet in the app, its associated local keys and app data are removed. This does not delete previously published Bitcoin or Hedera transactions or information independently stored by other network operators or payment endpoints. You will need your recovery words if you want to restore the wallet later.

**The retention period or criteria for support emails still need to be confirmed before publication.** Data held by external network and information services may be subject to different retention periods or criteria depending on the provider and purpose. **These will be added after the available provider information has been reviewed.**

## 8. Your rights

Where the General Data Protection Regulation applies, you may, subject to the legal requirements, request access, rectification, erasure, restriction of processing and data portability, and object to processing. You may withdraw any consent you have given with effect for the future. You may lodge a complaint with a competent data protection supervisory authority. Send requests to **contact@opago.com**. How a request is handled depends on whether OPAGO processes the data itself or another organisation is the controller. A right to erasure cannot technically or legally reverse entries on a public blockchain.

## Internal approval items – remove before publication

1. **Legal basis for each data flow:** Decide and state the legal basis for necessary wallet network functions, exchange rate and status requests, and support emails. No legal basis is asserted here without a decision by the operator.
2. **Verify the statement about OPAGO servers:** According to OPAGO, no wallet or payment data is stored on OPAGO servers. Check actual server and reverse proxy logs; support email is the known exception for information voluntarily sent to OPAGO.
3. **Recipients and roles:** Determine the actual recipients and roles of Spark/Lightspark, Hedera network services, exchange rate and blockchain query services, and the support email provider. OPAGO reports no direct contracts with the external network and information providers. Review the applicable public terms and privacy notices alongside observed app traffic; do not assume that all recipients are processors. The public [Spark privacy policy](https://www.spark.money/privacy-policy) mentions wallet identifiers, transaction data and possible device/IP data and international processing. It describes Spark services generally and **does not establish** which of these data the OPAGO app transmits or which operators have access.
4. **Retention periods or criteria:** Confirm the support email provider, the actual deletion rule for support emails, and available retention information for key external services. Do not carry over the earlier, unverified statement about a two-year HubSpot ticket period.
5. **Processing outside the EU and safeguards:** Review the actual providers, their locations and any applicable transfer mechanism. Do not infer safeguards from an agreement that OPAGO does not have.
6. **Check the final signed iOS build:** Sentry and MoonPay, including their native SDKs, configuration, deep links and other remaining integrations, must be removed before approval. Check the Spark SDK, operating system backups and remaining data flows. The current purchase screen says “Coming soon”; confirm its final state.
7. Align this text with the existing [website privacy policy](https://www.opago.com/privacy/) and approve German and English versions for the initial EU release. OPAGO has selected `contact@opago.com` for wallet privacy requests and `support@opago.com` for wallet support. Confirm that both mailboxes are monitored. OPAGO has appointed a data protection officer, but their contact details are still missing. Then publish the new public URL `https://www.opago.com/privacy/app` and change the in-app link to it. That URL has not yet been verified as a published wallet page.
8. OPAGO states that the existing [OPAGO Pay terms](https://www.opago.com/terms/) concern its merchant solution, not the consumer wallet. Their published wording also refers broadly to payers and apps. Clarify their scope publicly and approve separate wallet terms so that users are not given conflicting information.

Comparison sources: The [Wallet of Satoshi privacy policy](https://www.walletofsatoshi.com/privacy) and [disclosure](https://www.walletofsatoshi.com/disclosure) distinguish self-custody, service provider processing and risks. However, they also concern custodial wallets, stablecoins, advertising/analytics data and Australian legal rules. Those parts are **not** facts about OPAGO and have not been incorporated into the public wallet text.

Working references: [data flow inventory](wallet-data-flows.md), [Sentry review](sentry-diagnostics.md), [GDPR Article 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).
