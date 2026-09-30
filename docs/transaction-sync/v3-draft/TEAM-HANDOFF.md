# Gesprächsvorlage Fabian ↔ Michael: Transaktionsabgleich 0.3.0

Stand: 29.09.2026. **Diskussionsfähig, nicht freigegebener Implementierungsvertrag.** Das ausgelieferte LNURL-/Spark-Paket 0.2.0 bleibt für seine bestehenden Routen gültig. [PROTOCOL-V3.md](PROTOCOL-V3.md) definiert Fabians Vorschlag für Public-/Internal-API und HBAR-Bindung einschließlich Nachrichten und Fehlern; maschinenlesbare [Public-](openapi-public.json) und [Internal-OpenAPI](openapi-internal.json) liegen bei. Ziel des Treffens ist Michaels Prüfung und die Aufgabenteilung.

## Fabians Vorschlag für den aktuellen Umfang

1. Jetzt BTC on-chain, Lightning/Spark und HBAR für `send`/`receive` als `movement` mit registriertem Netz, Asset und Rail, exaktem Ganzzahlbetrag und nativer Referenz. Buy/Sell/Fiat/Swap bleiben im Datenmodell erweiterbar; Providerintegration, Order-Belege und echte Fiat-Abwicklung folgen später.
2. `quantity` bezeichnet den übertragenen Betrag **ohne** Netzwerk-/Providergebühr. Eine bekannte Gebühr wird separat mit eigener Identität und `action_code=fee`, `direction=outgoing` berichtet; Betrag plus Gebühr dürfen beim Sender nicht zweimal gebucht werden. Bei unbekannter Aufteilung bleibt die Beobachtung ungeklärt, statt einen Betrag zu erfinden. Der v2-Adapter muss prüfen, welche Betragssemantik die jeweilige Altquelle tatsächlich liefert.
3. Ein Client-Ereignis ist ein Hinweis. Für `settled` verifiziert die interne API Spark-/Lightning-/Bitcoin- bzw. Hedera-/Provider-Daten unabhängig. Kein Lightning-Preimage wird von der App an OPAGO geschickt. HBAR-Konto `(Netz, Account-ID, Ed25519-Public-Key)` wird vor dem Ingest dem angemeldeten OPAGO-Konto zugeordnet; die App besitzt lokal bereits Schlüsselableitung und Mirror-Abgleich.
4. Der Wechsel von v2 nach v3 folgt [MIGRATION.md](MIGRATION.md): getrennte Quell-/v2-/v3-Cursor, lückenlose v2-Barriere, überlappender v3-Nachlauf, serverseitige wirtschaftliche Deduplizierung und sichtbares `coverage_incomplete` bei unbeweisbarer Vollständigkeit. Weder `seq` noch Installations-ID werden kopiert.

## Umsetzung nach Freigabe: vorgeschlagene Zuständigkeiten

| Zuständig | Arbeit an 0.3.0 |
|---|---|
| Fabian – `opago-api` | Öffentliche v3-Routen und HPKE-Fassade gemäß `openapi-public.json`: Authentifizierung und Transport prüfen, Replay/Größenlimits anwenden, gefälschte Forwarding-Header entfernen, Service- und Nutzer-Credentials korrekt weitergeben sowie interne Antworten verschlüsseln. Die vorhandene HPKE-Arbeit wird für diese Routen erweitert; die Produktionskonfiguration `AUTH_HPKE_KEYRING_FILE` stellt Michael bereit. |
| Fabian – `opago-wallet` | BTC-/HBAR-Quellen und Konto-/Wallet-Bindung anbinden, Beobachtungen mit dauerhafter lokaler Outbox und getrennten v2-/v3-Sequenzen erzeugen, Status und Wiederholungen behandeln sowie die in `MIGRATION.md` beschriebene Geräteumstellung implementieren. |
| Michael – `api-internal`/`opago-compliance` | Interne v3-Routen und Datenhaltung gemäß `openapi-internal.json`: serverseitige Konto-/HBAR-Bindung, Katalogprüfung, Cursor/Idempotenz, unabhängige Zahlungsbelege, v2-Adapter, wirtschaftliche Deduplizierung und Migrationsfreigabe. Produktionsschlüssel und Deployment-Konfiguration abstimmen. |
| Gemeinsam | OpenAPI, Adapterregeln und Testvektoren versioniert freigeben; Ende-zu-Ende-Fälle für doppelte/fehlende Ereignisse, Gebühren, Wiederholungen, Wiederherstellung und HBAR prüfen. |

