# OPAGO 0.3.0 Entwurf: Public-/Internal-API und HBAR-Bindung

Stand: 29.09.2026. Diese Festlegung konkretisiert **Punkt 1 und 2** der [Gesprächsvorlage](TEAM-HANDOFF.md). Sie ist Fabians technischer Vorschlag für die Abstimmung mit Michael. Das ausgelieferte Paket 0.2.0 und seine bestehenden Routen bleiben unverändert. Maschinenlesbar sind die [Public-OpenAPI](openapi-public.json), [Internal-OpenAPI](openapi-internal.json), [Klartext-Nachrichten](api-messages.schema.json) und das [Beobachtungs-Batch](observations.schema.json). Die beiden OpenAPI-Dateien werden reproduzierbar mit `build-openapi.cjs` erzeugt.

## Umfang und Autorisierung

V3 ist **kontogebunden**: Alle nachstehenden Endpunkte verlangen einen gültigen `AccountBearer` des Keycloak-Kontos, dessen Kontakt bestätigt ist und dessen Konto nicht gelöscht/gesperrt ist. Für das Erzeugen einer HBAR-Bindungs-Challenge und für die Deaktivierung einer Bindung gilt zusätzlich `account_fresh` aus 0.2.0 (`auth_time` höchstens 300 Sekunden alt). Ein Wallet ohne OPAGO-Kontobindung bleibt beim v2-BTC-Pfad; V3 überträgt keine Kontoinhaberschaft und aktiviert keine KYC-/AML-Freigabe. Eine Beobachtung darf bei ausstehender Prüfung gespeichert werden, ist aber kein Nachweis für Settlement oder Senderidentität.

Der v3-`installation_id`-Sequenzraum gehört zu **einem OPAGO-Konto je Installation**, auch wenn ein Batch BTC und HBAR mischt. Jedes `wallet_id` im Item ist eine vom Server vergebene ID einer an dieses Konto gebundenen Wallet/Account-Quelle; der Server verifiziert sie gegen den authentifizierten Subject und die aktuelle Account-Generation. Client-`wallet_id`, `source_id`, Netz und Asset sind Selektoren, nie selbst Autorisierung. Die v2-Installation bleibt ein eigener Spark-Wallet-Sequenzraum. Alle `seq` sind positive sichere Integer bis `2^53-1`, persistent mit Payload und Idempotenzschlüssel vergeben.

### Öffentliche Routen

Alle Routen liegen unter dem konfigurierten vertrauenswürdigen API-Ursprung; produktiv `https://api.opago.com`. Sie verwenden **denselben HPKE-Drahttransport wie 0.2.0**: RFC-9180-Base-Mode/Suite, `info`, JCS-AAD mit tatsächlicher v3-Methode und tatsächlichem v3-Pfad, frische Senderkontexte/Replay-Nonces, Antwortverschlüsselung, signierte Schlüsselkonfiguration, Größen-/Zeitgrenzen und Headerregeln aus `../../lnurl-spark-contracts/v2/protocol.md`. HPKE verschlüsselt, ersetzt aber Account- oder HBAR-Authentifizierung nicht. Für jede Mutation ist `Idempotency-Key` (UUID) erforderlich. Verlorene Antworten werden mit **demselben** Schlüssel und gleichem Klartext, aber neuem HPKE-Umschlag wiederholt; Statusabfragen nutzen einen frischen Umschlag. Öffentliche Erfolge und authentifizierte Fehler sind verschlüsselt; vor erfolgreicher Umschlagprüfung sind nur generische Klartextfehler erlaubt.

