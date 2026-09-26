**Nachprüfung des Design- und Usability-Audits · 24. September 2026, 22:37 Uhr MESZ**

**Ergebnis: Der ursprüngliche Bericht ist nur noch teilweise aktuell.** Von seinen 40 Befunden sind 7 in ihrem ursprünglichen Kern im Code behoben, 3 teilweise bearbeitet und 26 weiterhin offen. 4 betreffen den inzwischen deaktivierten Kaufablauf und sind im aktuellen Nutzerfluss nicht mehr anwendbar. Zusätzlich wurde ein neuer Fehler bei der Anzeige abgeschlossener Bitcoin-Vorgänge nachvollzogen.

Die fünf weiterhin anwendbaren ursprünglichen P1-Kernprobleme 01, 03, 04, 05 und 06 sind im Code adressiert. Das sechste, 02, betrifft den entfernten Kaufablauf. Das ist keine Freigabe der gesamten App: Der neue Statusfehler und das fehlende Kaufen bleiben für das ursprüngliche Produktziel wesentlich. „Offen“ umfasst sowohl konkrete Codefehler als auch die noch nicht umgesetzten Designempfehlungen des ersten Audits.

Geprüft wurde der aktuelle Arbeitsstand einschließlich aller uncommitteten Änderungen, auf Basis von Git-HEAD `e0d3a23`. Der Commit allein identifiziert diesen Stand deshalb nicht vollständig. Es wurden keine App-Funktionen geändert und keine echten Käufe oder Zahlungen ausgeführt. Diese Nachprüfung ersetzt die Statusbewertung des [ursprünglichen Berichts](<C:/dev/opago-wallet/docs/design-usability-audit-2026-09-24.md>); dessen alte Zeilenverweise und damalige Messwerte sind historische Belege.

| Bewertung der ursprünglichen 40 Befunde | Anzahl | IDs |
|---|---:|---|
| Im ursprünglichen Kern behoben | 7 | 01, 03, 04, 05, 06, 25, 29 |
| Teilweise behoben | 3 | 36, 37, 38 |
| Weiterhin offen | 26 | 07, 11–24, 26–28, 30–35, 39–40 |
| Durch deaktivierten Kaufablauf derzeit nicht anwendbar | 4 | 02, 08, 09, 10 |

**Wichtige Änderungen gegenüber dem ersten Audit**

Die Bitcoin-Verbindung besitzt jetzt einen eigenen Zustand und einen echten Wiederverbindungsweg. Home, Senden und Empfangen zeigen diesen an. Für einen noch nicht beendeten alten Startversuch existiert außerdem eine ausdrückliche Anweisung zum vollständigen Neustart. Die Geräteprüfung bei echtem Offline-/Onlinewechsel bleibt erforderlich. Belege: [Wiederverbindung](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:303>), [Verbindungsanzeige](<C:/dev/opago-wallet/components/bitcoin/connection-status.tsx:6>).

Einzahlungen mit erforderlicher Freigabe erhalten einen passenden Hinweis und einen direkten Einstieg in die Einzahlungsübersicht. Ausgehende Vorgänge führen zur Aktivität statt zu Empfangen. Die Übersicht benötigt weiterhin einen weiteren Tap zur konkreten Gebührenprüfung; die frühere Umleitung über die Lightning-Netzwerkauswahl entfällt. Belege: [Statushinweise](<C:/dev/opago-wallet/lib/wallet-display.ts:66>), [Navigation von Home](<C:/dev/opago-wallet/app/(tabs)/index.tsx:617>).

Der konkrete Fehler „broadcast = Status unknown“ ist korrigiert; die Aufrufer übergeben jetzt die Route. Unklare Ergebnisse dürfen weiterhin als unklar bezeichnet werden. Der neue Fehler N01 unten betrifft dagegen die Aktualisierung der Ergebnisansicht nach einem späteren Abschluss. Belege: [Statusübersetzung](<C:/dev/opago-wallet/lib/wallet-display.ts:51>), [Historienaufruf](<C:/dev/opago-wallet/app/(tabs)/index.tsx:675>).

