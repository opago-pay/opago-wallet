# Ein Bitcoin-Guthaben: Implementierung und Abnahme

Stand: 21. September 2026. **Interner Testkandidat, keine öffentliche Zahlungsfreigabe.** Umsetzung des Auftrags in `output/agent-briefing/OPAGO_BITCOIN_UI_IMPLEMENTATION.md`; die bereits vorhandenen P01–P05-Änderungen wurden fortgeführt. Keine Schlüsseländerung, Wallet-Löschung, Zahlung oder Einzahlung mit echtem Geld durch die Automatisierung.

Nachfolgende Gestaltungsentscheidung des Eigentümers: Unter **Start** gilt wieder das vorherige Layout mit kompaktem Logo, Euroguthaben, Bitcoin-Karte und den drei runden Aktionen **Senden / Tauschen / Empfangen**. Die zusätzlichen Home-Erklärungen und die zwei großen Aktionsflächen entfallen. Die beschriebenen Guthaben-/Zahlungskorrekturen, Eingangshinweise und Sicherheitsfunktionen bleiben bestehen; die UI-Screenshots der ersten Implementierung zeigen deshalb nicht mehr die aktuelle Startansicht.

## Implementiert

- Native Bitcoin-Übersicht, Senden ohne vorgeschaltete Netzauswahl, gemeinsames Review, nachvollziehbare Ergebniszustände, Empfangsanfrage und separate Bitcoin-Adresse nach dem verlinkten UI-Konzept. HBAR, Checkout, Sicherheitsseite, Backup, Geräte-PIN und Spracheinstellungen bleiben erhalten. Alle neuen Quelltexte sind EN/DE/FR/ES übersetzt.
- Derselbe Spark-Wallet-Kontext bedient Lightning und Bitcoin-Auszahlungen. `satsBalance.available` ist die gemeinsame Quelle für Anzeige und Ausgabenprüfung. `owned` und `incoming` werden niemals addiert. `available=100, owned=140, incoming=30` bedeutet 100 ausgebbare Sats. Eingangsbeträge bleiben separat. Nur das nachgewiesen ältere Antwortformat fällt auf den verfügbaren `balance`-Alias zurück.
- Prüfsummen und Netzwerkvalidierung für P2PKH, P2SH, SegWit und Taproot; BIP-321/BIP-21-Parameter, ganzzahlige Satoshi-Beträge, BOLT11-Signatur und Betragsbindung. Unbekannte Pflichtparameter, mehrdeutige Beträge und ungültige Rechnungen werden abgelehnt. Zulässige optionale Wiederholungen bleiben möglich. Bei abgelaufenem Lightning-Teil ist eine gültige Onchain-Adresse ausdrücklich neu zu prüfen. Nach Übermittlung kein automatischer Wechsel des Zahlungswegs.
- Echte `getWithdrawalFeeQuote`-/`withdraw`-Adapter, Gebührenbestandteile und frischer Ausgabencheck. `deductFeeFromWithdrawalAmount: false` erhält den angezeigten Empfängerbetrag; Gebühren kommen hinzu. Review und Gerätefreigabe sind an den unveränderlichen Auftrag gebunden. Ein Scan oder Einfügen ruft die signierende Onchain-Vorbereitung nicht auf.
- Dauerhaftes Onchain-Journal vor SDK-Eintritt, Abgleich über Provider-ID bzw. exakte Quote-ID, prüfbarer Broadcast und bestätigter Empfängerausgang. Doppeltippen und unklare Rückgaben führen nicht zu einem erneuten `withdraw`. Der Ergebnisbildschirm gleicht den Status automatisch ab und bietet eine manuelle Abfrage.
- Echte statische Bitcoin-Adresse, bestätigte UTXO-Erkennung, überprüfte Transaktionsdaten und `getClaimStaticDepositQuote`/`claimStaticDepositWithMaxFee`. Der Nutzer prüft Bruttoeingang, höchste freigegebene Gebühr und Nettogutschrift. Ein Transfer-Identifier allein bedeutet noch keine Verfügbarkeit. Nach einer geteilten Adresse läuft die Eingangserkennung auch auf Home weiter, erst nach dem Bitcoin-Guthaben.
- Frühere und abgelaufene Lightning-Anfragen bleiben anhand Request-ID/Payment-Hash nachverfolgbar; eine neue Anfrage löscht diesen Verlauf nicht. Onchain-Deduplizierung nach Netzwerk und `txid:vout`. Betrag/Zeitpunkt werden nie zum Zuordnen einer Einzahlung zu einer Lightning-Anfrage verwendet.

## Gemeinsamer QR: ausdrücklich Zwischenstand