Diese Aufteilung konkretisiert den bisherigen 0.2.0-Handoff: `opago-api` ist die öffentliche Fassade, `api-internal` die fachliche Instanz. Sie ist mit Michael bei der Vertragsfreigabe ausdrücklich zu bestätigen.

## Mit Michael verbindlich entscheiden

| Thema | Vorschlag zur Entscheidung | Ergebnis, das in den Vertrag gehört |
|---|---|---|
| V3-Transport und Auth | Den jetzt in [PROTOCOL-V3.md](PROTOCOL-V3.md) festgelegten kontogebundenen AccountBearer-/HPKE-Pfad prüfen. HBAR erhält eine exakt formatierte Ed25519-Challenge mit Server-Nonce, unabhängig geprüftem Account-Key und eindeutiger Kontobindung. Kein Spark-Proof als HBAR-Proof. | Michael bestätigt/ändert intern benötigte Service- und Konto-Claims; danach vorliegende OpenAPI-Dateien und den [öffentlichen Testvektor](hedera-bind-vector.json) gemeinsam freigeben. |
| V3-Ingest-Protokoll | V2-Semantik für `Idempotency-Key`, 100er-Batches, Batch-Status, lückenlosen Cursor und `close-rejected` übernehmen; v3 hat einen eigenen kontoweiten `installation_id`-/`seq`-Namensraum. `wallet_id` in Nachrichten ist nur ein Selektor, serverseitige Bindung entscheidet. | Vorliegende [Klartextschemas](api-messages.schema.json) und [Public-/Internal-OpenAPI](openapi-public.json) gegen Backend-Persistenz und Testvektoren abgleichen. |
| V2→V3-Identitätsadapter | `payment_hash` und `spark_transfer_id` nur bei serverseitig geprüftem Alias zusammenführen. BTC-`provider_event_id` nicht blind mit `txid:vout` gleichsetzen; Provider-/Chain-Belege müssen die Abbildung bestätigen. Ohne Abbildung bleibt ein Fall ungeklärt und wird nicht als zweite bestätigte Gutschrift gezählt. | Tabelle je Quelle/Typ mit Normalisierungsregel, Quell-API, Rollen-/Gebührenregel, Statusbeleg und Negativfall. |
| Migration und Vollständigkeit | Migrations-ID und v2-Barriere je Installation auf dem Server speichern; v3 startet bei `seq=1`. Quellseite und Outbox lokal atomar persistieren; Server aktiviert nur nach nachgewiesener Quellabdeckung und lückenlosen Cursorn. Alte v2-Geräte dürfen weiter melden und werden dedupliziert. | Migrations-Routenschemas, Zustands-/Fehlerkatalog, verantwortlicher Store/Worker, Umgang mit nicht rekonstruierbaren lokalen Ereignissen und Wiederherstellungstests. |
| HBAR-Belege | Mirror-Historie liefert Tx-ID, Konsenszeit, Resultat, Kontodelta und Gebühr; der Server prüft diese selbst, inklusive Parent-/Child- und Tx-ID-Normalisierung. Lokales Journal mit 50 abgeschlossenen Zahlungen reicht nicht für vollständigen Backfill. | Zugelassene Hedera-Datenquelle, Retry-/Ausfallregel, Bestätigungsregel und Rückabwicklungs-/Korrekturregel. |

## Ergebnis des Gesprächs

Für eine freigegebene **0.3.0-Vertragsversion** müssen Michael und Fabian die vorliegenden API-Dateien, Katalog-/Adapterregeln und plattformübergreifenden positiven/negativen Testvektoren gemeinsam prüfen und versioniert freigeben. Die [Beobachtungs-Schemas](observations.schema.json), [API-Nachrichten](api-messages.schema.json), [Beispiele](examples.json) und [Migrationsfälle](MIGRATION.md) sind Ausgangspunkt. App- und Backend-Implementierung sowie echte E2E-Abnahme sind danach eigene Arbeitsschritte; dieser Entwurf beweist sie nicht.