Auf iOS sind Entsperren und sensible Aktionen nun konsistent an Biometrie gebunden; die Sperransicht erklärt Face ID/Touch ID. Der frühere Widerspruch mit dem Gerätecode ist damit behoben. Ein unterstützter Gerätecode-Fallback auf iOS wurde dadurch nicht eingeführt. Belege: [Entsperrung](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:176>), [Hinweis auf dem Sperrbildschirm](<C:/dev/opago-wallet/components/security/wallet-gate.tsx:39>).

Die drei konkreten Hellmodus-Probleme sind behoben: eigenes dunkles Wordmark für helle Flächen, explizite Theme-Rollen und angepasste Akzenttexte. Die erneute Berechnung ergibt 17,69:1 für das Wordmark, 6,31:1 für die ausgewählte Betragseinheit und 6,52:1 für den Empfangslink. Diese Werte bestätigen die untersuchten Kombinationen, keine vollständige native Accessibility-Abnahme. Belege: [Palette](<C:/dev/opago-wallet/lib/theme-styles.ts:5>), [Wordmark-Auswahl](<C:/dev/opago-wallet/app/(auth)/login.tsx:92>), [aktuelle Messung](<C:/dev/opago-wallet/.codex-local-evidence/design-usability-audit/recheck.json>).

**Kaufen: geänderter Funktionsumfang, keine fertig reparierte Integration**

[Die Kaufroute](<C:/dev/opago-wallet/app/buy.tsx:20>) enthält jetzt ausschließlich „Buy crypto“ und „Coming soon“. Sie bindet den vorhandenen `MoonPayCheckout` nicht mehr ein. Der Home-Button ist weiterhin aktiv und zeigt die Einschränkung nicht vor dem Öffnen an. Die alten Befunde zu Konfiguration, Zielermittlung, Bestellfortsetzung und Kaufgebühren sind daher aktuell kein erreichbarer MoonPay-Fehlerpfad. Vor einer erneuten Aktivierung müssen sie wieder geprüft werden. Die Rückkehrnachricht auf Home wurde bereits sachlich verbessert und behauptet keinen Kaufabschluss mehr.

Für das ursprüngliche Ziel „Bitcoin kaufen, senden, empfangen und verwahren“ fehlt damit derzeit eine der vier Kernfunktionen. Falls der Platzhalter für diesen Entwicklungsstand beabsichtigt ist, bleibt das eine Produktentscheidung; er sollte nicht als vollständig umgesetztes Kaufen gezählt werden. Belege: [Home-Kaufbutton](<C:/dev/opago-wallet/app/(tabs)/index.tsx:576>), [verbesserter Rückkehrhinweis](<C:/dev/opago-wallet/app/(tabs)/index.tsx:579>).

**Abgleich aller ursprünglichen Befunde**

Die IDs entsprechen dem ersten Bericht. „Behoben“ bezieht sich auf den ursprünglichen Kernfehler im Code; verbleibende Geräteprüfungen gelten weiterhin.