| Methode/Pfad | Klartext-Anfrage | Klartext-Erfolg | Auth |
|---|---|---|---|
| `POST /api/v3/wallet/observations` | `observations.schema.json` Batch, max. 100 Items/512 KiB | `IngestResult` | `account` |
| `GET /api/v3/wallet/observations/cursor?installation_id=…` | `{}` im Header-Umschlag | `Cursor` | `account` |
| `GET /api/v3/wallet/observations/batches/{idempotency_key}?installation_id=…` | `{}` im Header-Umschlag | derselbe `IngestResult` wie beim Erstversuch | `account` |
| `POST /api/v3/wallet/observations/close-rejected` | `CloseRejectedRequest` | `Cursor` | `account` |
| `POST /api/v3/hedera/binding-challenges` | `HederaChallengeRequest` | `HederaChallenge` | `account_fresh` |
| `POST /api/v3/hedera/bindings` | `HederaBindRequest` | `HederaBinding` | `account` + gültige HBAR-Signatur |
| `GET /api/v3/hedera/bindings/{wallet_id}` | `{}` im Header-Umschlag | `HederaBinding` | `account` |
| `POST /api/v3/hedera/bindings/{wallet_id}/deactivate` | `HederaDeactivateRequest` | `HederaBinding` | `account_fresh` |
| `PUT /api/v3/wallet/observation-migrations/{migration_id}` | `MigrationRequest` | `MigrationStatus` | `account` |
| `GET /api/v3/wallet/observation-migrations/{migration_id}` | `{}` im Header-Umschlag | `MigrationStatus` | `account` |
| `POST /api/v3/wallet/observation-migrations/{migration_id}/activate` | `{}` im HPKE-Body | `MigrationStatus` | `account` |

`GET` nutzt `X-Opago-Envelope`; `POST`/`PUT` nutzen `HpkeRequest` als Body. Query und Pfad sind im HPKE-AAD gebunden. Für `POST /activate` und andere Mutationen mit leerem fachlichem Body wird `{}` verschlüsselt und ein stabiler Idempotenzschlüssel verwendet. Die Public API entschlüsselt und begrenzt, die interne API besitzt alle Konto-, Schlüssel-, Cursor- und Belegregeln. Interner Pfad ist derselbe Pfad auf internem Host; der Aufruf erfolgt wie 0.2.0 mit ServiceBearer, `X-Opago-User-Authorization` und NetworkPolicy/TLS. Die Public API entfernt eingehende gefälschte Service-/User-Forwarding-Header. Die interne API validiert **beide** Credentials selbst und liefert gewöhnliches JSON; die Public API verschlüsselt die Antwort. Keine Side-Effect-Retries im Gateway.

### Ingest- und Antwortsemantik

`accepted` heißt: syntaktisch und fachlich zulässige **Beobachtung dauerhaft gespeichert**, nicht Zahlung bestätigt. `duplicate` heißt: derselbe Konto-/Installations-`seq` mit gleichem Payload/Event oder bereits bekannte wirtschaftliche Beobachtung. `rejected_retryable` blockiert den Cursor; `rejected_permanent` liefert einen an Konto, Installation, `seq`, Event und Grund gebundenen `closure_token`. Der Client darf erst nach dauerhaft gespeicherter Diagnose über `/close-rejected` schließen. Der Cursor rückt nur über lückenlos angenommene/duplizierte/geschlossen abgelehnte Sequenzen vor; bis zu 1000 fehlende Nummern und ein Truncation-Flag werden geliefert. Eine spätere Statuskorrektur ist ein neues `seq`/`client_event_id` mit `supersedes_client_event_id`; die wirtschaftliche Identität bleibt gleich. Betrags-/Statuskonflikte werden aufbewahrt und anhand unabhängiger Belege geklärt, nicht nach Empfangszeit gewonnen.

In der jetzigen Ausbaustufe werden nur `movement`-Items für BTC/HBAR und `send`/`receive` angenommen; `fee` ist für getrennte Netzwerkgebühren zugelassen. Der Zahlungsbetrag schließt die Gebühr aus. Eine Fee-Beobachtung hat `direction=outgoing`, denselben `activity_id` wie die Zahlung und eine eigene registrierte Fee-Referenz (`hedera.transaction_fee`, `bitcoin.withdrawal_fee`, `lightning.routing_fee` oder `spark.transfer_fee`) mit dem nativen Tx-/Request-/Payment-/Transfer-Bezug als Wert; `sub_index=0`, sofern der Adapter nicht mehrere separat nachgewiesene Gebührenbeine kennt. `trade`/`buy`/`sell`/`swap` und `refund` sind syntaktisch als künftige Erweiterung beschrieben, erhalten jetzt aber `rejected_permanent` mit `feature_not_enabled` und werden nicht als ausgeführter Handel verbucht. Ein späteres Feature-Gate muss erst nach Provider-/Fiat-Belegvertrag geöffnet werden.