**Empfang stellt derzeit eine Lightning-Anfrage und eine separate Bitcoin-Adresse bereit.** Der Parser kann kombinierte Bitcoin-URIs verarbeiten; die App erzeugt sie noch nicht als gemeinsamen Empfangscode.

Eine gemeinsame statische Adresse identifiziert keine konkrete Rechnung. Auch Ablauf, Gebühren und Brutto-/Nettobetrag sind zwischen den Wegen verschieden. Die untersuchten statischen SDK-Endpunkte liefern keine zuverlässige einzelne Rechnungszuordnung. Vor Aktivierung eines gemeinsamen QR sind eindeutig zuordenbare Adressen/Provider-Referenzen einschließlich Wiederherstellung, Betragssemantik, Gebühren und externe Senderkompatibilität zu belegen. Zwei echte Eingänge dürfen nicht zu einem angeblich einzigen Zahlungseingang zusammenfallen. Der alternative Single-Use-Deposit-/Claim-Weg ist hierfür noch nicht integriert oder praktisch abgenommen.

## SDK, Netzwerke und technische Grenzen

Expo 54, React Native 0.81.5, Spark SDK **0.7.12 unverändert**. Direkte Abhängigkeiten auf die bereits installierten Versionen `@scure/btc-signer` 1.7.0 und `@scure/base` 1.2.6 dokumentieren die verwendete Bitcoin-Validierung. Android-Kandidat: Spark MAINNET und bisheriger expliziter Hedera-Mainnet-Build; keine neue Contract-Bereitstellung. Adaptertests nutzen REGTEST-Adressen und kontrollierte SDK-Doubles.

| SDK-Eigenschaft | Behandlung / verbleibende Grenze |
| --- | --- |
| Gebührenabfrage kann intern Leaves umordnen und signieren | Erst nach ausdrücklicher Vorbereitung und Gerätefreigabe. Scan/Paste bleiben ohne diesen Aufruf. Ein Timeout hält die parallele Vorbereitung gesperrt, bis der tatsächliche SDK-Aufruf endet. |
| Kein Client-Idempotenzparameter bei `withdraw` | Lokaler Auftrag vor SDK-Eintritt; Wiederaufnahme über Quote-ID. Nicht erfundene SDK-Idempotenz. Unklare Auszahlungen blockieren vorsorglich weitere Onchain-Auszahlungen. |
| Prozessende im Übergang Persistenz → SDK | Ohne Provider-Nachweis bleibt „wird geprüft“. Auch ein tatsächlich noch nicht abgesendeter Auftrag kann deshalb blockiert bleiben. Kein unsicherer „erneut senden“-Knopf. Providergestützte endgültige Fehler-/Freigabeprüfung ist vor öffentlichem Start noch nötig. |
| SDK-Aufrufe können nicht zuverlässig abgebrochen werden | Sitzung vor/nach asynchronen Schritten geprüft; keine neuen Aufträge nach Sperre. Bereits an das SDK übergebene Arbeit kann nach UI-Timeout/Sperre weiterlaufen. Echte Unterbrechungs-/Sperrtests und SDK-interne Signaturabbruchmöglichkeiten bleiben offen. |
| Statische Einzahlungsabfrage liefert bestätigte UTXOs | Kein erfundener Mempool-Status. Vor Erkennung wird auf erforderliche Bitcoin-Bestätigung hingewiesen. Keine feste Zahl von Bestätigungen oder garantierte Wartezeit zugesagt. |
| Claim-Quote benötigt bereits `txid:vout` | Vor Einzahlung wird die Gebührenregel erklärt, kein Festpreis/Mindestbetrag erfunden. Nach Eingang echte Quote; teurere Claim-Quote erfordert erneute Prüfung. Keine automatische Claim-Freigabe. |
| Unklare Claim-Antwort | Weiter nach UTXO/Provider-Request/Transfer abgleichen, kein erneuter Claim aufgrund eines Transportfehlers. Endgültig gescheiterte Claims brauchen noch eine praktisch bestätigte Wiederaufnahme-/Rückabwicklungsstrategie. |
| Unabhängige Bruttobetragsprüfung | Mainnet-Rohtransaktion über festes `mempool.space/api`, anschließend Hash, Output und Adressskript prüfen. Zusätzliche Providerabhängigkeit; Ausfall verhindert die Freigabe. Für REGTEST fehlt ein konfigurierter Electrs-Zugang; der native Claim lehnt dort kontrolliert ab. |
| Beschränkte Abfragen | Höchstens 20 × 50 Provider-Requests pro Abgleich, 20 statische Adressen × 10 × 100 UTXOs; drei archivierte Lightning-Anfragen rotierend je Polling-Runde. Fokus-/Sitzungsbindung und 15-Sekunden-Pause. Sehr große Historien benötigen weiterführende Pagination. |
| Wiederherstellung nur aus Recovery-Wörtern | Schlüssel und verfügbare Mittel bleiben SDK-basiert wiederherstellbar; lokale Quote-/Review-/Rechnungsreferenzen sind nicht Bestandteil der Wörter. Vollständiger Wiederaufbau alter Onchain-Auszahlungen ohne lokales Journal ist noch nicht implementiert. Kein vollständiger Wiederherstellungstest behauptet. |

