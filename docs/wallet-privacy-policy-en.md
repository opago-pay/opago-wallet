# Privacy Policy for the OPAGO Wallet

**Last updated: 4 October 2026.** This policy describes processing in the OPAGO Wallet mobile app. OPAGO's [website privacy policy](https://www.opago.com/privacy/) applies separately to its websites.

## 1. Controller and contact

OPAGO GmbH, Moosstraße 4, 83404 Ainring, Germany, is the controller for processing activities whose purposes and means OPAGO determines. Send privacy questions and requests to exercise your rights to **contact@opago.com**. Operators of independent payment networks or recipients of payments may be separate controllers for their own processing.

## 2. Information processed on your device

When you create or restore a wallet, the app processes your recovery words and the keys derived from them. The recovery words are stored in protected storage on your device; keys are used for wallet functions and to sign payments. The app also stores public wallet and account identifiers, settings, cached balances, payment requests for receiving funds, payment statuses and a local activity history. Not all local payment data is stored in the protected key store.

The app does not automatically upload recovery words to OPAGO. Never share these words with support or anyone else. Your device settings and operating system backup features may affect which local data is included in backups.

Wallet connections depend on the features available in your app version. In addition to external network services, these may include OPAGO services: if your version offers Hedera account activation through OPAGO and you start it or check its status, the public activation key, network, challenge identifier and a signature proving control of the key are sent to the activation service. Recovery words and private keys are not part of that request. Technical connection data, such as the IP address, also becomes available to the service. Public blockchain data, OPAGO websites you choose to open and support requests are separate processing activities.

## 3. Payments and network requests

For Bitcoin and Lightning functions, the app connects to Spark services and, depending on the payment, the Bitcoin or Lightning network. Public wallet identifiers, payment requests, amounts, transaction identifiers and status data may be transmitted. Data about a Bitcoin on-chain payment may be visible on the public network and remain accessible permanently.

For HBAR functions, the app queries Hedera nodes and mirror nodes for account, balance and transaction information. HBAR payments sent from the app are submitted through the configured OPAGO Checkout smart contract. In particular, account and transaction identifiers, amounts and the payment data needed to execute the contract are processed. Hedera transactions and contract calls are generally publicly traceable and cannot be removed from the network when you delete your wallet locally.

If you use a Lightning Address, LNURL or another supported payment request, the app connects to the endpoint you have chosen. That endpoint may receive the request, the amount when an invoice is retrieved and technical connection data. The endpoint is not necessarily operated by OPAGO. Network service providers may also see your IP address when you connect and process it under their own rules.

For Bitcoin transaction information, the app may query `mempool.space` using a transaction identifier. If you open a blockchain explorer in your browser, the privacy information of that website's operator applies.

## 4. Euro values and historical exchange rates

The app requests public exchange rates from CoinGecko. If a rate is unavailable there, it uses Kraken as a fallback. For historical euro values of transactions, it may retrieve exchange rate data from Binance Vision and the confirmation time of a Bitcoin transaction from `mempool.space`. Exchange rate requests do not contain a wallet identifier or balance amount. However, transaction identifiers requested from `mempool.space` and your IP address, which is technically exposed when connecting, may be visible to the respective services. Euro values are estimates.

## 5. Camera, clipboard and external links

With your permission, the app uses the camera to read payment QR codes on your device. The app does not send camera images to OPAGO. The recognised payment information may then be used for a network request or a payment you confirm. Payment information pasted from the clipboard is processed in the same way.