| ID | Status | Aktueller Befund und Fundstelle |
|---|---|---|
| 01 | Behoben | Eigener Verbindungszustand und tatsächliches `retrySparkConnection()` statt wirkungsloser Guthabenaktualisierung. [Auth-Hook](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:303>) |
| 02 | Derzeit inaktiv | Kein erreichbarer Kaufabschluss mehr; die Kaufroute ist ein Platzhalter. Freigabe-/Gebührenaufklärung vor Wiederaktivierung prüfen. [Kaufen](<C:/dev/opago-wallet/app/buy.tsx:20>) |
| 03 | Behoben | Handlungsbedarf und ausgehende Vorgänge werden unterschieden; Home öffnet Einzahlungsübersicht beziehungsweise Aktivität direkt. [Home](<C:/dev/opago-wallet/app/(tabs)/index.tsx:617>) |
| 04 | Behoben | `broadcast` mit Route `onchain` wird als Übertragung ins Bitcoin-Netz ausgewiesen. [Statusmapping](<C:/dev/opago-wallet/lib/wallet-display.ts:51>) |
| 05 | Behoben | iOS verlangt jetzt auch beim Entsperren Biometrie und erklärt dies. Die frühere Inkonsistenz entfällt. [Entsperrung](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:176>) |
| 06 | Behoben | Explizite Farben und Wordmark-Variante korrigieren die nachgewiesenen hellen Kontrastfehler; neue Tests bestehen. [Theme](<C:/dev/opago-wallet/lib/theme-styles.ts:5>) |
| 07 | Offen | Bitcoin auf Home prüft das Alter eines vorhandenen Kurses weiterhin nicht; Preview-Guthaben ist beim Laden nicht durchgängig als alter Stand markiert. [Home](<C:/dev/opago-wallet/app/(tabs)/index.tsx:145>), [Hinweislogik](<C:/dev/opago-wallet/app/(tabs)/index.tsx:474>) |
| 08 | Derzeit inaktiv | Die früheren Kauf-Ladefehler sind nicht mehr erreichbar. Dafür führt Kaufen jetzt immer zum Platzhalter. [Kaufen](<C:/dev/opago-wallet/app/buy.tsx:30>) |
| 09 | Derzeit inaktiv | Kein aktiver Anbieter-Checkout aus der Kaufroute; der verbliebene Rückkehrmarker ist weiterhin kein dauerhafter Bestellstatus. [Kaufroute](<C:/dev/opago-wallet/app/buy.tsx:12>), [Marker](<C:/dev/opago-wallet/lib/moonpay-return-native.ts:3>) |
| 10 | Derzeit inaktiv | Asset-, Betrags- und Adressformular entfernt; „Buy crypto“ bleibt als Titel. Der vereinfachte Bitcoin-Kauf ist noch nicht implementiert. [Titel](<C:/dev/opago-wallet/app/buy.tsx:23>) |
| 11 | Offen | Amount-Sheet bekommt weiterhin kein verfügbares Guthaben und keine LNURL-Min-/Max-Beträge; die Grenzanzeige liegt hinter dem frühen Rücksprung. [Formular](<C:/dev/opago-wallet/components/send/payment-form.tsx:104>) |
| 12 | Offen | Senden startet mit SAT, Empfangen mit EUR; Tap auf die bereits ausgewählte Einheit löscht weiterhin den Betrag. [Senden](<C:/dev/opago-wallet/components/bitcoin/amount-sheet.tsx:41>), [Empfangen](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:787>) |
| 13 | Offen | Abbrechen führt weiterhin zum vollständigen Reset von Empfänger und Betrag; die Bitcoin-Prüfung wird auch bei Autorisierungsfehlern verworfen. [Reset](<C:/dev/opago-wallet/app/(tabs)/send.tsx:490>), [Fehlerpfad](<C:/dev/opago-wallet/app/(tabs)/send.tsx:366>) |
| 14 | Offen | Zweistufige On-chain-Autorisierung bleibt technisch erforderlich; Ablaufzeit nur in Details, kein sichtbarer Wechsel zu „Angebot erneuern“. [Prüfung](<C:/dev/opago-wallet/components/bitcoin/payment-ui.tsx:35>) |
| 15 | Offen | Pending-Lightning wird weiterhin per Alert und Fehlerhaptik behandelt; die Prüfung verschwindet und verweist auf Home. [Pending-Pfad](<C:/dev/opago-wallet/app/(tabs)/send.tsx:447>) |
| 16 | Offen | Generischer Lightning-Empfänger beziehungsweise unbestätigtes Label; Hinweis auf fehlende Identitätsbestätigung erst in Details. [Empfänger](<C:/dev/opago-wallet/components/bitcoin/payment-ui.tsx:38>) |
| 17 | Offen | Selbst gebautes Zahlenfeld bleibt ein Text mit Tasten, ohne normale Cursor-, Auswahl- und Einfügefunktionen. [Amount-Sheet](<C:/dev/opago-wallet/components/bitcoin/amount-sheet.tsx:33>) |
| 18 | Offen | Externe `bitcoin:`-/`lightning:`-Links fallen weiterhin auf `/` zurück. [Native Intent](<C:/dev/opago-wallet/lib/native-intent.ts:5>) |
| 19 | Offen | Zehn-Minuten-Invoice ohne sichtbare Gültigkeit beim normalen Teilen; keine dauerhafte Lightning-Adresse im Empfangsflow. [Invoice](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:416>) |
| 20 | Offen | Automatische neue Anfrage nach Eingabe beziehungsweise Kursänderung; kein klarer Abschluss des Betragseditors. [Neuerstellung](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:551>) |
| 21 | Offen | Empfangsweg weiterhin hinter „Via“; lesbare Bitcoin-Adresse fehlt auf der Hauptansicht des Empfangs-QR. [Empfangsoberfläche](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:740>) |
| 22 | Offen | Empfangserfolg kehrt weiterhin nach drei Sekunden automatisch zu Home zurück. [Timer](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:510>) |
| 23 | Offen | Zwei-Minuten-Inaktivitätssperre ohne besondere Behandlung des passiv vorgezeigten Empfangs-QR. [Sitzung](<C:/dev/opago-wallet/lib/wallet-session.ts:1>) |
| 24 | Offen | Vorgangsprüfung ohne eigenen sichtbaren Ladezustand; Home verwertet den Fehler des Operation-Hooks nicht. Einzahlungsfehler bleiben pauschal. [Hook-Verwendung](<C:/dev/opago-wallet/app/(tabs)/index.tsx:348>), [Deposit-Fehler](<C:/dev/opago-wallet/components/bitcoin/deposit-screen.tsx:34>) |
| 25 | Behoben | Feste Reihenfolge Empfangen / Senden / Kaufen; keine Umsortierung abhängig vom Guthaben mehr. [Hauptaktionen](<C:/dev/opago-wallet/app/(tabs)/index.tsx:569>) |
| 26 | Offen | Home wartet weiterhin auf initialen Guthaben-/Kurszustand oder den Fünf-Sekunden-Timeout. [Startlogik](<C:/dev/opago-wallet/app/(tabs)/index.tsx:451>) |
| 27 | Offen | Vollständigerer Historienabruf weiterhin erst bei geöffneter Aktivität. Neue Abschluss-Callbacks verbessern lokale Aktualisierung, lösen die fehlende Provider-Aktivität nach Wiederherstellung aber nicht allgemein. [History-Gate](<C:/dev/opago-wallet/app/(tabs)/index.tsx:183>) |
| 28 | Offen | Zahlungsdetails weiterhin ein Alert statt einer vollständigen Belegansicht mit Datum, Empfänger und Gebühren. [Details](<C:/dev/opago-wallet/app/(tabs)/index.tsx:434>) |
| 29 | Behoben | Kontakt, Supportportal und Hilfe-/Rechtslinks sind in Einstellungen sowie vor beziehungsweise während der Sperre vorhanden. Eine weitergehende kontextbezogene Hilfe wäre eine Ergänzung. [Links](<C:/dev/opago-wallet/components/legal/legal-links.tsx:20>) |
| 30 | Offen | Empfangen führt für Backup weiterhin in allgemeine Sicherheitseinstellungen; nach Prüfung kein gezielter Rückweg. Kaufteil entfällt derzeit. [Empfangseinstieg](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:617>), [Abschluss](<C:/dev/opago-wallet/app/(tabs)/settings.tsx:284>) |
| 31 | Offen | Allgemeines „I already have a wallet“ ohne klare Import-Kompatibilität vor Worteingabe. Die Spark-Erklärung steht weiter tief in Einstellungen. [Welcome](<C:/dev/opago-wallet/app/(auth)/login.tsx:135>) |
| 32 | Offen | Einzelworteingabe und Reset bei jedem Zustand ungleich `active` bleiben. Direkte Wortkorrektur ist in der Review bereits vorhanden; fehlende Wortkorrektur sollte nicht pauschal behauptet werden. [Reset](<C:/dev/opago-wallet/app/(auth)/login.tsx:42>), [Wortkorrektur](<C:/dev/opago-wallet/components/onboarding/recovery-form.tsx:143>) |
| 33 | Offen | Backup-Wörter verschwinden weiter nach zwei Minuten; kein geführter zeitlicher Wiedereinstieg beim Abschreiben. [Zeitlimit](<C:/dev/opago-wallet/app/(tabs)/settings.tsx:166>) |
| 34 | Offen | Allgemeine Einstellungen heißen weiterhin „Security“ und mischen Backup, Erscheinungsbild, Sprache, Hilfe, Entfernung und technische Optionen. [Einstellungen](<C:/dev/opago-wallet/app/(tabs)/settings.tsx:330>) |
| 35 | Offen | Sperren hängt die Oberfläche weiterhin aus; nicht geheime Sendentwürfe haben keine eigene Wiederaufnahme. Aktiver Kaufentwurf existiert derzeit nicht. [Sperre](<C:/dev/opago-wallet/components/security/wallet-gate.tsx:35>), [Sendefokus](<C:/dev/opago-wallet/app/(tabs)/send.tsx:516>) |
| 36 | Teilweise | Explizite semantische Farbpalette und Entfernung von Vorlagenresten sind erhebliche Verbesserungen. Schriftgrößen, Abstände und Seitenmuster bleiben verteilt statt durchgängig vereinheitlicht. [Theme](<C:/dev/opago-wallet/lib/theme-styles.ts:5>), [Historienstile](<C:/dev/opago-wallet/app/(tabs)/index.tsx:967>) |
| 37 | Teilweise | Sperr-/Recovery-Zustände sind jetzt scrollbar, Farben verbessert. Historienstatus weiterhin 9, Metadaten 11, Beträge 12; Startanimation ohne Reduce-Motion-Behandlung. Der alte Datums-Kontrastwert gilt nicht unverändert weiter. [Sperre](<C:/dev/opago-wallet/components/security/wallet-gate.tsx:35>), [Typografie](<C:/dev/opago-wallet/app/(tabs)/index.tsx:970>), [Animation](<C:/dev/opago-wallet/app/(tabs)/index.tsx:647>) |
| 38 | Teilweise | Der konkret bemängelte zusammengesetzte Spark-Fehler wird durch feste Verbindungstexte ersetzt; mehr Fehlerübersetzungen vorhanden. Beliebige native Fehlertexte werden etwa im Login weiterhin direkt durch `t(...)` gereicht. [Verbindung](<C:/dev/opago-wallet/components/bitcoin/connection-status.tsx:23>), [Login-Fehler](<C:/dev/opago-wallet/app/(auth)/login.tsx:57>) |
| 39 | Offen | Lokale Empfangsbenachrichtigung weiterhin nur bei bereits vorhandener Berechtigung; kein abgeschlossener Opt-in-/Hintergrundablauf. [Benachrichtigung](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:250>) |
| 40 | Offen | Native Konfiguration bleibt dunkel, App-Einstellung hell/dunkel, kein Systemmodus. Native Übergänge weiterhin zu prüfen. [Konfiguration](<C:/dev/opago-wallet/app.json:9>), [Modusmodell](<C:/dev/opago-wallet/lib/color-mode.ts:2>) |