`GET /batches` liefert nach bestätigter Ausführung das unveränderliche `IngestResult`. Für einen nie angenommenen Schlüssel kommt `batch_not_found` (404); das beweist **nicht**, dass ein gleichzeitig laufender Erstversuch unmöglich ist. Danach darf nur der identische Batch mit gleichem Idempotenzschlüssel wiederholt werden. Gleicher Schlüssel mit anderem Inhalt ergibt `idempotency_conflict` (409). Batch-Ergebnisse, Migration und Bindung werden vor der Antwort dauerhaft gespeichert. Serverlimits: max. 100 Items, 512 KiB entschlüsseltes Ingest-JSON; andere Klartext-Requests max. 64 KiB, HBAR-Signiernachricht max. 2 KiB.

`MigrationRequest` hält nur den vom Client festgehaltenen v2-Wert `H` und Quell-Anker als **Hinweise**. Der Server ermittelt bestätigte Cursor/Quellabdeckung selbst und aktiviert ausschließlich nach [MIGRATION.md](MIGRATION.md). Ein noch nicht aktivierbarer Versuch liefert `migration_not_ready` (409) plus gespeicherten `MigrationStatus` im Fehlerdetail. Alte v2-Geräte bleiben zugelassen; dieselbe wirtschaftliche Bewegung wird einmal konsolidiert.

## HBAR: genaues Besitz- und Kontobindungsprotokoll

Die aktuelle Wallet leitet den Hedera-Ed25519-Schlüssel aus der Mnemonic über `m/44'/3030'/0'/0'` ab. Sie speichert `(Netz, Public-Key, Account-ID)` lokal und prüft die Account-Key-Zuordnung bereits am Mirror Node. V3 unterstützt zunächst **nur ein einzelnes ED25519-Account-Key** je zu bindendem Hedera-Konto, nicht KeyLists, Threshold-Keys, Smart-Contract- oder EVM-Keys. Mehrere Accounts mit demselben Schlüssel dürfen einzeln über ihre numerische Account-ID gebunden werden. Die vom App-Store geladene lokale Bindung reicht für das OPAGO-Backend nicht aus.