When you open contact, help or legal links, you leave the wallet and access the respective website. The wallet does not append a wallet identifier to these links. For OPAGO websites and the support service linked by OPAGO, OPAGO refers to its [website privacy policy](https://www.opago.com/privacy/) and published [terms and conditions](https://www.opago.com/terms/). This app privacy policy separately describes processing by the wallet itself.

## 6. Error diagnostics with Sentry

Error reports are optional and off by default. Only after you allow them under “Settings → Error reports” may the wallet send filtered JavaScript errors and, on iOS, native crashes to Sentry through a German ingestion address. You can withdraw your choice there at any time; future collection then stops. Reports already sent cannot be recalled. The wallet also works without these diagnostics. OPAGO's Sentry organization is configured with the EU data storage region. OPAGO uses the Developer plan; [Sentry says it retains error events for 30 days on this plan](https://www.sentry.help/en/articles/13964323-how-long-are-errors-events-stored-in-sentry). Reports may include error categories, code positions, build and operating-system details, and a coarse screen category. The diagnostic filters remove wallet addresses, recovery words, keys and payment content before transmission. Sentry also technically receives connection data such as the IP address.

## 7. Support requests

If you open the OPAGO support service linked in the app or send OPAGO a support request, further processing takes place outside the wallet. OPAGO handles emails to `support@opago.com` through Microsoft Outlook / Microsoft 365. For contact and support requests, OPAGO refers to its [website privacy policy](https://www.opago.com/privacy/). That policy states Article 6(1)(f) GDPR as the legal basis for contact requests and Article 6(1)(b) GDPR where a request is aimed at a contract. Its published [terms and conditions](https://www.opago.com/terms/) are also available there. Do not send recovery words or private keys.

## 8. Retention, deletion and public networks

If you delete your wallet in the app, its associated local keys and app data are removed. This does not delete previously published Bitcoin or Hedera transactions or information independently stored by other network operators or payment endpoints. You will need your recovery words if you want to restore the wallet later.

OPAGO deletes completed email support requests 36 months after closure, unless a legal obligation or a specific dispute requires longer retention. The [website privacy policy](https://www.opago.com/privacy/) provides retention and deletion criteria for other information you voluntarily send to OPAGO. Data held by external network and information services may be subject to different retention periods or criteria depending on the provider and purpose.

## 9. Necessity and legal bases

Processing recovery words and keys on your device and sending the details needed for a payment you select to network services are technically necessary for the relevant wallet functions. Without a network connection, balances and payment statuses cannot be reliably retrieved and payments cannot be submitted. Use of the camera and contacting support are voluntary. The app can display estimated euro values only when it can retrieve the necessary public exchange-rate data.

Where OPAGO determines the purposes and means of processing, it relies on Article 6(1)(f) GDPR for the network and status requests needed for wallet and payment functions and for exchange-rate requests. Its legitimate interest is to provide the wallet functions selected by the user, display payment status and offer estimated euro values. OPAGO also relies on Article 6(1)(f) GDPR for the Sentry diagnostics described in section 6, limited to error and crash information. Its legitimate interest is to detect errors, improve the wallet's stability and security, and investigate faults in payment flows. Access to device information for these optional diagnostics starts only after your agreement under Section 25(1) of the German Telecommunications Digital Services Data Protection Act (TDDDG). Withdrawing that agreement stops future Sentry collection independently of an objection to processing under Article 6(1)(f) GDPR. Users may object to processing based on legitimate interests where the legal conditions are met.

Section 7 gives the basis for voluntary support contacts.

## 10. Recipients and processing outside the EU

Depending on the function used, Spark services, Hedera nodes and mirror nodes, payment endpoints you choose, CoinGecko, Kraken, Binance Vision, `mempool.space` and Sentry may receive information as described above. Public Bitcoin and Hedera transactions may be viewed by network participants worldwide. Independently operated payment endpoints and network services process connection and payment information under their respective privacy notices.

[Spark Protocol, LLC/Lightspark](https://www.spark.money/privacy) states that its services are operated in the United States and personal information may be processed there. Lightspark describes the use of standard data protection clauses for certain transfers and provides further information about its safeguards at `privacy@lightspark.com`. OPAGO's Sentry organization uses the EU data storage region; [Sentry notes that some account and organization data may be processed outside the EU](https://www.sentry.help/en/articles/13964378-sentry-s-eu-region-faq). The EU storage region does not mean that all access takes place exclusively within the EU.

## 11. Your rights

Where the General Data Protection Regulation applies, you may, subject to the legal requirements, request access, rectification, erasure, restriction of processing and data portability, and object to processing. You may withdraw any consent you have given with effect for the future. You may lodge a complaint with a competent data protection supervisory authority. Send requests to **contact@opago.com**. How a request is handled depends on whether OPAGO processes the data itself or another organisation is the controller. A right to erasure cannot technically or legally reverse entries on a public blockchain.