**N01 · Neuer P1-Befund: Abschlusszustände verschwinden aus den Live-Detailansichten**

Die Umstellung auf `listActive()` begrenzt die Abfragen sinnvoll auf offene Vorgänge. Die Darstellung nutzt aber dieselbe Liste, obwohl sie auch einen abgeschlossenen Zustand braucht:

1. `listActive()` schließt `confirmed`, `failed` und `aborted` ausdrücklich aus. Das gilt für den JSON-Store und SQLite. [JSON-Store](<C:/dev/opago-wallet/lib/bitcoin/store.ts:81>), [SQLite](<C:/dev/opago-wallet/lib/bitcoin/store-sqlite.ts:135>).
2. `useBitcoinOperations()` veröffentlicht diese Liste; auch die Reconciliation liefert nur aktive Vorgänge zurück. [Hook](<C:/dev/opago-wallet/hooks/useBitcoinOperations.ts:57>), [Reconciliation](<C:/dev/opago-wallet/lib/bitcoin/onchain.ts:390>).
3. Die Sende-Ergebnisansicht verwendet `operations.find(...) ?? bitcoinResult`. Verschwindet der Vorgang nach Abschluss aus der Liste, erscheint damit wieder der ursprünglich gespeicherte Zwischenstand. Ein späteres `confirmed` oder `failed` erreicht die Ergebnisanzeige nicht. [Fallback in Senden](<C:/dev/opago-wallet/app/(tabs)/send.tsx:568>).
4. In der Einzahlungsübersicht führt eine leere aktive Liste zum Text „No confirmed Bitcoin deposit detected yet“, auch wenn bereits abgeschlossene Einzahlungen gespeichert sind. Die Anzeige unterscheidet damit nicht zwischen „keine offenen Einzahlungen“ und „noch nie eine erkannt“. [Einzahlungsansicht](<C:/dev/opago-wallet/components/bitcoin/deposit-screen.tsx:90>).