1. Die entsperrte App sendet `HederaChallengeRequest` mit `installation_id`, `network_id` (`hedera:mainnet`/`hedera:testnet`), numerischer `hedera_account_id` (`0.0.x`) und **rohem** Ed25519-Public-Key als 64 lowercase Hexzeichen. Die interne API prüft frische Account-Authentifizierung, maximal fünf offene Herausforderungen je Konto/Account/Installation, Rate-Limits, nicht gelöschtes Hedera-Konto und den einzelnen aktuellen Account-Key über `AccountInfoQuery` eines **serverseitig konfigurierten Hedera-Clients im richtigen Netz**. Mirror-Daten allein genügen nicht für die erstmalige aktuelle Schlüsselbindung. Bei Quell-Ausfall keine Challenge mit angenommener Bindung.
2. Sie erzeugt `challenge_id` (UUID), 32 kryptografisch zufällige Nonce-Bytes (lowercase Hex), `issued_at`/`expires_at` in UTC-Ganzsekunden; Laufzeit höchstens 300 Sekunden und niemals länger als die bei Ausgabe noch verbleibende Fresh-Auth-Zeit. Die Challenge speichert Subject/`party_id` aus dem bestehenden 0.2.0-`Account`-Schema, Account-Generation, Installation, Netz, Account-ID, Public-Key und exakte Signierbytes. Die Antwort enthält `signing_message_b64u` mit **kanonischem base64url ohne Padding**.
3. Die Signierbytes sind UTF-8 der folgenden LF-getrennten Zeilen **ohne finales LF**; die Platzhalter sind die gespeicherten Serverwerte, nicht eine vom Client zusammengebaute Variante:

   ```text
   opago-hedera-account-bind-v1
   audience: <configured HTTPS API origin>
   action: hedera_account_bind
   party_id: <server UUID aus Account.party_id>
   account_generation: <positive decimal integer>
   installation_id: <UUID>
   network_id: <hedera:mainnet|hedera:testnet>
   hedera_account_id: <0.0.x>
   public_key: <64 lowercase hex>
   challenge_id: <UUID>
   nonce: <64 lowercase hex>
   issued_at: <YYYY-MM-DDTHH:mm:ssZ>
   expires_at: <YYYY-MM-DDTHH:mm:ssZ>
   ```

   Die App decodiert und prüft vor dem Signieren **jede** Zeile gegen den aktuellen vertrauenswürdigen API-Ursprung, das angemeldete OPAGO-Konto, die entsperrte Hedera-Wallet, Netz, Account-ID und Installation. Sie signiert exakt diese Bytes mit `PrivateKey.sign(bytes)` (Ed25519 nach RFC 8032, **kein zusätzliches SHA-256/kein Ed25519ph**) und sendet die 64 Signaturbytes als base64url. Die App zeigt als Handlung die Bindung des angegebenen HBAR-Kontos an; der Backend-Text darf nicht für beliebige Signieraufträge wiederverwendet werden. Der private Schlüssel verlässt das Gerät nicht.
4. `POST /bindings` prüft zunächst einen identischen Idempotenz-Retry. Für einen neuen Versuch müssen AccountBearer-Subject/Generation/Installation zur gespeicherten Challenge passen, sie darf nicht abgelaufen oder verwendet sein, die Ed25519-Signatur muss auf **genau den gespeicherten Bytes** zum Public-Key stimmen, und der Hedera-Account-Key muss per neuer `AccountInfoQuery` noch immer übereinstimmen. Verbrauch der Nonce, eindeutige aktive `(Netz, Hedera-Account-ID)`-Zuordnung zum OPAGO-Konto, `wallet_id`-Vergabe/Binding-Generation und Antwort werden **atomar** gespeichert. Eine fremde aktive Kontozuordnung wird nicht still umgehängt; generischer `account_mismatch`-Fehler. Identischer Retry kann die gespeicherte Antwort zurückgeben, ohne die Nonce erneut zu verwenden.
5. Nach der Bindung dürfen v3-Beobachtungen mit dem serververgebenen `wallet_id` erfolgen. Beim Ingest muss die Bindung aktiv sein. Ist ihre unabhängige Account-Key-Prüfung älter als 300 Sekunden, wird vor Annahme erneut per `AccountInfoQuery` geprüft; Quell-Ausfall ergibt `upstream_unavailable` (503) und unveränderte Outbox/Sequenz. Bei geändertem oder gelöscht markiertem Hedera-Konto geht die Bindung auf `suspended`, neue Beobachtungen werden mit `binding_stale` (409) zurückgewiesen, frühere Belege bleiben auditierbar. Eine neue Bindung braucht eine neue Challenge. Kontoinhaber können mit frischer Account-Authentifizierung deaktivieren; das löscht keine historischen Transaktionen und berechtigt keinen anderen Inhaber automatisch.

Der Besitznachweis belegt Kontrolle über den **aktuellen** Hedera-Account-Key zur Bindungszeit; er beweist weder Identität des Zahlers noch, dass eine bestimmte Zahlung erfolgreich war. Für HBAR-Settlement prüft die interne API selbst Transaktions-ID (beide zulässigen `@`-/`-`-Formen), `SUCCESS`, Konsenszeit, Netz, gebundenes Account-ID, HBAR-Transferdelta und separat berechnete Gebühr. Fehlende/`UNKNOWN`-Ergebnisse bleiben ausstehend, Fehlstatus werden nicht als Zahlung gebucht. App-Nachrichten und lokales Journal allein genügen nicht.

