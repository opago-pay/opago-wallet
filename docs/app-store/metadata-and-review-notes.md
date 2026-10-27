# OPAGO Wallet — App Store submission draft

> Draft only. Do not submit unchanged. Product/legal owner must verify every claim against the release build and approve the privacy/export answers. Prepared 2026-10-27.

## App metadata

- **Name / Name:** OPAGO Wallet
- **Subtitle (DE):** Self-Custody-Wallet für digitale Werte
- **Subtitle (EN):** Self-custody wallet for digital assets
- **Category:** Finance (confirm in App Store Connect)
- **Secondary category:** None unless approved
- **Keywords (DE):** Wallet,Krypto,Bitcoin,HBAR,Lightning,Self-Custody
- **Keywords (EN):** wallet,crypto,bitcoin,HBAR,lightning,self-custody
- **Age rating:** Complete Apple's current questionnaire based on shipped functionality. Preliminary expectation: no user-generated content, gambling, sexual content, violence or unrestricted web access; do not select final rating without checking every question.

## Beschreibung (Deutsch)

OPAGO Wallet ist eine Self-Custody-Wallet für unterstützte digitale Werte. Erstelle oder stelle eine Wallet auf deinem Gerät wieder her, verwalte deine Wiederherstellungsphrase und prüfe verfügbare Kontostände und Aktivitäten für die in deiner App-Version aktivierten Netzwerke.

Du kontrollierst deine Wiederherstellungsphrase. OPAGO kann eine verlorene Phrase nicht wiederherstellen. Bewahre sie sicher offline auf und teile sie niemals mit dem Support. Blockchain-Transaktionen können öffentlich nachvollziehbar und unumkehrbar sein.

Die verfügbaren Netzwerke und Zahlungsfunktionen hängen von der freigegebenen App-Version und der Verfügbarkeit externer Netzwerkdienste ab. Gebühren, Bestätigungszeiten und Verfügbarkeit können variieren. Diese App ist keine Anlageberatung.

## Description (English)

OPAGO Wallet is a self-custody wallet for supported digital assets. Create or restore a wallet on your device, manage your recovery phrase, and view balances and activity for networks enabled in your app version.

You control your recovery phrase. OPAGO cannot recover a lost phrase. Keep it securely offline and never share it with support. Blockchain transactions may be publicly traceable and irreversible.

Available networks and payment features depend on the approved app version and external network services. Fees, confirmation times and availability may vary. This app does not provide investment advice.

## App Privacy — draft inventory, not a final declaration

Confirm against the release binary, SDK documentation, server-side processing and Apple's current definitions before submission.

| Data / category | Draft answer | Purpose / notes |
|---|---|---|
| Contact information | Not collected by the wallet app unless account/auth flows transmit it to OPAGO | Verify Keycloak/portal and API behavior |
| Identifiers | Wallet/account public identifiers and transaction identifiers may be processed by network providers | Payment functionality; public-chain identifiers are not secret |
| Financial info | Payment amounts, balances, payment requests and transaction data may be processed by payment/network services | Do not mark as not collected without reviewing Apple definitions and third-party data flow |
| Diagnostics | Optional filtered error/crash reports; user opt-in; device/OS/app version and IP may be processed by Sentry | Check current diagnostics defaults and actual release configuration |
| User content | Recovery phrase/private keys remain local; never upload them | Verify crash/logging filters and native crash reports |
| Tracking | No advertising tracking intended | Verify SDKs and App Privacy tracking definition; do not claim without audit |

### Privacy URLs and support (replace/verify before submission)

- Privacy policy: https://www.opago.com/privacy/ and the wallet-specific policy at https://github.com/opago-pay/opago-wallet/blob/main/docs/wallet-privacy-policy-en.md (publish a stable public URL before submission)
- Support URL: https://www.opago.com/ (replace with a dedicated, monitored support page)
- Legal / imprint: https://www.opago.com/ (verify that the required legal notice is directly reachable)

## Export compliance

The app uses cryptographic libraries and secure transport. The current build setting is intentionally configured to declare non-exempt encryption use until the responsible owner confirms the correct exemption classification. Answer App Store Connect export questions based on the actual algorithms, purposes and distribution countries. Obtain any required documentation or national filings before release. Do not infer exemption from HTTPS or from this plist key alone.

## Review notes template

**Contact:** [REVIEW CONTACT NAME / EMAIL / PHONE]

**Demo account:** [DEMO USERNAME]
**Demo password / one-time access instructions:** [SECURE REVIEW CREDENTIALS — never commit real credentials]
**Environment:** [REVIEW API BASE URL / REGION]
**Network:** [APPROVED TEST NETWORK AND ASSET]
**Build:** [VERSION / BUILD NUMBER]

### Demo flow
1. Launch OPAGO Wallet and select the supported sign-in / account creation path.
2. Sign in using the demo credentials above; if email verification or a one-time code is required, provide the reviewer-safe procedure here: [INSTRUCTIONS].
3. Open the wallet home screen and inspect the displayed supported balance and activity.
4. Open Receive and show the generated request/QR for the configured review network.
5. If sending is enabled in this review build, perform only the documented low-value test transaction using the supplied test asset/account: [SAFE TEST STEPS]. Otherwise, explain that payments are disabled in this build.
6. Open Settings to review security, recovery-phrase safeguards, privacy/legal links and account deletion status.
7. Explain any unavailable features plainly. Do not ask reviewers to use personal funds or a production account.

### Reviewer caveats
- Do not provide a real customer's account or any recovery phrase/private key.
- Credentials must remain valid throughout review and must not require access to a private employee inbox.
- Ensure all advertised core functions are accessible and functional in the submitted build.
- Replace every bracketed placeholder and verify the demo path on the exact uploaded build.
