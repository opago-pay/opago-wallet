# Prüfung von Plan V7

Stand 28. September 2026. Geprüft wurde die lokale V7-DOCX einschließlich vollständiger Änderungen gegenüber V6 und des Vertrags 0.1.0. V7 enthält keine inhaltlichen Word-Kommentare oder Fußnoten. Die Prüfung bestätigt keine Umsetzung in fremden Repositories.

## Ergebnis

V7 übernimmt die wesentlichen Vertragskorrekturen: Konto-Löschung unabhängig von Wallets, kontogebundene Server-Wiederherstellung, wallet_bind, UUID je Schreiboperation, deterministische Ereignisversionen, Helper-Fencing sowie UMA-KYC-Status und tatsächlichen Invoice-Description-Hash. F1/IF werden zutreffend als geliefert und noch abzugleichen bezeichnet. F2 bleibt ausdrücklich ein offener praktischer Versuch.

Die wesentliche neue Produktvorgabe ist die auf enforcing umschaltbare non-custodial TME. Vertrag 0.1.0 legte nur Schattenbetrieb fest und konnte negative/wartende Entscheidungen nicht vollständig ausdrücken. Version 0.2.0 schließt diese Schnittstellenlücke mit [TME-Zustandsregeln](tme-v7.md), Schemaänderungen, Fehlerfällen und Abnahmefällen. Das ist ein neuer Implementierungsvertrag, kein eingebauter oder aktivierter Produktionsschutz.

## Verbleibende Widersprüche im Word-Dokument

Diese Stellen sollten redaktionell an das Paket angeglichen werden. Sie verlangen keine erneute Architekturentscheidung:

| Fundstelle V7 | Problem | Technische Festlegung im Paket |
|---|---|---|
| 3.5 vs. 5.1 Auth-Beispiel | Prosa trennt Aktionsproof und Session; Kurzantwort zeigt weiterhin Zugriffstoken und Proof gemeinsam | VerifyResponse ist entweder WalletSession oder ActionProof. |
| 3.5/4.1 vs. 9 Auth-Tabelle | Tabelle nennt Challenge/Verify pauschal ohne Token und übrige Wallet-Routen pauschal mit Wallet-Session | Routenspezifische Auth-Policy: z. B. gebundener Login mit Kontozugang, Restore mit frischem Konto plus Proof, initialer Foto-Vorgang mit eingeschränktem Bootstrap. |
| 3.11/5.1 Korrekturen | PUT in correction_requested und neue Revision nur nach approved bleiben missverständlich | Alte eingereichte Revision ist unveränderlich; auch eine verlangte Korrektur öffnet explizit die nächste Revision. PHOTO-03 prüft das. |
| 5.1 Adressvorschlag | Vorschlag weiterhin aus bereits freigegebenen Daten, obwohl Auswahl vor Freigabe möglich sein soll | Nach Kontobindung aus eigenen eingereichten Daten vorschlagen; Name pending_kyc reservieren; erst nach Freigabe aktivieren. |
| 3.4 vs. 4.3 Preimage | Erst vorhandene Preimage-Felder verwenden, später „Preimage wird nicht gespeichert (Vorschlag)“ | App-Ingest erhält kein Preimage-Feld. Benötigte Anbieterbelege werden getrennt geprüft; dauerhafte interne Preimage-Aufbewahrung benötigt eine explizite Festlegung. |
| 5.1 verkürzte Nachrichten | Ingest-/Helper-Beispiele enthalten nicht sämtliche Pflichtfelder des Pakets; UMA beschreibt „Abschluss“ nicht so präzise wie die vier App-Schritte und der getrennte Settlement-Callback | Vollständige OpenAPI-/Schema-Fixtures verwenden; Kurzbeispiele nicht als eigenes Format implementieren. |

Die Authentifizierungs- und Korrekturregeln wurden bereits in 0.1.0 konkretisiert; V7 muss hierfür nicht erneut eine fachliche Entscheidung treffen. Bei Preimages ist zwischen vorhandener Datenbankstruktur, kurzzeitiger Nachweisprüfung und dauerhafter Speicherung zu unterscheiden. Das bloße Vorhandensein eines Feldes verlangt keine Befüllung.

## Was durch V7 klarer wird

- Custody gehört unveränderlich zur Wallet, nicht pauschal zum Kunden. Ein Kunde kann Wallets beider Typen besitzen.
- Gebühren, Provisionen und interne Buchungen sind keine zusätzlichen TME-Kundenzahlungen.
- Nur unabhängig bestätigte Zahlungen zählen in bestätigte rollierende Werte. Für ausgehende Kundenwerte muss auch die Zuordnung zum tatsächlichen Sender unabhängig belegt sein.
- API-Durchsetzung betrifft OPAGO-Rechnungsausgabe. Direkte Spark-Zahlungen lassen sich damit nicht vorab verhindern; bereits weitergegebene Rechnungen können nicht zuverlässig eingezogen werden.
- Neuer Wallet-Datenbestand bleibt intern; Fotoabgleich bleibt ausdrücklich unterhalb von Full-KYC. Die non-custodial 1.000-Euro-Grenze wird nicht wieder eingeführt.

## Tatsächliche nächste Arbeit

1. Alle beteiligten Teams übernehmen dieselbe Version 0.2.0. Das in V7 benannte führende Repository opago-compliance liegt hier lokal nicht vor. Das Paket wurde nicht dorthin übertragen.
2. F2 liefert reale externe Lightning-Zahlung an die serverseitig erzeugte Nutzer-Invoice bei offline befindlicher App, einschließlich belastbarer Anbieterbelege und Privacy-Grenzen.
3. Teams implementieren und weisen die Fälle in acceptance.json gegen reale Dienste, konkurrierende Aufrufe und mobile Laufzeiten nach. Für UMA fehlen weiterhin die echten Python-/JS-SDK-Interoperabilitätsnachweise.
4. Zuständige Menschen genehmigen das produktive TME-Regelwerk, erlaubte Entscheidungsfrische, Behandlung unvollständiger Nachweise und den späteren Moduswechsel. Die Aufbewahrungsmatrix, Signing-/Geräteabnahme und Store-Unterlagen bleiben erforderlich.

Die Termine in V7 sind Planung; aus der DOCX folgt weder ein fertiger Backend-Stand noch ein App-Store-Go. Für einen weiteren allgemeinen Architekturumlauf sehe ich auf Basis dieses Abgleichs keinen Bedarf. Die offenen Punkte sind konkrete Umsetzung, begrenzte Betriebsentscheidungen und Nachweise.