**Nachweis:** Eine synthetische Prüfung mit dem tatsächlichen Store speichert nacheinander einen erfolgreichen beziehungsweise fehlgeschlagenen Abschluss und wertet exakt den aktuellen Ausdruck der Sendeansicht aus. Ergebnis in beiden Fällen: Store enthält `confirmed`/`failed`, aktive Liste enthält 0 Vorgänge, UI-Ausdruck liefert weiterhin `pending`. Es handelt sich um eine Logikprobe, keinen vorgetäuschten Gerätetest. [Skript](<C:/dev/opago-wallet/.codex-local-evidence/design-usability-audit/recheck.cjs>), [Ergebnis](<C:/dev/opago-wallet/.codex-local-evidence/design-usability-audit/recheck.json>).

**Korrektur:** Hintergrundprüfungen dürfen auf offene Vorgänge beschränkt bleiben. Für den angezeigten Einzelvorgang muss sein aktueller Datensatz einschließlich terminalem Zustand separat geladen oder in einem Anzeigezustand fortgeschrieben werden. Die Einzahlungsübersicht benötigt eine zutreffende Leerzustandsmeldung und bei Bedarf einen eigenen Zugriff auf abgeschlossene Einzahlungen. Abnahme: Auf der Ergebnisansicht bleiben und einen synthetischen Übergang `pending → confirmed` sowie `pending → failed` auslösen; beide müssen sichtbar werden, auch nach manuellem Aktualisieren.

