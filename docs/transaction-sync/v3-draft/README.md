# Multi-Asset-Transaktionsvertrag – Entwurf 0.3.0

Stand: 29.09.2026. Dieser Entwurf erweitert ausschließlich den **Transaktionsabgleich**. Das an Michael gelieferte LNURL-/Spark-Vertragspaket 0.2.0 bleibt unverändert und für seine bisherigen Routen maßgeblich. Eine produktive Umstellung benötigt einen gemeinsam freigegebenen API-Vertrag, Backend-Implementierung und App-/E2E-Abnahme.

Für die Abstimmung mit Michael gibt es eine kurze [Gesprächsvorlage](TEAM-HANDOFF.md). Die [v3-API- und HBAR-Bindungsregeln](PROTOCOL-V3.md) sowie ihre [Klartext-Nachrichtenschemas](api-messages.schema.json) konkretisieren Fabians Vorschlag.

## Ziel und Begriffe

Eine Wallet-Aktivität ist nicht dasselbe wie eine Geldbewegung. Ein Kauf ist beispielsweise eine Bestellung mit Fiatbetrag, Anbieterstatus und einem oder mehreren späteren Coin-Eingängen. Ein einfacher Empfang hat keine Kaufbestellung. Ein Swap kann zwei verschiedene Assets und Netze betreffen. Diese Dinge dürfen nicht aus dem Vorzeichen eines Betrags erraten werden.

Der neue Abgleich nutzt deshalb zwei Arten von **Beobachtungen** (`observations.schema.json`):

- `movement`: eine Bewegung aus Sicht genau einer gebundenen Wallet bzw. eines Kontos. Sie nennt Asset, Netz, Rail, exakten Betrag, Richtung, Status und native Referenz.
- `trade`: Kauf, Verkauf oder Swap als eigener Vorgang mit Basis-/Gegenwert, Anbieter-/Order-ID, Gebühren und Verknüpfungen zu den tatsächlich beobachteten Bewegungen. Quote und Ausführung bleiben unterscheidbar.

`activity_id` gruppiert zusammengehörige Beobachtungen für die Anzeige. Sie ist **kein** Beleg für Settlement und **kein** Deduplizierungsschlüssel für Geldbewegungen. Eine Bewegung wird über gebundene Wallet, Netz, Asset, native Referenz und Unterindex konsolidiert. Ein Trade enthält `settlement_refs` für seine Coin- und Fiat-Seite; diese sind auch über Geräte-/Batch-Grenzen hinweg auflösbar. `linked_movement_ids` und `activity_id` sind zusätzliche Client-Hinweise. Die interne API bildet daraus nach eigener Prüfung eine kanonische Aktivität. App-Daten sind Hinweise; Anbieter-/Chain-Belege bleiben nötig.

## Identität, Geld und Erweiterbarkeit

| Feld | Regel | Beispiele heute |
|---|---|---|
| `network_id` | Stabiler, registrierter Netzbezeichner; Netz und Umgebung gehören zur Identität. | `bitcoin:mainnet`, `bitcoin:regtest`, `hedera:mainnet`, `hedera:testnet` |
| `rail_id` | Zahlungsweg **getrennt** von Coin und Netz. | `bitcoin_onchain`, `lightning`, `spark`, `hedera_native` |
| `asset_id` | Stabiler, registrierter Assetbezeichner; Ticker ist nur Anzeige. Token-IDs enthalten Netz und Emittent/Vertrag. | `bitcoin:mainnet/native:btc`, `hedera:mainnet/native:hbar`, `fiat:EUR` |
| `quantity` | Positive Ganzzahl als Dezimalstring `atoms` plus `scale`; niemals JSON-Float. Das Backend prüft die zum Asset/Rail zugelassene Skala. | BTC on-chain: sat/8; Lightning: msat/11; HBAR: tinybar/8; EUR: Cent/2 |
| `action_code` | Vom Backend verwalteter Katalog, nicht frei interpretierter Client-Text. | Bewegung: `send`, `receive`, `refund`, `fee`; Trade: `buy`, `sell`, `swap` |
| `native_ref` | Native Referenz mit Namespace und Unterindex. Derselbe Tx kann mehrere Wallet-/Asset-Bewegungen enthalten. | Bitcoin-TxID + Output, Lightning-Payment-Hash, Spark-Transfer-ID; bei heutigem HBAR-Netto-Delta pro Konto Hedera-Transaktions-ID mit Unterindex `0` |