## Fehler und Wiederholungen

Erfolgreiche Operationen liefern HTTP 200 und das definierte Klartextschema innerhalb des HPKE-Umschlags. Fachliche Fehler verwenden das `Error`-Objekt aus 0.2.0 (`error.code`, `message`, `retryable`, `details`); die Public API wahrt HTTP-Status und Code in der verschlüsselten Antwort. Kein Fehlertext enthält Kontobestand, Keycloak-Subject, komplette Challenge oder fremde Wallet-/Kontoexistenz.

| Code | HTTP | Clientverhalten |
|---|---:|---|
| `invalid_request` | 400 | Korrigieren; keine Wirkung. |
| `unsupported_network`, `unsupported_asset`, `unsupported_rail`, `invalid_native_ref`, `feature_not_enabled` | 422 | Korrigieren; keine stille Umdeutung. |
| `session_expired` | 401 | Account-Zugang erneuern; denselben fachlichen Versuch wiederholen. |
| `reproof_required`, `challenge_expired`, `signature_invalid` | 401 | Neue frische Auth/Challenge für Bindung; nicht dieselben Signierbytes auf anderer Route verwenden. |
| `account_mismatch`, `forbidden` | 403 | Keine automatische Neubindung/Übernahme. |
| `batch_not_found`, `not_found` | 404 | Nur eigenen Scope prüfen; bei unbekanntem Batch identischen Erstversuch erneut senden. |
| `idempotency_conflict`, `seq_conflict`, `binding_stale`, `migration_not_ready`, `cursor_gap`, `alias_conflict` | 409 | Status/Diagnose lesen; fachlichen Konflikt lösen, nicht neue Zufalls-ID zum Umgehen. |
| `payload_too_large` | 413 | Neue kleinere Batches aus denselben Item-IDs/Sequenzen mit neuem Batch-Idempotenzschlüssel. |
| `rate_limited` | 429 | `Retry-After` beachten. |
| `upstream_pending`, `upstream_unavailable`, `hpke_unavailable` | 503 | Gleicher fachlicher Versuch/Idempotenzschlüssel, frischer HPKE-Umschlag; Status abfragen. |
| `upstream_timeout` | 504 | Ausgang unbekannt; Batch/Bindungs-/Migrationsstatus vor neuer Aktion lesen. |

Die v2-Fehler für HPKE-AAD, Replay und widerrufene Schlüssel gelten unverändert. Unbekannter 5xx oder verlorene Antwort ist **kein** Beleg, dass keine Wirkung erfolgte. Bei einer Challenge-Neuausgabe nach Ablauf erhält der Client eine neue Challenge und einen neuen Idempotenzschlüssel; ein identischer Retry der alten Challenge gibt nur das gespeicherte alte Ergebnis zurück.

## Verifikation und Geltungsgrenze

Vor Freigabe: Android-/iOS-Signatur der exakt gleichen Testnachricht, fehlerhafte/abgelaufene/geklaute Challenge, Account-Key-Wechsel, zwei Accounts mit gleichem Schlüssel, verlorene Bindungsantwort, Wiederholung nach Nonce-Verbrauch, falsches Netz, fremdes Konto, Mirror-Ausfall, v3-Cursor-Gap und v2/v3-Duplikate. Alle Public-/Internal-Schemas und HPKE-AAD-Pfade müssen im finalen 0.3.0-OpenAPI-Paket stehen und mit Michael abgestimmt werden. Dieses Dokument definiert das Verhalten; es behauptet keine fertige App- oder Backend-Implementierung.

Quellen: [RFC 8032, Ed25519](https://www.rfc-editor.org/rfc/rfc8032), [RFC 9180, HPKE](https://www.rfc-editor.org/rfc/rfc9180), [Hedera SDK AccountInfoFlow zur Schlüsselprüfung](https://docs.hedera.com/hedera/sdks-and-apis/sdks/accounts-and-hbar/get-account-info).
