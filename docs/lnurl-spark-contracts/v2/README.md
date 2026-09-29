# OPAGO LNURL Spark API contracts

Version **0.2.0**, 28. September 2026, Grundlage **Plan V7**. Dieses Paket legt die Kommunikation zwischen Wallet, `opago-api`, `api-internal` und Spark-Helper fest. Es ist ein Implementierungsvertrag, kein Nachweis bereits erreichbarer Endpunkte. Der Nutzer hat die Ausarbeitung fehlender Verträge ausdrücklich beauftragt.

Version 0.2.0 ersetzt 0.1.0 für die V7-Integration. Neue erforderliche Antwortfelder und Statuswerte sind nicht rückwärtskompatibel mit strikt validierenden 0.1.0-Clients; alle drei Teams müssen gemeinsam umstellen. Routen und kryptografische Formate bleiben gleich. Siehe [Änderungsübersicht](CHANGELOG.md) und [TME-Vertrag](tme-v7.md).

## Einstieg für die Teams

1. [Entscheidungen und V7-Feedback](decisions.md) lesen. Dort stehen die korrigierten Widersprüche, die technischen Festlegungen dieses Pakets und die verbleibenden Freigaben.
2. [Protokoll und Zustandsregeln](protocol.md) zusammen mit den OpenAPI-Dateien implementieren. Die `x-opago-*`-Angaben sind verbindliche Ergänzungen für verschlüsselte Nutzdaten und zustandsabhängige Autorisierung.
3. Gemeinsame Schemas und Fixtures unverändert übernehmen und die Prüfungen ausführen. Ein geänderter Vertrag benötigt eine neue Paketversion und entsprechende Änderungen aller betroffenen Implementierungen.

| Datei | Verwendung |
|---|---|
| [openapi-public.json](openapi-public.json) | App ↔ öffentliche API; tatsächlicher HTTP-Transport einschließlich HPKE; öffentliche LNURL-/UMA-Routen |
| [openapi-internal.json](openapi-internal.json) | Öffentliche API ↔ interne API; entschlüsselte fachliche Nutzdaten und getrennte Service-/Nutzerberechtigung |
| [openapi-helper.json](openapi-helper.json) | Interne API ↔ Spark-Helper; Erzeugung, Ergebnisabfrage, dauerhafte Sperre verspäteter Aufträge |
| [schemas.json](schemas.json) | Gemeinsame JSON-Schema-2020-12-Datenmodelle |
| [route-map.json](route-map.json) | Exakte Weiterleitung je Methode und Pfad; Grundlage für Fassaden- und Access-Tests |
| [protocol.md](protocol.md) | Authentifizierung, Zustände, Idempotenz, HPKE, UMA, Fristen und Fehler |
| [fixtures/](fixtures/) | Synthetische Nutzdaten, kryptografische Referenzbytes und negative Fälle |
| [acceptance.json](acceptance.json) | Szenarien, die jede beteiligte Implementierung bzw. die gemeinsame Integration nachweisen muss |
| [validation-report.json](validation-report.json) | Tatsächlich ausgeführte Paketprüfungen; ausdrücklich keine Server-/Geräteabnahme |

## Zuständigkeiten

**Wallet:** OIDC-Kontozugang, Spark-Besitznachweis, HPKE, Fotoaufnahme und Nutzerführung, revisionssichere Wiederholungen, Empfangs-QR und lokale Ingest-Warteschlange. Guthaben und Zahlungen bleiben im Spark SDK. Der erste Empfangs-QR zeigt nach Freigabe die Lightning-Adresse; vorher zeigt die App den Prüfstatus, keinen scheinbar bereits empfangsfähigen Adress-QR.

**opago-api:** Erreichbarkeit, Transportlimits, HPKE mit Replay-Prüfung, Serviceauthentifizierung und Weiterleitung. Keine eigene Wallet-/KYC-/Zahlungszustandsmaschine. Fachliche Antworten werden mit identischem Status und Inhalt in den jeweiligen Transport verpackt. Public LNURL bleibt normales HTTPS/JSON.

**api-internal / opago-compliance:** Alle fachlichen Berechtigungen und Zustände, interne Dokumentablage, automatischer Fotoabgleich, Konto-/Wallet-Bindungen, Namensregister, Zahlungsregistrierungen, UMA und Transaktionsnachweise. Verifiziert weitergeleitete Nutzer-Token selbst. Der Helper erhält ausschließlich bereits autorisierte, fest gebundene Erzeugungsaufträge.

**Spark-Helper / opago-spark:** Dauerhafte Operationen, SDK-Aufruf, Ergebnisabfrage, Fencing und Anbieterbelege. Keine Nutzer-Private-Keys und kein öffentlicher Ingress.

Das im Plan als führend benannte Repository `opago-compliance` liegt lokal nicht vor. Deshalb wird das Paket hier bereitgestellt und kann unverändert nach `opago-compliance/contracts/lnurl-spark/v2/` übernommen werden. Die vorhandenen lokalen LNbits-Verträge werden nicht überschrieben; bestehende custodial Händlerfunktionen und spätere Walk-in-/TRISA-/TRUST-Funktionen werden durch dieses Paket nicht neu definiert.

## Prüfung und Reproduktion

Python 3.12 oder neuer, isolierte Umgebung:

```text
python -m venv .venv-contracts
.venv-contracts/Scripts/python -m pip install -r tools/requirements-validation.txt
.venv-contracts/Scripts/python tools/build_contracts.py
.venv-contracts/Scripts/python tools/build_fixtures.py
.venv-contracts/Scripts/python tools/validate_contracts.py
npm install --prefix tools --ignore-scripts
node tools/verify-fixtures.cjs
```

Auf macOS/Linux liegt Python unter `.venv-contracts/bin/python`. Der Fixture-Generator verwendet ausschließlich offen dokumentierte synthetische Testschlüssel. Diese Schlüssel dürfen nie in einen Build, einen Secret-Store oder einen produktiven Schlüsselbund übernommen werden. Das Paket verändert keine App-Dateien, betreibt keinen Dienst und sendet keine Zahlungen.

Die Prüfung validiert OpenAPI-Struktur, Referenzen, Schemas, konkrete Beispiele, negative Nutzdaten und kryptografische Bytes. Verhalten unter konkurrierenden Anfragen, tatsächliche SDK-Interoperabilität, mobile Laufzeit und Geräteabnahme sind zusätzlich nach [acceptance.json](acceptance.json) zu belegen.

## Quellen

Plan V7: `Technischer_Plan_LNURL_Spark_MVP_V7.docx`, SHA-256 `65cac3ea62246c980883da3e1ea6c224efe054e3db36736c2edd16559f54fbf7`.

Standards: [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html), [JSON Schema 2020-12](https://json-schema.org/draft/2020-12), [HPKE RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html), [JCS RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html), [Native OAuth RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html), [LUD-06](https://github.com/lnurl/luds/blob/luds/06.md), [UMA-Protokoll](https://github.com/uma-universal-money-address/protocol).
