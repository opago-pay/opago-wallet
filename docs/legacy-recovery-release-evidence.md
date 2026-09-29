# Altinstallationen und Zahlungsjournale – Release-Nachweis

Stand: 24. September 2026. **Automatischer Abschluss alter ungebundener v1-Zahlungen bleibt offen.** Ein offener Eintrag wird nicht durch Zeit, Ausblenden, Neuinstallation oder einen behaupteten Support-Schalter freigegeben.

## Tatsächliche Datenlage

Die ursprünglich veröffentlichte v1-Struktur (im `HEAD` der Lightning- und Hedera-Journale nachvollziehbar) speichert einen Lightning-`paymentHash`, Betrag, optionalen Spark-Request-ID und Status beziehungsweise bei HBAR Transaktions-ID, Empfänger, Betrag und Status. **Kein v1-Dokument enthält Wallet-Public-Key oder Netzwerknamen.** Die v2-Journale speichern beides im Scope. Der heutige `WALLET_IDENTITY_KEY` und Backup-Status können eine aktuell entsperrte Wallet verifizieren, beweisen aber allein nicht, zu welcher früheren Wallet ein v1-Journal gehörte. Auf derselben Installation können Wallet und Netzwerk gewechselt worden sein.

Spark bietet wallet-spezifische Send-Request- und Transfer-Historie; die laufende v2-Reconciliation nutzt Request-ID, Zahlungs-Hash und bei Erfolg eine verifizierte Preimage. Der Hedera Mirror Node liefert einen Transaktionsstatus und Transfers; sein öffentlicher Treffer allein beweist weder ursprüngliche Wallet noch korrektes Netzwerk. Ein **fehlender** Eintrag bei Spark oder Mirror Node beweist keine gescheiterte Einreichung. Daher wäre eine automatische v1-Übernahme allein anhand des öffentlichen Hashes/der Transaktions-ID unsicher. Für einen beweisbaren Teilfall wäre eine zusätzliche gespeicherte ursprüngliche Wallet-/Netzwerkzuordnung und ein übereinstimmendes, autoritatives Provider-Ergebnis erforderlich. Die v1-Daten enthalten diese Zuordnung nicht.

## Umgesetzter sicherer Teil

- `lib/legacy-payment-review.ts` prüft jetzt das vollständige v1-Feldschema einschließlich Referenz, Betrag und Zeitstempeln, bevor ein Eintrag als lesbar dargestellt wird. Beschädigte und übergroße Daten werden sichtbar als ungültig markiert. Die Funktion ist **nur lesend** und lässt Originalbytes unverändert.
- `components/security/legacy-payment-review.tsx` zeigt Zahl und gekürzte Referenzen, weist auf den Supportkontakt hin und fordert niemals Recovery-Wörter an. Vorliegende Übersetzungen für DE/EN/ES/FR/IT bleiben erhalten.
- Die v2-Journale blockieren weiterhin bei jedem v1-Pending-Eintrag und bei beschädigtem v1-Dokument. Ein ausgeblendeter v2-Pending-Eintrag behält den Doppelsendeschutz. `hooks/useWalletAuth.ts` ersetzt einen unlesbaren Schlüssel nur nach authentifizierter Eingabe der Recovery-Wörter **und** Abgleich mit bereits gespeicherter öffentlicher Identität; ohne diese Identität bleibt die alte Installation unberührt.
- Die zuvor bestätigte Wipe-Instanzwechsel-Korrektur (`lib/bitcoin/store-native.ts`, `lib/wallet-wipe-native.ts`) wird nicht verändert. Ein **vom Nutzer ausdrücklich ausgeführter** vollständiger Wipe ist ein separater Vorgang; er gilt nicht als Nachweis, dass eine alte Zahlung gescheitert ist.

## Bearbeitung eines echten Legacy-Falls

1. Originalgerät und Rohjournal unverändert erhalten; keine Wallet löschen oder auf eine andere Wallet „adoptieren“. Die App zeigt nur eine verkürzte Referenz. Für Support wäre ein lokaler, vom Nutzer ausgelöster Export mit minimierten Daten und Hash des Originals zu spezifizieren; er ist **noch nicht implementiert**. Recovery-Wörter/private Schlüssel werden nie übertragen.
2. Betreiber ermittelt mit dem Nutzer die **ursprüngliche** Wallet und das damalige Netzwerk anhand unabhängiger zeitgenössischer Nachweise. Ein heute aus denselben Wörtern abgeleiteter Public Key genügt ohne Herkunftsnachweis nicht zur Attribution des alten Journals.
3. Erst danach Anbietergebnis abfragen: bei Lightning wallet-spezifischer Spark-Request/Transfer plus Hash, Betrag und gültiger Preimage für „bezahlt“, beziehungsweise ausdrücklicher endgültiger Provider-Fehlschlag für „gescheitert“; bei HBAR passendes Netzwerk, ursprünglicher Payer/Schlüssel, Empfänger, Betrag und finaler Mirror-/Netzwerkstatus. Widerspruch, Timeout oder fehlender Treffer bleibt **ungeklärt**.
4. Ein künftiges Abschlusswerkzeug müsste das unveränderte Rohjournal samt Prüfnachweisen in einem gesicherten Archiv belassen, den belegten Zustand in ein wallet-/netzwerkgebundenes Journal schreiben und nach Unterbrechung idempotent fortsetzen. Zwischen mehreren lokalen Speichern gibt es gegenwärtig keine atomare Transaktion; das Tool darf deshalb erst nach implementierter Crash-Recovery freigeben. Eine bloße Support-Bestätigung ist kein technischer Abschluss.

## Offene Betreiberentscheidung / Produktgrenze

OPAGO muss festlegen, ob v1-Installationen zum öffentlichen Start unterstützt werden. **Es liegt kein Beleg vor, dass es keine solchen Installationen gibt.** Wenn sie unterstützt werden, sind vor Freigabe ein dokumentierter Fallprozess, Zugriff auf verlässliche Spark-/Hedera-Ergebnisse und ein technisch geprüfter Abschluss-/Archivierungsweg erforderlich. Wenn sie ausgeschlossen werden, braucht es einen ausdrücklich kommunizierten Upgrade-/Supportpfad; stilles Löschen oder Freigeben ist keine Option. Bei unlesbarem Schlüssel **ohne** gespeicherte öffentliche Identität gibt es auf dem betroffenen Gerät keinen sicheren Zuordnungsbeweis; Nutzer dürfen auf einem getrennten Gerät mit ihren eigenen Recovery-Wörtern wiederherstellen, während Originaldaten und Zahlungssperre des alten Geräts erhalten bleiben.

## Prüfungen

Die gezielten Node-Tests `legacy-payment-review`, `lightning-payment-journal` und `hedera-payment-journal` bestanden: 30/30. Sie decken beschädigte Daten, falsche Wallet-/Netzwerkscopes, späte Antworten, Provider-Ausfall, unbekannte Ergebnisse und unveränderte Originalbytes ab. Das vollständige Gate unter Node 22.23.1 bestand mit 538/538 App-Tests und 9/9 Contract-Tests (`output/node22-phase5-verify-native-network.log`). Ein echter Legacy-Fall und ein unterbrochener Abschluss wurden **nicht** durchlaufen, da ein sicherer Abschlussweg mangels Zuordnungsnachweis noch nicht existiert. Die native Geräteabnahme ist separat in `native-release-acceptance.md` protokolliert.
