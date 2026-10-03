# OPAGO Wallet – Apple-Einreichungspaket

**Stand: 4. Oktober 2026.** Dieses Dokument beschreibt den aktuellen Quellstand. Es ist keine Freigabe eines signierten Builds und keine bereits erfolgte Änderung in App Store Connect. Die frühere Bestandsaufnahme vom September ist durch diese Fassung ersetzt; ihre Historie bleibt in Git verfügbar.

## Produktumfang

- iPhone-App, `ios.supportsTablet=false`, Bundle-ID `com.opago.wallet`, Version 1.0.0. Das tatsächlich hochgeladene Archiv und dessen Gerätefamilien prüfen.
- Bitcoin/Lightning senden und empfangen; HBAR unter den erweiterten Funktionen bei vorhandenem Konto. Release-Netzwerke hängen vom Build und der EAS-Umgebung ab.
- Startseite: Empfangen und Senden. Kein Kaufangebot; alte Kauf-Links führen zurück zur Startseite. MoonPay-SDK und Kauf-Integration sind entfernt.
- Lokale Wallet-Erstellung, Wiederherstellung und Geräteauthentifizierung; kein Social-Login, kein Abonnement und kein Kauf digitaler App-Funktionen.
- Fehlerberichte sind freiwillig und standardmäßig ausgeschaltet; Freigabe/Widerruf unter Einstellungen → Fehlerberichte.
- Die separate Pilot-/Aktivierungs-API ist nicht Teil dieses Branches. Ihre Einführung erfordert eine erneute Datenfluss- und Releaseprüfung.

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

**Beschreibung DE, Entwurf:**

> Mit OPAGO Wallet kannst du Bitcoin über Lightning oder das Bitcoin-Netzwerk empfangen und senden. Du kontrollierst deine Wiederherstellungswörter selbst. Die App zeigt dir dein Bitcoin-Guthaben, deine Aktivitäten und vor dem Senden den Betrag sowie verfügbare Gebühreninformationen. HBAR findest du unter den erweiterten Funktionen, wenn für deine Wallet ein Konto verfügbar ist. Für Zahlungswege und Netzwerkfunktionen nutzt die App Drittanbieter. Bewahre deine Wiederherstellungswörter sicher auf und teile sie niemals mit anderen. Verfügbarkeit, Gebühren und Bestätigungszeiten hängen vom gewählten Netzwerk und Dienst ab.

Übersetzte Store-Texte und Zielländer sind vom Betreiber freizugeben. Keine Kaufmöglichkeit, garantierte Bestätigungszeit oder vollständige Anonymität behaupten. [Apple 2.3 – Accurate Metadata](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata).

## Screenshots

Sieben historische Grafiken liegen in [app-store-assets](app-store-assets/README.md). Bilder 01 und 07 zeigen den entfernten Buy-Einstieg und dürfen so nicht eingereicht werden. Die restlichen Bilder sind ebenfalls gegen den finalen signierten Build zu prüfen. Neue Aufnahmen mit kontrollierten Testdaten erstellen; keine privaten Wiederherstellungswörter oder fremden Zahlungsdaten zeigen. Die README blendet die zwei offensichtlich veralteten Home-Bilder aus.

Die benötigten Gerätefamilien und Abmessungen anhand des tatsächlich hochgeladenen iPhone-Builds und der [aktuellen Screenshot-Spezifikation](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) auswählen. Aus der früheren supportsTablet-Konfiguration folgt keine aktuelle iPad-Screenshotpflicht.

## Review Notes – vor Einreichung an den finalen Build anpassen

1. Neue Wallet erstellen oder eine separat und sicher bereitgestellte Review-Wallet wiederherstellen. Geräteauthentifizierung und Backup gemäß Oberfläche durchlaufen. Keine echten Nutzerseeds im Repository oder in öffentlichen Review Notes hinterlegen.
2. Startseite zeigt Empfangen und Senden. Empfangen öffnet Lightning; über die Zahlungsweg-Auswahl Bitcoin-Onchain und gegebenenfalls HBAR auswählen.
3. Senden per QR oder manueller Eingabe bis zur Prüfung von Empfänger, Betrag und Gebühren. Zahlungen nur mit ausdrücklich vorbereiteten Testwallets durchführen. Unklare Ergebnisse nicht erneut senden.
4. Zahlungseingang bleibt bis zur Nutzeraktion sichtbar. Done, Beleg und erneute Zahlungsanforderung prüfen.
5. Einstellungen enthalten Sprache, Erscheinungsbild, Sicherheit/Backup, lokale Wallet-Entfernung, optionale Fehlerberichte sowie Rechts- und Supportlinks.
6. OPAGO stellt geeignete finanzierte Review-Fälle und erreichbare Dienste bereit. Testnet-/Sandbox-Funktionen offen benennen; kein versteckter Review-Modus.

## Noch offene Freigaben

Die vollständige [iOS-Abnahmecheckliste](ios-audit-release-checklist.md) ist verbindlich für die interne Releaseentscheidung. Insbesondere bleiben offen:

- Physische iPhone-Prüfungen mit VoiceOver, maximaler Schrift, Tastatur und Gesten; Netzwerkunterbrechungen und Neustart während Zahlungen.
- Signiertes Archiv, Xcode/SDK-Version, native Berechtigungen, Privacy Manifests/Required Reason APIs und Export-Compliance.
- Organisationsmitgliedschaft des Apple-Entwicklerkontos und tatsächlich aktivierte Zielländer/Funktionen.
- Veröffentlichte Datenschutzerklärung, App-Privacy-Antworten einschließlich SDKs, Empfänger, Aufbewahrung und Löschung; keine Veröffentlichung erfolgt durch diesen PR.
- Tatsächliche EAS-Umgebung, Buildnummer, Review-Zugang, Store-Texte und neue Screenshots.

Quellen: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/), [Export Compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/), [SDK Requirements](https://developer.apple.com/support/third-party-SDK-requirements/). Designempfehlungen und die Verwendung eigener React-Native-Komponenten sind nicht automatisch Ablehnungsgründe.
