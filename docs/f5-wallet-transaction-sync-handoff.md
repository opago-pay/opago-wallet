# F5 – Wallet-Transaktionsabgleich: Übergabe

Stand: 06.10.2026. App-Code und lokale Vertragsprüfung; **keine Backend-/Geräteabnahme**.
Arbeitsbranch `codex/f5-wallet-transaction-sync` wurde nach Aktualisierung der Remote-Referenzen direkt
von `origin/mvp-branch` (`55858bbe99d070176b601967b61d7b177802baa0`, F4-Merge #41) erstellt.
Der saubere, bereits angehängte Worktree wurde wiederverwendet. Der Hauptcheckout und seine lokalen
Änderungen bleiben erhalten. Keine Abhängigkeiten aus anderen Wallet-Branches übernommen.

## Geprüfte Grundlage und echte Lücken

- F3-Konto/OIDC, aktionsgebundener Spark-Proof, HKA/HPKE, geschützter `PrivateStore` und F4 sind in
  der Ausgangsbasis vorhanden. Sie werden wiederverwendet, ohne v2-Token stillschweigend zu v3-Token zu erklären.
- Maßgeblich ist der [geprüfte Backend-Snapshot](transaction-sync/tx-foundation-v3/README.md)
  **tx-foundation-v3 3.0.0-draft.1** aus Compliance-PR [#573](https://github.com/opago-pay/opago-compliance/pull/573).
  Die Governing-Dokumente zu Datenmodell, Shadow-Mode und Kundenbeziehungen wurden ebenfalls gelesen.
  Der ältere Wallet-Entwurf `docs/transaction-sync/v3-draft/` ist nicht die aktuelle API.
- HBAR-PR [#593](https://github.com/opago-pay/opago-compliance/pull/593) ist noch offen, geprüft am Head
  `78d9bbc8935be3a67be8718be0b1355d5ee3184c`. Seine vorgeschlagenen Referenz-, Gebühren-, Reward- und
  Basistransaktionsregeln dienen der lokalen Berichtsvorbereitung. Die echte Freigabe wird dadurch nicht erteilt.
- M4 `recZABmA2FpxQLwdZ` und HBAR `recq2N5hBOditBuGR` melden Arbeit an Slice 2/M4 nach dem Datenmodell.
  Die in den Updates erwähnte Implementierungsreferenz `maf/hbar-binding-impl` bzw. ein M4-Implementierungs-PR
  waren unter den geprüften veröffentlichten Compliance-Branches/PRs nicht vorhanden. Der vorhandene
  Reconcile-Router ist kein Nachweis für die neuen öffentlichen v3-Berichtsrouten.

Der aktuelle Vertrag lässt insbesondere Signaturalgorithmus/-Encoding (OQ-AUTH-1), WalletBearer-Lebenszyklus
(OQ-AUTH-2), Hedera-Konsens-Key-Proof einschließlich Rotation (OQ-AUTH-6), öffentliche Wallet-/Transaktions-UUIDs
(OQ-ID-1) und Netzwerkidentität (OQ-BIND-6) offen. Er sperrt Bind/Session ohne entschiedene Proof-Regeln und
HBAR-Berichte mit `asset_not_enabled`. Er beschreibt TLS über die Facade, aber keine vereinbarte v3-HPKE-Hülle.
Die Wiederverwendung der vorhandenen HPKE-Hülle für v3 ist deshalb zusätzlich explizit gesperrt, bis das Backend
dies bestätigt. Spark-Statusnormalisierung ist OQ-EV-3: rohe SDK-Status bleiben im Bericht, unbekannte Normalisierung
bleibt `null`. Bereits bestätigte/fehlgeschlagene lokale Journalergebnisse werden getrennt berichtet.

## Implementierte unabhängige App-Teile

- Neue Seite **Einstellungen → OPAGO-Konto → Transaktionsabgleich**, mit Übersetzungen in allen App-Sprachen.
  Sie zeigt wartende Berichte, Pending/Settled/Failed/Unknown-Beobachtungen, empfangene Meldungen und unabhängige
  Belegprüfung getrennt. Zähler beziehen sich auf Berichte, nicht auf kanonische Zahlungssummen oder Wallet-Guthaben.
- Dauerhafte Outbox in F3s gerätegeschütztem, atomar versioniertem Speicher. Ein Berichtsereignis besitzt einen
  vor dem ersten Versuch gespeicherten UUID-`Idempotency-Key`. Derselbe Bericht wird bei unbekannter Antwort mit
  exakt demselben Schlüssel und Body wiederholt. Ein neuer Faktenstand ist ein neues Rohbericht-Ereignis.
  Der aktuelle Vertrag hat **kein** `event_id`-Feld; es wird keines ergänzt.
- Pro Wallet/Quelle/Netz/Konto/Installation/Lifecycle eigene Warteschlange, getrennte Quellfortschritte und
  getrennte dauerhafte Receipt-Acks. Quellseite und Checkpoint werden gemeinsam gespeichert, erst danach
  weitergelesen. Kein erfundener Backend-Cursor-, Batch- oder Reject-Closure-Endpunkt.
- Eigene aktuelle Head-Fenster und wiederaufnehmbare Backfills für Spark-Transfers/-Requests und Hedera-Mirror.
  Überlappung und gespeicherte Fakten-Digests vermeiden erneutes Enqueue gleicher Beobachtungen. Ein Fehler
  einer Quelle lässt andere Quellen und bereits gespeicherte Meldungen weiterarbeiten. Die Streams rotieren
  auch bei kleinen Arbeitsbudgets; keine Quelle erhält das Checkpoint einer anderen.
- Lesen bestehender Lightning-Sendejournale, Lightning-Empfangsarchive, Bitcoin-Operationen und Hedera-Journale.
  Die eigenen idempotenten v1/v2-Journalmigrationen bleiben zuständig. Spark-Identität für Bitcoin-/Receive-Stores
  und Hedera-Key für Zahlungsjournale bleiben korrekt getrennt. Es wird kein zweiter Transaktionsbestand aufgebaut.
  Alte v2-Transport-Acks/Cursor können keine v3-Berichte quittieren. Wiederholter Import/Digest-Migration ist idempotent.
- Bounded Recovery im Vordergrund bei aktivem, entsperrtem Wallet und optional konfiguriertem F3: alle 30 Sekunden,
  pro Asset höchstens sechs Quellseiten, zehn Versandversuche und zehn Receipt-Reads. Manuelle Wiederaufnahme
  auf der Seite. Offline/Transportverlust bewahrt die Warteschlange; exponentielle Verzögerung bis fünf Minuten,
  mindestens ein vom Vertrag gelieferter Retry-After. Keine Warteschleife und kein Zahlungsdispatch.
- Logout, Schließen und Kontolöschung sperren verzögerte Arbeit **vor** dem externen Seiteneffekt. Ein fehlgeschlagener
  Logout bleibt dauerhaft für Sync gesperrt; nur ausdrückliche erneute Anmeldung kann den neuen Lifecycle fortsetzen.
  Wallet-Lock, Wechsel, Wiederherstellung, Netzwechsel und Wipe widerrufen alte Handles. Wipe nutzt weiter F3s
  bestehenden indizierten Löschschritt, einschließlich unterbrochener SecureStore-Schreibvorgänge.
- Sat→msat und tinybar werden mit Integer/BigInt verarbeitet. Der aktuelle Vertrag verlangt positive sichere
  JSON-Integer; Zero/Unknown/Out-of-range bleiben `null`/unresolved, niemals gerundet. Die lokale Wallet kann
  weiterhin größere exakte Werte darstellen. Client-FX, Seed, Private Keys, Token, Preimages, Rechnungsinhalt und
  Memo werden aus den nativen Quellkonvertern nicht als Transaktionsbelege exportiert; Preimages sind in der
  dauerhaften Outbox ausdrücklich verboten. Remote-Fehler/Accountdaten werden nicht geloggt.
- Hedera: SDK-/Mirror-ID wird zu `payer@seconds.nanos` kanonisiert. Nur native, nicht geplante Basistransfers;
  Child-, Duplicate-, HTS-, NFT- und Checkout/ContractCall-Aktivitäten bleiben in vorhandenen Wallet-Stores und
  werden als nicht unterstützte Berichtsfälle gezählt. Payer-Gebühren und Staking Rewards werden exakt entfernt.
  Eine Mirror-Beobachtung wird niemals als unabhängige Backend-Verifikation ausgegeben.
- V3-Bind-/Session-Client für die vorhandenen Challenges/Wallet-/Session-Routen: exakter aktions-, konto-,
  quell-, netz- und installationsgebundener Text vor Zustimmung/Signatur, dauerhafte logische Operationskeys,
  Recovery verlorener Bind-Antwort auch nach Challenge-Ablauf, Prüfung von Wallet/Installation/Epoch und nur
  explizite Session-Proof-Zustimmung. Hintergrund-Authorization liest gespeicherte Sessions und signiert niemals.
  F3-OIDC, geschützter Store und Konto-Queue werden wiederverwendet. Ein Live-Signer bleibt hinter den offenen
  Vertragsentscheidungen; die lokale Hedera-Auswahl allein erteilt keine OPAGO-Berechtigung.

Die begrenzte Outbox (500 ausstehende Ereignisse, 10.000 Quellidentitäten/Receipts, 64 Faktenstände je lokaler
Identität, 1,5 MB pro atomarem Dokument) löscht keine Meldungen zur Platzgewinnung. Voller Speicher stoppt den
betroffenen Fortschritt verständlich. Bereits vorhandene Wallet-Daten und Zahlungen bleiben davon unabhängig.
Buy/Sell/Fiat/Swap sowie eigene On-chain-Request-/Fee-Felder fehlen im aktuellen Vertrag: es gibt keine erfundenen
Trading-Ereignisse oder Endpunkte. Reale Spark-Transferidentitäten von Bitcoin-Operationen können berichtet werden;
andere On-chain-Operationen bleiben im bestehenden Store bis zur Vertragserweiterung.

## Konfiguration und lokaler Testadapter

Produktion: Es gibt keinen neuen Auto-Fallback oder F5-Enablement-Environment-Schalter. Normale F3-Konfiguration
bleibt unverändert. Ohne explizite v3-Anbindung werden Berichte lokal vorbereitet und als Backend ausstehend
angezeigt. Für spätere Aktivierung sind **beide** geprüften Integrationspunkte notwendig:

1. `F3Integration.transactionSync`: Revision `3.0.0-draft.1`, dokumentierte gemeinsame `resolution` und
   `authorize(account, owner)`. Der Resolver muss die wirkliche v3-Wallet-ID, Source-ID, Netz, aktuelle Epoch,
   Kontosubjekt/Installation und einen separat gültigen v3-WalletBearer liefern. `V3WalletOwnership` steht dafür bereit.
2. `HkaTrust.txFoundationResolution`: explizite gemeinsame Vereinbarung zur v3-Facade/HPKE-Hülle. Erst dann
   akzeptiert der vorhandene Transport tatsächliche v3-Pfade/AAD, erforderliche Header und authentifizierte Responses.

Automatische Vordergrund-Recovery setzt zusätzlich das bestehende `EXPO_PUBLIC_OPAGO_F3_ENABLED=true` voraus.
Die unveränderte Standard-Bootstrap setzt die neuen Integrationspunkte **nicht**. Zustimmung, Tokenformat, Key-Policy,
Tenant- und Netzwerkregeln werden nicht aus einem älteren Entwurf abgeleitet.

Development-Build: Auf der Seite „Lokalen Testadapter für den Abgleich öffnen“ wählen (oder `/transaction-sync?test=1`).
Nur `__DEV__` erlaubt das. Der Adapter nutzt ausschließlich synthetische Quellen/IDs und separat benannte geschützte
Testdaten; er hat keinen Zugriff auf SDK-Zahlungsfunktionen, HTTP, echte POS oder Backend-Geräte.

1. Meldungen vorbereiten, Übertragung versuchen: BTC-Eingang/-Ausgang werden quittiert/unresolved, HBAR bleibt zunächst
   mit dem aktuellen `asset_not_enabled` gesperrt. Empfang ist noch keine unabhängig bestätigte Zahlung.
2. Verlorene Antwort, temporären Ausfall oder Sitzungsablauf vor einem Versandversuch simulieren; dann explizit wiederholen.
3. „Testsitzung erneuern und vorgeschlagene HBAR-Tests erlauben“ aktiviert **nur** die vorgeschlagene lokale HBAR-Simulation.
   Nach einer definitiven No-write-Ablehnung entsteht explizit ein neuer Rohbericht-Key. Unbekannte Antworten behalten den alten Key.
4. „Unabhängigen Beleg simulieren“, dann Belege prüfen. Der sichtbare Testmodus bleibt erhalten. Synthetische Belegprüfung
   zählt nicht als echte Backend-Abnahme. Neustart liest dieselbe geschützte Test-Outbox/Receipts; Geräteverhalten ist separat abzunehmen.

## Lokale Prüfung und noch nötige Integrationstests

Die automatisierten F5-Tests prüfen UI-Ablauf, echte lokale Ed25519-Challenge-Signaturen unter einer ausdrücklich
synthetischen Policy, vorhandene HPKE-Kryptographie mit v3-AAD, normative Backend-Schema-Vektoren, Duplikate,
Überlappung/Out-of-order, Terminalkonflikte, verlorene Acks, Prozess-/Schreibverlust, Neustart, Offline/Retry-After,
Parallelität, Migration, Wallet-/Konto-/Epoch-/Installationswechsel, Restore/Wipe-Fences, Sitzungsablauf, Gebühren,
exakte Mengen, Secret-Ausschluss und gesperrte Produktions-Testkontrollen. Die bisherigen Wallet-Tests laufen mit.

| Prüfung | Ergebnis |
| --- | --- |
| Gesamte Wallet-Suite | `npm test`: 831 Tests, 830 bestanden, 0 Fehler, 1 vorhandener iOS-Test übersprungen. `output/f5-tests-final.log`. |
| Neue F5-Nachweise | 35 zusätzliche Tests: 23 Outbox/Schema/Quell-/Fehlerfälle, 2 native Quelladapter, 5 Ownership-/Lifecycle-Fälle, 4 UI-Abläufe und 1 echter lokaler v3-HPKE-Rundlauf. |
| Typecheck/Lint | `npm run typecheck`, `npm run lint`, `git diff --check` erfolgreich; keine Lint-Warnungen. |
| Native Bundles | Lokaler Expo-/Hermes-Export für Android und iOS erfolgreich. `output/f5-native-bundles.log`. Bestehende Noble-/Sentry-Package-Exportwarnungen, kein Geräte- oder Backend-Nachweis. |

Tests liefen mit dem vorhandenen Node 24.18.1; die deklarierte Node-22-CI bleibt separat zu prüfen. Lokale Tests/Bundles
sind keine Emulator-, Geräte-, Netzwerk- oder gemeinsame Backend-Abnahme. Kein Deployment, keine Zahlung und keine
produktive Verknüpfung ausgeführt.

Ausstehend nach Backend-Implementierung/Vertragsentscheidungen:

1. M4-/HBAR-Slice-2-Routen und aktuellen vertraglichen Fehlerkatalog gegen diese Client-Routen abgleichen; UUID-/Tenant-/
   Netzwerk-/Epoch-Mapping, aktuelle Besitzintervalle, Tombstones und Key-Rotation tatsächlich prüfen.
2. Gemeinsame v3-HPKE-/Facade-Konfiguration, Schlüsselrotation, Header, Replay/Freshness und echte v3-Sessions auf Android/iOS.
   Kein v2-Token-Fallback. HBAR-Prüfung muss frische Konsens-Key-Autorität nachweisen; Mirror-Key allein reicht nicht.
3. Bestehende Spark-SDK-Statusliste/Quell-ID-Stabilität (OQ-EV-3/4) bestätigen. Receive, Send, fehlender SDK-Request,
   Restore und overlap über andere Geräte testen; unabhängige Backend-Evidenz muss Hash/Request/Transfer-Aliase korrekt verbinden.
4. Autorisierte HBAR-Bindung einschließlich falschem Netz/Konto/Key, Rotation/Threshold-Policy, Tokenablauf und
   Ownership-Wechsel. Kein Schreiben über bloße lokale Account-Auswahl oder gesponserte Aktivierung.
5. Mirror-Belege: Basisrecord eindeutig, Duplicate/Child/NFT/HTS/ContractCall/Scheduled, Gebühren/Rewards,
   Counterparty-Ambiguität, Fee-Distribution, 404/Lag/Ausfall, Zero/Out-of-range, Konflikt/Revision.
6. Mehrere Backend-Replikate: verlorene Versandantwort/Commit, gleiche Keys, neue Rohberichte, wiederholte Receipt-Reads,
   konkurrierende und verspätete Terminalzustände, Wallet-/Account-Fencing. Ankunftsreihenfolge darf nicht Settlement bestimmen.
7. Backend muss `wallet_reported` von `verified`, Pending/Failed von bestätigten Aggregaten sowie eigene EUR-Bewertung/
   Korrekturhistorie unabhängig von Client-Kursen trennen. Wallet-Guthaben bleiben aus Spark/Hedera.
8. Geräte-Prozessabbruch/SecureStore/Wipe/Restore/App-Upgrade und paralleles UI/Vordergrund-Recovery testen; echte v2/v3-
   Backend-Cut-over-Migration nach den noch offenen OQ-MIG-Regeln. Hier wurde kein produktiver Transport-Cursor migriert.

F5 bleibt **In progress**. Nur F5 wird in Airtable aktualisiert; Backend-/HBAR-/Vertragstasks bleiben unverändert.
