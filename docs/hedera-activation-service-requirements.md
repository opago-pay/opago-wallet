# Anforderungen an die gesponserte Hedera Kontoaktivierung

Die Opago-App soll für eine neue Wallet ein Hedera-Mainnet-Konto aktivieren können. Opago übernimmt ausschließlich die Erstellungsgebühr. Das neue Konto erhält **0 HBAR Startguthaben**.

Die Wallet bleibt non-custodial. Es gibt kein Opago-Benutzerkonto und keinen vorherigen Backend-Login. Der Dienst erstellt das Konto für den öffentlichen Ed25519-Schlüssel, den die App bereits lokal aus der Wiederherstellungsphrase ableitet.

Dieses Dokument beschreibt den zu liefernden Dienst. Es bestätigt keine bereits erfolgte Implementierung oder Veröffentlichung.

## Was bereitzustellen ist

Ein über HTTPS erreichbarer Dienst, der:

- den Besitz des angefragten Wallet-Schlüssels prüft;
- bereits vorhandene Hedera-Konten erkennt;
- neue Konten mit einem separaten, von Opago finanzierten Zahlerkonto erstellt;
- laufende Aufträge und ihre Ergebnisse dauerhaft speichert;
- maximal 20 neue kostenpflichtige Aktivierungsvorgänge pro Tag zulässt;
- der App den Status und nach erfolgreicher Erstellung die numerische Konto-ID liefert.

Technologie, Hosting und Speicherlösung sind frei wählbar. Erforderlich sind dauerhafte Speicherung und atomare Verarbeitung konkurrierender Anfragen.

## Daten und Authentifizierung

Die App übermittelt ihren öffentlichen Ed25519-Schlüssel als normalisierte, 64-stellige Hex-Zeichenfolge. Sie übermittelt weder private Schlüssel noch Wiederherstellungswörter.

Zur Authentifizierung fordert sie eine einmalige Challenge an und signiert diese lokal. Die Challenge muss mindestens Zweck „Opago Hedera activation“, Netzwerk, öffentlichen Schlüssel, zufälligen Nonce und Ablaufzeit binden. Gültigkeit: fünf Minuten.

Der Dienst prüft die Signatur gegen den angegebenen öffentlichen Schlüssel. Die App muss den vereinbarten Nachrichtenaufbau vor dem Signieren prüfen. Nachrichtenformat und Signaturkodierung werden verbindlich in der API-Dokumentation festgelegt.

Ein Schlüsselnachweis berechtigt ausschließlich zur Aktivierung und zur Abfrage des zugehörigen Auftrags. Persönliche Daten und ein Benutzerkonto sind dafür nicht erforderlich.

## Benötigte Schnittstellen

| Schnittstelle | Anforderung |
| --- | --- |
| Challenge anfordern | Nimmt den öffentlichen Schlüssel entgegen und liefert Challenge-ID, zu signierende Nachricht und Ablaufzeit. |
| Aktivierung anfordern | Nimmt öffentlichen Schlüssel, Challenge-ID und Signatur entgegen. Liefert den bestehenden oder neu angelegten Auftrag. |
| Aktivierungsstatus abfragen | Liefert Auftragsstatus, gegebenenfalls Transaktions-ID und bestätigte Konto-ID. Zugriff über Schlüsselnachweis oder einen nur für diesen Auftrag gültigen Zugangstoken. |

Unterstützte Auftragszustände: `pending`, `confirmed`, `failed`, `needs_review`.

Nach App-Neustart muss ein Nutzer durch einen erneuten Schlüsselnachweis denselben Auftrag wiederfinden können.

## Kontoerstellung und Wiederholungen

Vor einer Erstellung wird geprüft, ob bereits ein aktives Hedera-Konto mit genau diesem öffentlichen Schlüssel existiert:

- Ein eindeutiger Treffer wird zurückgegeben und verbraucht keinen Aktivierungsplatz.
- Mehrere passende Konten führen zu `needs_review`.
- Eine fehlgeschlagene Netzwerkabfrage darf nicht als „Konto existiert nicht“ behandelt werden.

Pro Netzwerk und öffentlichem Schlüssel darf der Dienst höchstens einen Kontoerstellungsauftrag gleichzeitig bearbeiten. Wiederholte und parallele Anfragen müssen auf denselben Auftrag führen.

Die Erstellung erfolgt über eine native `AccountCreateTransaction` mit dem Nutzerschlüssel, 0 HBAR Startguthaben und 0 automatischen Token-Assoziationen. Netzwerk und Transaktionsparameter werden serverseitig festgelegt.

Transaktions-ID und Wiederherstellungsinformationen müssen **vor der Übermittlung an Hedera dauerhaft gespeichert** sein. Bei Timeout oder Neustart wird zuerst das Ergebnis dieser Transaktion geklärt. Ein ungewisses Ergebnis darf keine neue Kontoerstellung auslösen.

`confirmed` wird erst gemeldet, wenn Hedera die Erstellung bestätigt hat und die Konto-ID dem erwarteten öffentlichen Schlüssel zugeordnet ist.

## Tageslimit

Es dürfen maximal **20 neue kostenpflichtige Aktivierungsvorgänge pro Kalendertag** gestartet werden, global über alle Nutzer und Dienstinstanzen hinweg.

- Zeitzone: `Europe/Berlin`, einschließlich Sommerzeit.
- Ein Platz wird atomar vor der ersten Übermittlung reserviert.
- Der Vorgang zählt zum Tag dieser Reservierung.
- Übermittelte Vorgänge zählen auch bei späterem Fehlschlag oder noch unbekanntem Ergebnis.
- Ein Platz darf nur freigegeben werden, wenn sicher feststeht, dass keine Übermittlung erfolgte und keine mehr erfolgen kann.
- Statusabfragen, bestehende Konten und Wiederholungen desselben Auftrags verbrauchen keine zusätzlichen Plätze.
- Neustarts dürfen den Zähler nicht zurücksetzen.

Bei ausgeschöpftem Limit liefert die API `DAILY_ACTIVATION_LIMIT` samt Zeitpunkt der nächsten Freigabe. Bestehende Aufträge bleiben abfragbar.

## Betrieb und Fehlerbehandlung

Der Opago-Zahler-Schlüssel wird ausschließlich geschützt auf dem Server gespeichert. Der Dienst verwendet ein festes Gebührenlimit pro Transaktion und begrenzt die Anfragehäufigkeit.

Bei Ausfall der dauerhaften Speicherung werden keine neuen Transaktionen übermittelt. Unzureichendes Zahlerguthaben, Dienststörungen und notwendige manuelle Prüfungen müssen erkennbar sein. Geheimnisse werden nicht protokolliert.

Die App erhält stabile Fehlercodes und Wiederholungsinformationen. Sie prüft eine zurückgegebene Konto-ID zusätzlich selbst gegen Hedera, bevor sie diese verwendet.

## Lieferung und Abnahme

Benötigt werden:

- Quellcode und Anleitung für Betrieb und Konfiguration;
- getrennte Testnet- und Mainnet-Konfigurationen;
- erreichbare Testnet-API;
- versionierte API-Dokumentation einschließlich Signaturformat, Beispielen und Fehlercodes;
- Nachweise für Parallelzugriffe, Tageswechsel, Neustarts, Timeouts und das 20er-Limit.

Vor Mainnet-Freigabe muss auf Testnet nachgewiesen sein: neue Opago-Wallet aktivieren, genau ein Konto erhalten, über die numerische Konto-ID HBAR einzahlen und nach Wiederherstellung der Wallet dasselbe Konto wiederfinden.

Der bestehende Checkout-Smart-Contract benötigt für diesen Dienst keine Änderung.
