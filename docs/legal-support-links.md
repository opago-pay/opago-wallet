# Kontakt und Rechtstexte der Wallet

Stand: 24. September 2026. Betreiber laut Vorgabe: **OPAGO GmbH**.
Die URLs sind zentral in `lib/legal-links.ts` hinterlegt.

| Zweck | URL |
| --- | --- |
| Öffentlicher Kontakt | https://www.opago.com/contact/ |
| Supportportal | https://dashboard.opago.com/ |
| Impressum | https://www.opago.com/imprint/ |
| Datenschutz | https://www.opago.com/privacy/ |
| AGB | https://www.opago.com/terms/ |

## Umsetzung in der App

- Einstellungen: alle fünf Links sowie der Betreibername.
- Onboarding und Wiederherstellung: Kontakt, Datenschutz, Impressum und AGB.
- Sperrbildschirm und Wiederherstellungsfehler: Kontakt und Datenschutz, auch ohne entsperrte Wallet.
- Externe Links öffnen über das Betriebssystem. Die App hängt keine Wallet-Daten oder Zugangsdaten an die URLs an. Die normale Sperre beim Wechsel in den Hintergrund bleibt aktiv.
- Das Dashboard leitet aktuell auf `/login` weiter. Es wird als Supportportal mit erforderlicher Anmeldung beschriftet; der Kontakt bleibt direkt öffentlich zugänglich.
- Linktexte und Fehlermeldungen sind auf Englisch, Deutsch, Französisch, Spanisch und Italienisch vorhanden.
- Die angegebenen kanonischen URLs werden unabhängig von der App-Sprache verwendet. Übersetzte Linktexte bedeuten nicht, dass die Zielseite bereits in derselben Sprache vorliegt.
- Die Links sind Informationsangebote. Die App verlangt hierdurch keine Zustimmung zu den aktuellen Händler-AGB.

## Vor Einreichung noch offen

Der Betreiber hat bestätigt, die bestehenden Seiten unter denselben URLs um Wallet-Inhalte zu ergänzen. Bei Prüfung am 24. September 2026 beschrieb die Datenschutzerklärung vorwiegend die Website. Die AGB beschrieben OPAGO Pay für Händler; Abschnitt 3.7 erklärte noch, OPAGO biete keine eigene Bitcoin-LN-Wallet an.

1. Wallet-spezifische Datenschutzinformationen veröffentlichen und mit dem tatsächlichen Datenfluss abgleichen, einschließlich genutzter Spark-, Hedera-, Lightning- und gegebenenfalls MoonPay-Dienste, öffentlicher Blockchain-Daten, Speicherfristen, Löschmöglichkeiten und Kontaktweg.
2. Die Anwendbarkeit der AGB auf die Wallet klarstellen und widersprüchliche Angaben zu Wallet-Angebot und Zielgruppe korrigieren.
3. Die erreichbaren Sprachfassungen der Rechtstexte prüfen. Für separate sprachabhängige URLs werden die tatsächlichen veröffentlichten Adressen benötigt.
4. In den Store-Metadaten Datenschutz- und Support-URL eintragen. Als öffentlich zugänglicher Support-Einstieg ist die Kontaktseite erreichbar; das Dashboard erfordert derzeit eine Anmeldung. Die Einträge in App Store Connect bzw. Play Console werden durch diese Codeänderung nicht automatisch gesetzt.
5. Auf iOS und Android im Release-Build prüfen: Links vor Wallet-Erstellung, in Einstellungen und auf dem Sperrbildschirm öffnen; Rückkehr aus dem Browser einschließlich Wallet-Sperre; Lesbarkeit in beiden Farbschemata und bei großer Schrift; Fehlerfall beim Öffnen einer Seite. Geräteprüfungen stehen noch aus.

Die Integration der Links allein bestätigt weder die Vollständigkeit der Rechtstexte noch die gesamte Store-Freigabereife.