**Verifikation und nächste Prioritäten**

Erneut ausgeführt wurden 15 relevante Testdateien aus Senden, Empfangen, Theme, Sprache, Statusanzeige, Lifecycle, MoonPay und Release-/Recovery-Schutz. **137 Tests bestanden, 0 fehlgeschlagen.** Hinzu kommen die aktuelle Kontrast-, Deep-Link-, Statusmapping- und Store-/Ergebnisprobe. [Testprotokoll](<C:/dev/opago-wallet/.codex-local-evidence/design-usability-audit/recheck-tests.log>).

Die Tests belegen die jeweils geprüften Fälle. Sie decken insbesondere den neuen UI-Fallbackfehler nicht als vollständigen Zustandsübergang ab. Eine aktuelle native Sicht-, Screenreader- oder Erstnutzerprüfung wurde auch diesmal nicht durchgeführt.

Als nächste Schritte würde ich zuerst N01 beheben und den geplanten Umfang von Kaufen klar darstellen. Danach folgen Betrag bearbeiten statt löschen, Zurück ohne vollständigen Reset, verständliche Empfangsanfragen und ein durchgängiger Backup-Rückweg. Die ursprüngliche Empfehlung für ein gemeinsames visuelles System bleibt bestehen, kann jetzt aber auf der deutlich verbesserten Farbpalette aufbauen.
