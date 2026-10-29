# OPAGO Wallet – Apple-Einreichungspaket

**Grundfassung: 20. Oktober 2026; Integrationsnachtrag: 29. Oktober 2026.** Dieses Dokument trennt den belegten Quellstand von noch offenen Build- und Betriebsprüfungen. Es ist keine Freigabe eines signierten Builds und keine bereits erfolgte Änderung in App Store Connect. Die frühere Bestandsaufnahme vom September ist durch diese Fassung ersetzt; ihre Historie bleibt in Git verfügbar.

## Ergänzung: belegter Integrationsstand am 29. Oktober 2026

Diese Ergänzung aktualisiert die Integrationsnachweise; ältere Build- und
Store-Angaben unten bleiben historisch und müssen am Einreichungsartefakt geprüft
werden. Keine neue Einreichung, Freigabe oder signierte Binärdatei wird behauptet.

- Wallet main: `456e284de7c09824cbff0499b411b6a84e970415` nach PR #72.
  Der exakt reviewte PR-Stand `45ade344e5238eb337230ac8e1f85521673608fb`
  bestand [CI 40943170960](https://github.com/opago-pay/opago-wallet/actions/runs/40943170960).
  Lokal bestanden 1.257 App-Tests und neun Vertragstests; ein bestehender Test
  wurde übersprungen. Der Merge enthält denselben getesteten Quellbaum.
- API main: `d017f37484f16e98a44d0a23a46d854264aea75c` nach PR #657.
  [Release 40943589590](https://github.com/opago-pay/opago-api/actions/runs/40943589590)
  bestand; Image `20261029195309` wurde veröffentlicht. Ein produktives
  Kubernetes-Rollout ist damit nicht nachgewiesen.
- Gemeinsamer Browser-Einstieg für Login/Registrierung ist implementiert;
  Dashboard #181/#182 liefern den PrivateCustomer-Kontext. Reale Anmeldung,
  E-Mail-Bestätigung und Rückkehr in den neuen nativen Kandidaten bleiben
  separat zu prüfen. Diese Aussage betrifft nicht die schon belegten Tests
  der bisherigen Basis-Wallet-Funktionen.
- Die vorbereitete native F3-Anbindung bleibt produktiv gesperrt. Die
  Löschungs-/Trennungsvorschauen bleiben ausgeschaltet. Store-Texte dürfen
  diese Funktionen nicht als produktiv verfügbar ausweisen.

### Abnahme am tatsächlich signierten Kandidaten

Vor einer neuen Einreichung Build-ID, Quellrevision, Version/Buildnummer,
Plattform, Netzwerk und wirksame Konfiguration erfassen. Die obigen Commits
sind ein auditierter Quellstand, keine Bindung an ein bereits erzeugtes Artefakt.

1. Vorhandenes Testkonto: Browser-Login, verifizierter Callback, Neustart und
   Wiederherstellung; abgelaufene Sitzung und Client-Logout einschließlich
   Offline-Wiederholung prüfen.
2. Neues autorisiertes Testkonto: Registrierung, E-Mail-Bestätigung und frischer
   Login zurück zur Wallet. Nach Timeout/Lock darf der alte Callback nicht
   authentifizieren. Abbruch, Kontowechsel und verspätete Antworten prüfen.
3. Basis-Wallet unverändert testen; keine echte Zahlung ohne separate Freigabe.
   Keine Secrets, Token oder Wiederherstellungswörter im Prüfprotokoll ablegen.
4. Gesperrte F3-/Lifecycle-Funktionen müssen gesperrt bleiben; eine Vorschau ist
   kein Backend-Abnahmenachweis. Den Review-Walkthrough an aktivierte Funktionen
   und tatsächlich bereitgestellten Review-Zugang anpassen.
5. Privacy Manifest und SDK-Manifeste im finalen IPA prüfen; Store-Datenschutz,
   Exportangaben, Kontakt und Zielländer bleiben Betreiber-/Rechtsfreigaben.

Die öffentlichen EN/DE-Löschungsseiten sind im Website-PR #70 auf main
zusammengeführt. Beim lesenden Abruf am 29. Oktober lieferte das Webwerkzeug
Inhalt der Supportseite `/contact/` (Crawl der Vorwoche); das ist kein aktueller
HTTP-Status- oder Formularfunktionstest. Löschungs- und Wallet-Datenschutzseiten
blieben mit diesem Werkzeug unverifiziert; dies belegt keinen HTTP-404-Fehler.
Vor Einreichung alle im Paket genannten URLs öffentlich prüfen.


## Produktumfang

- iPhone-App, `ios.supportsTablet=false`, Bundle-ID `com.opago.wallet`, Version 1.0.0. Das tatsächlich hochgeladene Archiv und dessen Gerätefamilien prüfen.
- Bitcoin/Lightning senden und empfangen; HBAR unter den erweiterten Funktionen bei vorhandenem Konto. Release-Netzwerke hängen vom Build und der EAS-Umgebung ab.
- Startseite: Empfangen und Senden. Kein Kaufangebot; alte Kauf-Links führen zurück zur Startseite. MoonPay-SDK und Kauf-Integration sind entfernt.
- Lokale Wallet-Erstellung, Wiederherstellung und Geräteauthentifizierung; kein Social-Login, kein Abonnement und kein Kauf digitaler App-Funktionen.
- Fehlerberichte sind freiwillig und standardmäßig ausgeschaltet; Freigabe/Widerruf unter Einstellungen → Fehlerberichte.
- Die Hedera-Mainnet-Aktivierungs-API und verifizierte Kontobindung sind seit PR 33 in Main integriert; Produktionsbuilds enthalten die Dienstadresse und keine Pilot-Zugangsdaten.

## Store-Texte und Links

| Feld | Entwurf / Status |
| --- | --- |
| Name | OPAGO Wallet; Markenfreigabe durch Betreiber |
| Untertitel DE | Bitcoin einfach nutzen |
| Untertitel EN | Bitcoin on your terms |
| Untertitel FR | Bitcoin à votre façon |
| Untertitel ES | Bitcoin a tu manera |
| Untertitel IT | Bitcoin a modo tuo |
| Kategorie | Finance; tatsächliche Auswahl unbestätigt |
| Altersfreigabe | Den aktuellen Fragebogen anhand aktivierter Funktionen ausfüllen; keine Alterszahl vorwegnehmen |
| Support | https://www.opago.com/contact/ — vor Upload öffentlich erreichbaren Kontakt verifizieren |
| Datenschutz | https://www.opago.com/wallet/privacy/ — dieselbe Adresse wie in der App; veröffentlichte Fassung mit den aktualisierten DE/EN-Quellen abgleichen |
| Marketing | https://www.opago.com/ — optional; Inhalt und Verfügbarkeit prüfen |

**Beschreibung DE, Entwurf (zusammengeführt mit dem Metadata-Entwurf aus geschlossenem PR #76):**

> Mit OPAGO Wallet kannst du Bitcoin über Lightning oder das Bitcoin-Netzwerk empfangen und senden. Du kontrollierst deine Wiederherstellungswörter selbst. Die App zeigt dir dein Bitcoin-Guthaben, deine Aktivitäten und vor dem Senden den Betrag sowie verfügbare Gebühreninformationen. HBAR findest du unter den erweiterten Funktionen, wenn für deine Wallet ein Konto verfügbar ist. Für Zahlungswege und Netzwerkfunktionen nutzt die App Drittanbieter. Bewahre deine Wiederherstellungswörter sicher offline auf und teile sie niemals mit anderen – auch nicht mit dem Support. OPAGO kann eine verlorene Wiederherstellungsphrase nicht wiederherstellen. Blockchain-Zahlungen können öffentlich nachvollziehbar und unumkehrbar sein. Verfügbarkeit, Gebühren und Bestätigungszeiten hängen vom gewählten Netzwerk und Dienst ab.

Übersetzte Store-Texte und Zielländer sind vom Betreiber freizugeben. Keine Kaufmöglichkeit, garantierte Bestätigungszeit oder vollständige Anonymität behaupten. [Apple 2.3 – Accurate Metadata](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata).

**Description EN, draft (adapted from closed PR #76):**

> OPAGO Wallet is a self-custody wallet for Bitcoin and supported digital assets. Create or restore a wallet on your device, manage your recovery phrase, view supported balances and transactions, and send or receive Bitcoin using Lightning or the Bitcoin network. HBAR is available under the extended asset options when supported by the installed build. You control your recovery phrase; OPAGO cannot recover it if lost. Keep it securely offline and never share it with support. Blockchain transactions may be public and irreversible. Available networks, fees and confirmation times depend on your build and external services. This app does not provide investment advice.

**Search keywords (draft; verify length, localization and actual features in App Store Connect):**

| Locale | Draft keywords |
| --- | --- |
| DE | Wallet,Krypto,Bitcoin,HBAR,Lightning,Self-Custody |
| EN | wallet,crypto,bitcoin,HBAR,lightning,self-custody |

**Store category:** Finance; secondary category omitted unless explicitly approved. **Age rating:** complete Apple's questionnaire against the exact distributed app (including external web sign-in, financial features, unrestricted web access and content). No final age rating or exemption is claimed by this document.

### App Privacy inventory (draft; requires legal/operator approval)

The following describes possible data flows; it is **not** a final App Store Connect privacy questionnaire answer and must be reconciled with actual server and SDK processing:

| Category | App/SDK behavior to verify before declaring |
| --- | --- |
| Contact information | Website/OPAGO account signup and broker authentication may process email/phone; identify controller and app-to-browser flows |
| Identifiers | Public Bitcoin addresses, wallet/account identifiers, transaction IDs and IP addresses may be transmitted to API, blockchain explorers and network nodes |
| Financial information | Balances, amounts, fees, invoices and transaction status are handled locally and may reach payment/network providers; onchain history and report outboxes were added by #78 |
| Diagnostics | Optional, consent-based Sentry error/crash reporting, including possible device/OS/build diagnostics; verify native crash processing, filtering and retention |
| Sensitive secrets | Recovery words and private signing keys remain device-local; never put them into Review Notes, screenshots or diagnostics |
| Tracking | No advertising tracking intended; audit all third-party SDKs and their final binary/privacy manifests before declaring no tracking |

Use the existing wallet privacy URL **https://www.opago.com/wallet/privacy/** and support URL **https://www.opago.com/contact/**, not the generic draft links in the superseded #76 document. Check the published policies, retention, deletion, and cross-border disclosures against backend and signed release build.

### iOS privacy manifest / native SDK audit (source inspection, not binary certification)

`privacy/PrivacyInfo.xcprivacy` is a **property-list XML** copied into the iOS app target via `plugins/with-privacy-manifest.js`. The main-branch `./plugins/with-bitcoin-bdk` integration is preserved. Required-reason API entries:

| API category / reason | Intended app-container use / relevant native layer |
| --- | --- |
| UserDefaults · `CA92.1` | App-owned settings and persisted preferences in React Native/Expo/native dependencies |
| FileTimestamp · `C617.1` | File metadata inside the sandbox for app-owned SQLite/database, wallet journals, Expo FileSystem and BDK-rn Onchain persistence |
| SystemBootTime · `35F9.1` | Elapsed-time measurement, timers and React Native/Expo performance/navigation behavior |
| DiskSpace · `E174.1` | Check space available for local database/file writes (SQLite/Expo/native file storage) |

**Audit scope:** React Native, Expo SecureStore/FileSystem/SQLite/Camera/ImagePicker, Sentry, Spark SDK, BDK-rn 1.1.0 (native Rust/SQLite bridge from #78) and Hedera native integrations. These entries cover relevant common API categories; actual invocations, vendor manifests, privacy data declarations and any additional reasons must be checked in the **generated iOS archive** and with the current Apple SDK analysis. No active-keyboard reason is asserted without evidence. The absence of a `NSPrivacyCollectedDataTypes` entry is **not** a claim that no data is collected; the App Privacy declaration remains an operator/legal task.

### Export compliance (operator decision pending)

`ITSAppUsesNonExemptEncryption=true` is deliberately conservative until the responsible operator validates the **actual** use of cryptographic libraries (wallet signing, key handling, HPKE and HTTPS), applicable exemptions, export classifications, countries and any filings required by Apple. Do not infer exemption solely from TLS; record the approved answer and documentary evidence before submission.

### App Review contact and credentials (template; no credentials in repository)

| Required field | Review-only placeholder |
| --- | --- |
| Contact name / email / phone | [REVIEW CONTACT NAME / EMAIL / PHONE] |
| Review login / username | [REVIEW USERNAME] |
| Password / verification factor | [PROVIDE SECURELY IN APP STORE CONNECT — NEVER COMMIT] |
| Environment / API base | [APPROVED REVIEW ENVIRONMENT] |
| Network / asset | [APPROVED REVIEW NETWORK / ASSET] |
| Build | [SIGNED VERSION / BUILD NUMBER] |
| OTP / email confirmation | [REVIEW-SAFE ACCESS INSTRUCTIONS] |

Review walkthrough: (1) launch, create or restore a dedicated review wallet, and unlock locally; (2) use the supported account sign-in or registration path when needed, with reviewer-safe account access provided privately; (3) show balances and transaction history; (4) receive via Lightning or Bitcoin onchain QR; (5) demonstrate sending **only** if a separate, safely funded test wallet/environment is approved, with fee confirmation and no repeated payments after unknown outcomes; (6) inspect security, recovery, support/privacy links, account/wallet status and any unavailable services. Never supply customer funds, live secrets or an employee's private inbox. Confirm every step on the exact binary submitted; disclose backend-disabled features rather than simulate them.


## Screenshots

Acht Grafiken liegen in [app-store-assets](app-store-assets/README.md), dort mit Upload-Reihenfolge. Bilder 01 und 09 enthalten jetzt die am 20. Oktober von Fabian gelieferten aktuellen iPhone-Aufnahmen in Hell und Dunkel, eingesetzt in das bisherige Design. Sie zeigen die deutsche Oberfläche mit Empfangen und Senden ohne Buy; die englischen Werbetexte bleiben erhalten. Bild 07 bleibt mangels aktueller Aufnahme mit aufgeklappter Coin-Liste ausgeschlossen. In App Store Connect die alten Bilder 01 und 09 ersetzen und Bild 07 entfernen. Alle Bilder gegen den finalen signierten Build und die ausgewählte Store-Sprache prüfen.

Die benötigten Gerätefamilien und Abmessungen anhand des tatsächlich hochgeladenen iPhone-Builds und der [aktuellen Screenshot-Spezifikation](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) auswählen. Aus der früheren supportsTablet-Konfiguration folgt keine aktuelle iPad-Screenshotpflicht.

## Review Notes – vor Einreichung an den finalen Build anpassen

Die Ablehnung vom 18. Oktober 2026 betrifft Version 1.0.0 (46), Submission-ID `2af73989-d45a-4a68-8636-6678e3dbea67`. Der Kamera-Vordialog verwendet im Quellstand jetzt „Continue“ bzw. „Weiter“ sowie eine sachliche Zweckbeschreibung in allen fünf Sprachen. Die eigentliche Berechtigung wird weiterhin im Systemdialog erteilt oder abgelehnt. Ein neuer iOS-Build und die Aktualisierung der Store-Screenshots stehen separat aus.

1. Neue Wallet erstellen oder eine separat und sicher bereitgestellte Review-Wallet wiederherstellen. Geräteauthentifizierung und Backup gemäß Oberfläche durchlaufen. Keine echten Nutzerseeds im Repository oder in öffentlichen Review Notes hinterlegen.
2. Startseite zeigt Empfangen und Senden. Empfangen öffnet Lightning; über die Zahlungsweg-Auswahl Bitcoin-Onchain und gegebenenfalls HBAR auswählen.
3. Senden per QR oder manueller Eingabe bis zur Prüfung von Empfänger, Betrag und Gebühren. Zahlungen nur mit ausdrücklich vorbereiteten Testwallets durchführen. Unklare Ergebnisse nicht erneut senden.
4. Zahlungseingang bleibt bis zur Nutzeraktion sichtbar. Done, Beleg und erneute Zahlungsanforderung prüfen.
5. Einstellungen enthalten Sprache, Erscheinungsbild, Sicherheit/Backup, lokale Wallet-Entfernung, optionale Fehlerberichte sowie Rechts- und Supportlinks.
6. OPAGO stellt geeignete finanzierte Review-Fälle und erreichbare Dienste bereit. Testnet-/Sandbox-Funktionen offen benennen; kein versteckter Review-Modus.

## Noch offene Freigaben

Siehe [Geräteteststand](DEVICE_TESTING_STATUS.md). Die [iOS-Unterlagen](ios-audit-release-checklist.md) führen Store- und Betreiberprüfungen getrennt auf:

- Signiertes iOS-Archiv 46 ist vorhanden; Store-Angaben zu nativen Berechtigungen, Privacy Manifests/Required Reason APIs und Export-Compliance bleiben separat abzugleichen.
- Organisationsmitgliedschaft des Apple-Entwicklerkontos und tatsächlich aktivierte Zielländer/Funktionen.
- Veröffentlichte Datenschutzerklärung, App-Privacy-Antworten einschließlich SDKs, Empfänger, Aufbewahrung und Löschung; keine Veröffentlichung erfolgt durch diesen PR.
- Tatsächliche EAS-Umgebung, Buildnummer, Review-Zugang, Store-Texte und neue Screenshots.

Quellen: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/), [Export Compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/), [SDK Requirements](https://developer.apple.com/support/third-party-SDK-requirements/). Designempfehlungen und die Verwendung eigener React-Native-Komponenten sind nicht automatisch Ablehnungsgründe.