Die Kennungen sind **OPAGO-Katalogwerte** in einer offenen `namespace:reference`-Struktur. Sie sind nicht automatisch CAIP-konform. Wo ein eindeutiger CAIP-2/-19-Wert vorhanden und für die jeweilige Chain freigegeben ist, kann der Katalog ihn als Alias führen. Neue Coins, Token, Netze und Rails erfordern einen versionierten Katalogeintrag samt Dezimalstellen, Identitäts-/Belegadapter und Tests; das Nachrichtenformat selbst muss dafür nicht geändert werden. Unbekannte Kennungen werden abgelehnt oder explizit in eine Prüfwarteschlange gestellt, nie als BTC umgedeutet. Bereits verwendete Kennungen und Skalen sind unveränderlich.

## Vorgänge und Lieferumfang

Der **jetzige Umsetzungsumfang** ist die Grundlage für BTC on-chain/Lightning/Spark und HBAR (Senden/Empfangen), einschließlich Konto-/Wallet-Bindung, dauerhafter Outbox, Abgleich und unabhängiger Zahlungsprüfung. Buy/Sell, Fiat-Ein-/Auszahlung und Swap sind **spätere Integrationen**. Ihre Typen bleiben als Erweiterung im Entwurf und in synthetischen Schema-Beispielen; daraus folgt keine heute geschuldete Provider- oder Fiat-Anbindung.

| Nutzeraktion | Fachliche Darstellung |
|---|---|
| BTC senden/empfangen – on-chain, Lightning oder Spark | `movement` mit BTC-Asset, passendem Rail und `outgoing`/`incoming`; BTC on-chain und Lightning können zum selben Wallet-Saldo gehören, bleiben aber unterschiedliche Zahlungswege. |
| HBAR senden/empfangen | `movement` mit Hedera-Netz, HBAR-Asset, Hedera-Rail und tinybar-genauem Betrag. |
| BTC/HBAR kaufen (später) | `trade(action_code=buy)` mit Fiat-Gegenwert, Order-/Anbieter-ID und später verknüpfter `incoming`-Bewegung. Ein Eingang ohne geprüfte Order ist kein Kauf. |
| BTC/HBAR verkaufen (später) | `trade(action_code=sell)` mit Asset-Abgang und Fiat-Gegenwert. Die Fiat-Auszahlung und die Coin-Bewegung brauchen getrennte Nachweise; der Status kann bis dahin teilweise abgeschlossen sein. |
| Swap oder künftiger Coin (später) | `trade(action_code=swap)` mit zwei registrierten Assets und beliebig vielen Bewegungen; neues Asset/Netz über Katalog/Adapter. |

Gebühren sind eigene `AssetAmount`-Einträge am Trade oder eigene Bewegungen. Ein Trade darf `estimated`-Werte enthalten; `settled` verlangt ausgeführte Basis- und Gegenwerte sowie Referenzen für beide Seiten. Diese Referenzen sind **noch keine** geprüften Belege: Für eine Fiat-Kartenzahlung oder Auszahlung benötigt die interne API eine unabhängige Providerbestätigung. Bei Teilfüllung/Refund bleiben alle Originalbeobachtungen erhalten und werden durch neue Revisionen ergänzt. Mehrere Wallets derselben Partei dürfen denselben wirtschaftlichen Vorgang aus verschiedenen Blickwinkeln beobachten; die interne API verhindert Doppelzählung pro Wallet-Rolle und wirtschaftlicher Identität.

