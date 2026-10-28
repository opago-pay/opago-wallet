# OPAGO Wallet – Apple-Einreichungspaket

**Stand: 20. Oktober 2026.** Dieses Dokument beschreibt den aktuellen Quellstand. Es ist keine Freigabe eines signierten Builds und keine bereits erfolgte Änderung in App Store Connect. Die frühere Bestandsaufnahme vom September ist durch diese Fassung ersetzt; ihre Historie bleibt in Git verfügbar.

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

**Beschreibung DE, Entwurf:**

> Mit OPAGO Wallet kannst du Bitcoin über Lightning oder das Bitcoin-Netzwerk empfangen und senden. Du kontrollierst deine Wiederherstellungswörter selbst. Die App zeigt dir dein Bitcoin-Guthaben, deine Aktivitäten und vor dem Senden den Betrag sowie verfügbare Gebühreninformationen. HBAR findest du unter den erweiterten Funktionen, wenn für deine Wallet ein Konto verfügbar ist. Für Zahlungswege und Netzwerkfunktionen nutzt die App Drittanbieter. Bewahre deine Wiederherstellungswörter sicher auf und teile sie niemals mit anderen. Verfügbarkeit, Gebühren und Bestätigungszeiten hängen vom gewählten Netzwerk und Dienst ab.

Übersetzte Store-Texte und Zielländer sind vom Betreiber freizugeben. Keine Kaufmöglichkeit, garantierte Bestätigungszeit oder vollständige Anonymität behaupten. [Apple 2.3 – Accurate Metadata](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata).

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