Maßgeblich sind die installierten SDK-Quellen, besonders `spark-wallet.ts` sowie `graphql/objects/CoopExitRequest.ts`, `CoopExitFeeQuote.ts` und `ClaimStaticDeposit.ts`. Ergänzende Primärquellen: [BIP 321](https://github.com/bitcoin/bips/blob/master/bip-0321.mediawiki), [Spark withdraw](https://docs.spark.money/api-reference/wallet/withdraw), [statische Adresse](https://docs.spark.money/api-reference/wallet/get-static-deposit-address), [Static Deposit Claim](https://docs.spark.money/api-reference/wallet/claim-static-deposit).

## Daten und Migration

- Bestehender interner Präsentationsschlüssel `lightning` bleibt als Kompatibilitätsalias für das Asset Bitcoin erhalten. Keine globale Speicherumbenennung, neue Seed-Ableitung oder Änderung bestehender HBAR-Schlüssel.
- Alte geschützte Home-Vorschauen enthalten möglicherweise die frühere Addition eingehender Beträge. Nur dieser Bitcoin-Vorschauwert wird verworfen, bis ein neuer Wert mit `definition: available` vorliegt. HBAR-/Kursvorschauen bleiben erhalten. Das erste Entsperren nach dem Update kann deshalb zunächst einen Ladezustand zeigen.
- Neues Journal `opago.bitcoin.operations.v1`, Empfangsarchiv `opago.bitcoin.receive-tracking.v1` und Adressüberwachung `opago.bitcoin.deposit-watch.v1`; jeweils nach Spark-Identität und Netzwerk getrennt. Keine privaten Schlüssel darin. Höchstens 10.000 Journal-/Archivdatensätze; volle/defekte Speicher brechen kontrolliert ab statt offene Aufträge zu vergessen.
- Vorhandene Empfangsanfrage bleibt gespeichert, wird validiert und an Wallet/Netzwerk gebunden. Archiv enthält Request-ID/Hash/Betrag/Ablauf, keine vollständige Rechnung oder freie Beschreibung. Frühere Lightning-/HBAR-Journale und History-Daten bleiben bestehen.
- Wallet-Entfernung invalidiert die laufende Sitzung zuerst, löscht neue Stores und leert serialisiert die Transaktionsdatenbank. Bereits wartende alte Schreibzugriffe dürfen die gelöschte Historie nicht wieder befüllen.

## Automatische und native Nachweise

`npm run typecheck`, `npm run lint` und `npm test`: **270 Tests bestanden, keine Fehler**. Zusätzlich ESLint für die neuen Adapter/Hooks und die Datenbank. Android-Release-Build einschließlich beider nativer Seed-Ableitungstests erfolgreich; finale Artefakt-/Installationsnachweise werden in `PUBLIC_RELEASE_READINESS.md` ergänzt.

Neue ausführbare Fälle prüfen verfügbare gegenüber eingehenden/reservierten Beträgen, exakte Dezimalwerte, Adress-/URI-Netzwerke, Konflikte, Quote-Ablauf, frisches Guthaben, Gebührenaddition, Doppelsenden, Unterbrechung und erneutes Einlesen des Journals, Rohtransaktionsnachweis, Claim-Gebührenanstieg, sichere unbekannte Claims, Sperre, reine Scan-Erkennung, Archivierung alter Anfragen, getrennte Wallets, Adressüberwachung und Löschen während einer Datenbankschreiboperation.

Native Sichtprüfung auf Android 14, UMIDIGI G7, 720 × 1280: **isoliertes Paket `com.opago.wallet.bitcoinpreview` mit synthetischen Daten, deaktiviertem Netzwerk und echten Produktionskomponenten**. Home, Zieleingabe, Betrag, beide Reviews, Empfang, Lightning-QR, Bitcoin-Adresse, offener und bestätigter Ergebniszustand in EN/DE/FR/ES aufgenommen. Geöffnete Tastatur, 320 dp Breite und 1,4-fache Systemschrift zusätzlich geprüft. Nach Schriftwechsel ist ein Kaltstart nötig, damit Android die Textlayouts neu berechnet; ohne diesen Neustart wurden abgeschnittene Beschriftungen beobachtet. Nach Kaltstart sind Kosten und CTA vollständig sichtbar bzw. erreichbar. Ursprüngliche Schrift-/Dichteeinstellungen wiederhergestellt. Screenshots, Prüfhilfen und Build-Logs liegen ausschließlich im ignorierten `.codex-local-evidence/bitcoin-native-qa/`; keine Nutzer-Wallet-Inhalte aufgenommen. Test-App ist kein Nachweis einer SDK-Zahlung. Claim-Review mit einer echten Einzahlung, Android TalkBack, iOS VoiceOver und vollständige native Rücknavigation sind noch separat abzunehmen.

Echter Kandidat am 21. September um 13:00:05 auf Android …8690 installiert; 65 Quellmodule und installierter APK-Hash abgeglichen, Wallet-Daten erhalten. Gesperrter Kaltstart ohne beobachtete Laufzeitfehler. Die letzte kleine Ergänzung der Betragsvorschau beim Empfang und die Adressüberwachung sind im finalen Build automatisch geprüft; die Sprach-Screenshots stammen aus dem vorangehenden isolierten UI-Build. Neue Guthaben-/Zahlungsmessung nach Eigentümerfreigabe bleibt offen. Details in `PUBLIC_RELEASE_READINESS.md`.

## Konkrete externe Abnahmefälle – noch nicht ausgeführt

| Gegenstelle | Zu testen | Stand |
| --- | --- | --- |
| Wallet of Satoshi | Lightning-Code kopieren/scannen, LNURL mit Betragseingabe, Zahlung in beide Richtungen; Gebühren und bestätigten Betrag prüfen | Offen; installierte Version bei Durchführung erfassen |
| Bitcoin Core oder Electrum | Gültige Mainnet-Adresse/Bitcoin-URI, Auszahlung aus demselben verfügbaren Spark-Guthaben, Empfängerbetrag ohne Gebührenabzug, Broadcast → Bestätigung | Offen; keine automatisierte Mainnet-Zahlung |
| Electrum als Sender ohne Lightning-Unterstützung | Separate reine BTC-Adresse scannen/kopieren; Einzahlung, bestätigtes `txid:vout`, echte Claim-Quote, Gebühr freigeben, Nettoguthaben und einmaligen Historieneintrag prüfen | Offen; Version und tatsächliche Unterstützung bei Test erfassen |
| Wallet mit kombinierter URI-Unterstützung | Lightning-/Onchain-Wahl, Ablauf, widersprüchliche Beträge, Brutto/Netto, zwei echte Zahlungen | Gemeinsamer Empfangscode bleibt bis eindeutiger Zuordnung und Abnahme deaktiviert |
| HashPack | Vorhandenes HBAR-Konto über erweiterte Optionen: QR, direkter Transfer und unveränderte bestehende Schlüssel | Regression auf echtem Gerät offen |

Bei Rückkehr des Eigentümers zuerst ohne Zahlung entsperren, Home/Empfang/Adressalternative und Scan prüfen. Für kleine reale Zahlungen Empfänger und Betrag ausdrücklich vereinbaren; niemals Testadressen aus Screenshots verwenden. Danach mit kontrollierten Beträgen Neustart, Netzverlust, verspätete Rechnung, zwei gleich hohe Eingänge, falsches Netzwerk und Gerätefreigabe-Abbruch prüfen. Die Gebühr kann einen kleinen Testbetrag übersteigen; ausschlaggebend ist das tatsächliche Review.

## Abnahmestand des Auftrags

Automatisch belegt: verfügbare Guthabendefinition, Parser und HBAR-/LNURL-Regressionssuite, Betrags-/Gebührenbindung, konservativer Schutz gegen doppelte Onchain-Übermittlung, Claim-Adapter, Archiv/Deduplizierung, Update-Migration und getrennte Wallet-Daten. Nativ mit synthetischen Daten geprüft: Gestaltung und Hauptansichten.

**Offen:** echte Lightning-/Onchain-/Claim-Protokollabnahme, gemeinsamer Empfangscode mit eindeutiger Zuordnung, providerbestätigte endgültige Fehlerbehandlung, Wiederherstellung ohne lokales Onchain-Journal, Partner-Versionen, zweite Android-Hardware, iOS, Screenreader und erneute Ladezeitmessung des finalen Builds. Daher weder vollständige Zielbild-Umsetzung noch Produktionsreife behauptet.