## API- und Sicherheitsgrenze

Die vorgeschlagenen v3-Routen, Klartext-Nachrichten, Authentifizierung, HPKE-Wiederholungen und HBAR-Kontobindung sind in [PROTOCOL-V3.md](PROTOCOL-V3.md) festgelegt. Die Public API prüft Transport, Größe und Authentifizierung und reicht an die interne API weiter. Die interne API bindet jede Beobachtung an ein serverseitig bekanntes Wallet/Konto, validiert registrierte Asset-/Netz-/Rail-Kombinationen, native Referenzen und Sequenz/Idempotenz und holt unabhängige Belege ein. Ein Spark-BIP-340-Nachweis aus 0.2.0 autorisiert **nicht automatisch** eine Hedera-Wallet; die v3-HBAR-Bindung verwendet den eigenen Ed25519-Schlüssel. Erst diese Bindung erlaubt HBAR-Ingest.

Keine App-Meldung darf allein Guthaben, Fiat-Settlement, AML-/Travel-Rule-Abschluss oder die Identität des Zahlers bestätigen. Der Provider-Orderstatus ist ebenfalls nur ein Hinweis, bis die interne API ihn über einen vertrauenswürdigen Providerkanal prüft. Fehlende externe Belege müssen als unvollständige Abdeckung sichtbar bleiben.

## Migration von 0.2.0

Die bestehenden `/api/v2/wallet/transactions`-Routen bleiben für Spark-/BTC-Clients bestehen. Ein interner Adapter normalisiert `amount_msat` als BTC mit `scale=11`, `type=lightning|spark_transfer|onchain|onramp` in die neue Bewegungsansicht und leitet `mainnet|regtest` auf den registrierten Bitcoin-Netzbezeichner ab. `onramp` allein erzeugt **keinen** nachgewiesenen Buy-Trade. **[MIGRATION.md](MIGRATION.md)** definiert die getrennten Quell-/v2-/v3-Cursor, die v2-Barriere, den überlappenden Nachlauf und die serverseitige Deduplizierung samt Fehlerfällen. Die v2-HPKE-Transporthülle und ihre Widerrufs-/Retry-Regeln gelten weiter, bis die v3-Routen separat freigegeben sind.

Vor Freigabe des **jetzigen** Umfangs erforderlich: Katalog für BTC/HBAR und Netze, serverseitige HBAR-Kontobindung, v2→v3-Migration und Negativ-/E2E-Tests für doppelte/fehlende Chain-Ereignisse, Gebühren, Reorg/Statuskorrektur, falsches Netz/Asset und Replay. Fiat-/Order-Belege, Teilfüllungen und Refunds sind eigene Gates für die spätere Buy/Sell-/Swap-Integration. Dieser Entwurf ist ein überprüfbarer Vertragsvorschlag, kein bereits implementierter Dienst.

Die synthetischen Beispiele und Gegenfälle lassen sich mit `npm run contract:multiasset:verify` prüfen.

## Quellen für Kennungen und Einheiten

- [CAIP-19 Asset Type and Asset ID](https://standards.chainagnostic.org/CAIPs/caip-19) beschreibt ein offenes, netzbezogenes Kennungsformat; OPAGO verwendet hier zunächst einen eigenen registrierten Katalog.
- [Hedera-Chain-Kennungen](https://namespaces.chainagnostic.org/hedera/caip2) sind als Entwurf veröffentlicht; der Katalog darf die bekannten Hedera-Netze entsprechend zuordnen.
- [Hedera SDK: tinybar mit acht Dezimalstellen](https://docs.hedera.com/hedera/sdks-and-apis/sdks/smart-contracts/ethereum-transaction) und [Lightning-Zahlungen in Bitcoin](https://docs.lightning.engineering/the-lightning-network/overview) begründen getrennte Einheiten/Rails bei gemeinsamem Asset.
