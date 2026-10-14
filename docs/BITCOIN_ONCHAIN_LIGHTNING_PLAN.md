# Bitcoin Onchain und Lightning mit getrennten Guthaben

Stand: 14. Oktober 2026. Grundlage ist `origin/mvp-branch` bei `4a6029d39b844dca8c6ceb4bbf90910b576f2570` mit Spark SDK 0.7.12. Status: Wallet-Implementierung im isolierten Zweig `codex/bitcoin-onchain-balances`; noch keine Mainnet-Freigabe. Der folgende Produktplan bleibt die Abnahmegrundlage.

OPAGO erhält eine eigene Bitcoin-Onchain-Wallet neben dem bestehenden Spark-Guthaben für Lightning. Eingehende BTC bleiben standardmäßig auf der gewählten Empfangsseite. Nutzer können BTC halten, direkt onchain versenden oder einen selbst gewählten Betrag in beide Richtungen übertragen. Home behält **Empfangen** und **Senden**. Sobald der Euro-Kauf über MoonPay verfügbar ist, kommt **Kaufen** als dritte Aktion hinzu. Die Übertragung zwischen eigenen Guthaben ist über die Guthabeneinträge unter **Alle Coins** erreichbar. Diese Navigation ersetzt den ursprünglichen Vorschlag eines globalen Tauschen-Buttons und wurde am 14. Oktober bestätigt.

## Implementierungsstand

Die Wallet enthält jetzt die separate BIP84-Ableitung mit BDK RN 1.1.0, eigene Onchain-Adressen, bestätigte und reservierte UTXOs, Gebührenprüfung, Signatur und dauerhaft gespeicherten Broadcast. Spark bleibt eine unabhängige Guthabenquelle. Beide Übertragungsrichtungen sind als eigene Bildschirme umgesetzt, einschließlich zweiter Claim-Freigabe, Rückholung mit festem Outpoint und Wiederaufnahme gespeicherter Aufträge. Bisherige Spark-Adressen behalten ihren Empfangs- und Claim-Weg und können in den Rückholablauf übernommen werden.

Home zeigt drei Guthaben unter dem unverändert zunächst eingeklappten „Alle Coins“. Die kompakten Guthabendetails öffnen sich von unten. Quelle, Richtung und Gebühren werden in den Zahlungsbildschirmen angezeigt. Interne Vorgänge werden anhand ihrer gespeicherten Referenzen im Verlauf zusammengeführt. Unvollständige oder zeitlich widersprüchliche Übertragungsbestände ergeben keinen scheinbar vollständigen Gesamtwert. EN/DE/FR/ES/IT sind berücksichtigt.

BDK 1.1.0 wird für Android arm64-v8a und x86_64 eingebunden; 32-Bit-Android ist damit nicht unterstützt. Die iOS-Pakete enthalten arm64 für Gerät und Simulator; Intel-Simulatoren sind nicht abgedeckt.

Nachgewiesen sind der vollständige native Android-Debug-Build für arm64-v8a und x86_64 sowie der Android/Hermes-Bundle-Export. Automatisierte Prüfungen decken BIP84-Vektoren, Schlüssel-/Netzwerktrennung, SQLite-Reservierungen, Wiederaufnahme, Claim-/Refund-Konflikte, Kontobindung, verlorene Antworten, Verlauf und bestehende Wallet-Funktionen ab. Native Lifecycle-Tests ersetzen Geräteprüfungen nicht. Letzter vollständiger Lauf: 922 Tests, davon 921 bestanden, einer übersprungen, kein Fehler; TypeScript und ESLint ohne Fehler. Der zusätzliche Testnetz-Hinweis folgt dem tatsächlichen Onchain-Netzwerk, auch wenn Spark anders konfiguriert ist.

**Noch erforderliche Freigaben:** iOS-Build und Geräteprüfung; echte Regtest-End-to-End-Transaktionen einschließlich Restore, Wechselgeld, Claim und Refund; produktiver Backend-Vertrag und dessen Ende-zu-Ende-Synchronisierung. Es wurden keine echten Gelder verwendet. `lib/onchain/release.ts` sperrt Mainnet unabhängig vom Umgebungs-Schalter, bis diese Nachweise vorliegen. Eine Veröffentlichung ohne Konto-Synchronisierung erfüllt den vereinbarten Umfang nicht.

### Konto-Synchronisierung: konkret vorbereitete Schnittstelle

`lib/onchain/account-sync.ts` implementiert einen dauerhaften, privaten Ausgang mit Eigentümerbindung, stabilen Idempotenz-IDs, geordneten Statusänderungen, Wiederholungen nach verlorenen Antworten und Prüfung der Empfangsbestätigung. `account-sync-native.ts` bindet diesen an die bestehende OPAGO-Anmeldung, Installation, Wallet und Kontogeneration. Der Vordergrund-Abgleich und die Seite „Transaktionsabgleich“ verwenden diesen Ausgang. Ohne Backend-Port bleibt jede Meldung unbestätigt; andere Meldeströme arbeiten unabhängig weiter.

Die Schnittstelle `opago-onchain-v1` ist **ein Vorschlag, kein behaupteter produktiver Vertrag**. `F3Integration.onchainSync` akzeptiert später eine ausdrücklich geprüfte Integration. Der untersuchte `opago-compliance`-Stand enthält im v3-Vertrag bislang die Rails `spark`, `lightning` und `hedera`, aber keinen ausführbaren Onchain-Reportpfad. Deshalb wurde kein erfundener Endpunkt angesprochen und keine neue Zahlung als Lightning maskiert.

Der Backend-Abgleich benötigt:

- Eigentümerbindung aus der bestehenden HKA-/OIDC-Anmeldung und einen nachgewiesenen Bezug des Onchain-Descriptors zum registrierten Wallet; ein vom Client gesendeter Scope allein ist kein Eigentumsnachweis.
- Versionierte Ereignisse `payment`, `internal_transfer` und `legacy_deposit`; Netzwerk und Konto `bitcoin_onchain`; stabile Ereignis-ID; Beträge als ganzzahlige Satoshi-Zeichenfolgen; getrennte Netzwerk-, Service-, gesamte und Claim-Gebühren. Angebote und tatsächlich belegte Gebühren müssen unterscheidbar bleiben.
- Zustände `prepared`, `pending`, `confirmed`, `claim_required`, `claim_checking`, `completed`, `refund_checking`, `refunded`, `canceled`. Status kann durch Reorganisation wieder unsicher werden; Empfang einer Meldung ist keine Zahlungsbestätigung.
- Exakte Referenzen für Bitcoin `txid:vout`, Spark-Auftrag/Transfer und Rückholtransaktion; unabhängige Prüfung beider Seiten. Keine Zuordnung allein nach Betrag oder Uhrzeit; keine doppelte Einnahme aus einer internen Übertragung.
- Idempotenz je Eigentümer/Installation und Auftrags-ID, unveränderliche Nutzlast je Idempotenz-ID, persistente Reihenfolge bzw. Revisionen sowie eine Antwort mit Ereignis-ID, Eigentümer, Scope, Idempotenz-ID und Receipt-ID. Authentifizierungsfehler dürfen keine lokale Quittierung auslösen.
- Testfälle für Offline-Nachlieferung, verlorene Antworten, Eigentümerwechsel, Neuinstallation, Rückholung, Reorganisation und beide Transfer-Richtungen. Erst anschließend darf die Live-Integration eingetragen und das entsprechende Freigabefeld gesetzt werden.

Die konservative Adresssuche verwendet eine Lücke von 100 unbenutzten Adressen. Neue Empfangsanfragen verwenden die nächste unbenutzte Adresse, statt beim wiederholten Öffnen beliebig große Lücken zu erzeugen. Wallets mit größeren extern erzeugten Lücken benötigen vor Freigabe einen erweiterten Rescan. Frühere interne Zuordnungen ohne lokale Auftragsdaten werden nicht erfunden; Guthaben und alte Spark-Eingänge sind separat wiederauffindbar.

## Festgelegtes Produktverhalten

- Home behält den Gesamtwert in Euro. Die Aktionen erscheinen in der bisherigen Reihenfolge **Empfangen · Senden**, später **Empfangen · Senden · Kaufen**. Kaufen wird erst mit einem funktionierenden Euro-Kauf angezeigt.
- Unter **Alle Coins** stehen getrennte Guthaben für **Bitcoin** mit dem Zusatz **Onchain** und **Lightning**. Dies entspricht der Nutzerentscheidung vom 14. Oktober. HBAR bleibt als eigener Eintrag erhalten.
- **Alle Coins bleibt wie bisher zunächst eingeklappt.** Das bestehende Verhalten (`advancedExpanded` initial `false`) bleibt erhalten; es wird keine neue dauerhafte Speicherung des Aufklappzustands eingeführt. Die aufgeklappte Vorschau diente nur dazu, alle Einträge zu zeigen.
- Beide Bitcoin-Guthaben werden zum selben BTC/EUR-Kurs bewertet. Der Gesamtwert umfasst jeden eigenen Bestand genau einmal.
- Übertragen unterstützt **Bitcoin → Lightning** und **Lightning → Bitcoin**. Der gewählte Guthabeneintrag bestimmt die anfängliche Richtung; sie lässt sich vor der Vorbereitung wechseln.
- Die Ziele beim Übertragen gehören immer derselben Wallet. Es gibt kein Feld für eine externe Empfängeradresse.
- Bitcoin und Lightning bezeichnen hier zwei Guthabenbereiche desselben Assets BTC. Satoshis bleiben die interne Betragseinteilung. Es gibt keinen eigenen BTC/SAT-Wechselkurs und keinen erfundenen Kursspread.
- Im Bitcoin-Onchain-Guthaben heißt die Aktion **Zu Lightning übertragen**, im Lightning-Guthaben **Zu Onchain übertragen**. Englisch: **Move to Lightning** beziehungsweise **Move to on-chain**. Eine kurze Erklärung lautet: „Verschiebe Bitcoin zwischen deinem Onchain- und Lightning-Guthaben. Dabei fallen Gebühren an.“ Die Informationen zum Lightning-Guthaben erläutern die Spark-Basis.
- Der gesamte Vorgang erscheint in der Aktivität als **Bitcoin → Lightning** beziehungsweise **Lightning → Bitcoin**, mit dem Typ **Umbuchung** und den tatsächlichen Gebühren.

## Startseite und Navigation

Die bestehenden QuickActions Empfangen und Senden bleiben erhalten. Der spätere Kaufen-Button verwendet dasselbe Layout und dieselbe Berührungsfläche. Kaufen ist ausschließlich für den Fiat-Kauf vorgesehen; es gibt keinen zusätzlichen Top-up- oder globalen Swap-Button.

Unter Alle Coins öffnet das Antippen eines Guthabens dessen Details mit Empfangen und Senden sowie der passenden Übertragen-Aktion für die beiden Bitcoin-Guthaben. Beide Übertragen-Aktionen öffnen dieselbe eigene Route `exchange-flow` mit vorbelegter Richtung, damit Entwurf und laufender Vorgang nach Navigation oder App-Neustart wieder aufgerufen werden können. Das Ziel ist bereits die eigene Wallet; es muss keine Adresse kopiert werden. HBAR erhält keine unbelegte Tauschfunktion.

Die Guthabendetails öffnen als kompakte, von unten einfahrende Ansicht (Bottom Sheet). Der Nutzer hat diese Darstellung ausdrücklich bestätigt. Die Ansicht richtet sich nach ihrem Inhalt und verdeckt nicht den gesamten Bildschirm; der obere Teil der Startseite bleibt sichtbar und wird abgedunkelt. Sie zeigt den Guthabennamen, Betrag, Eurogegenwert, Verfügbarkeit, Empfangen und Senden sowie bei den Bitcoin-Guthaben die passende Übertragen-Aktion. Gestaltung und Abstände orientieren sich an der bestätigten Vorschau `opago-start-guthaben.html` vom 14. Oktober. Ein Schließen-Symbol, Android-Zurück und Antippen des Hintergrunds schließen die Details. Eine Wischgeste nach unten darf ergänzen, ist aber nie die einzige Möglichkeit zum Schließen.

Das Sheet respektiert sichere Bildschirmränder, große Schrift, Screenreader-Fokus und reduzierte Bewegung. Auf kleinen Bildschirmen darf der Inhalt innerhalb einer begrenzten Höhe scrollen; Aktionen bleiben erreichbar. Das Öffnen der Details löst weder eine Signatur noch eine Geldbewegung aus. Das Schließen beendet nur die Ansicht und storniert keinen bereits übermittelten Auftrag.

**Bestätigte Navigation:** Nur die Guthabendetails erscheinen als Bottom Sheet. Empfangen, Senden und Übertragen öffnen danach eigene Bildschirme. Die Auswahl des Guthabens wird in den jeweiligen Ablauf übernommen und dort klar angezeigt. Bestehende HBAR-Funktionen einschließlich des Kopierens der Empfangskennung bleiben erreichbar. Die gesamte Zahlung wird nicht in das kompakte Detail-Sheet verlagert.

Der spätere Kaufablauf beginnt mit einem Eurobetrag und führt zu MoonPay zur Prüfung von Kurs, Gebühren und Zahlungsart. Das geplante erste Gutschriftsziel ist die eigene Onchain-Wallet. Die separate Übertragung zu Lightning bleibt danach verfügbar. Die MoonPay-Integration ist ein eigenes Vorhaben und kein Bestandteil der technischen Onchain-Freigabe.

Der Gesamtwert oben bleibt eine Euroanzeige. Alle Coins zeigt Bitcoin onchain, Lightning und HBAR getrennt; das bestehende Aufklappen bleibt erhalten. Für Onchain bietet sich BTC als primäre Einheit an, für Lightning Sats. Beide Zeilen zeigen zusätzlich den Eurowert. Der Darstellungswechsel darf die interne Betragsgenauigkeit nicht beeinflussen.

Lädt eine Guthabenquelle noch oder ist sie nicht erreichbar, zeigt ihre Zeile diesen Zustand statt null. Ein bereits bekannter Gesamtwert kann als letzter bekannter Wert erscheinen. Ein teilweise geladenes Portfolio darf nicht als vollständiger aktueller Gesamtwert dargestellt werden. Spark-Ausfall blockiert weder die Anzeige noch direkte Zahlungen aus der Onchain-Wallet.

Eine laufende Umbuchung erscheint als kompakter Status auf Home, etwa „Bitcoin → Lightning · Bestätigung ausstehend“. Dieser öffnet den bestehenden Vorgang. Schließen des Bildschirms bricht eine bereits übermittelte Transaktion nicht ab. Eine Gebührenfreigabe erhält die Aktion „Fortsetzen“.

Übertragen bleibt in den Guthabendetails bei null Guthaben auffindbar; die Richtungsseite erklärt den fehlenden verfügbaren Betrag und verlinkt auf Empfangen. Unbestätigte, reservierte und nicht verifizierte Bestände werden nicht als ausgebbar angeboten.

## Ablauf Bitcoin zu Lightning

1. **Richtung und Betrag:** Quelle Bitcoin onchain, Ziel eigenes Lightning-Guthaben. Betragsfeld **Für Lightning einzahlen**, Einheit BTC oder Sats. Ein Eurogegenwert ist eine Orientierung; der bestätigte Auftrag ist in ganzen Sats gebunden.
2. **Vorbereitung:** Eigene Spark-Einzahlungsadresse ermitteln und auf Wallet und Netzwerk prüfen. Verfügbare Onchain-Ausgänge auswählen, Wechselgeld bestimmen und eine Bitcoin-Transaktion vorbereiten. Vor dem Senden prüfen, ob Spark erreichbar ist und die Einzahlung grundsätzlich angenommen werden kann.
3. **Erste Prüfung:** Einzahlungssumme, konkrete Bitcoin-Netzwerkgebühr und Gesamtabbuchung anzeigen. Die spätere Spark-Übernahmegebühr ist hier ausdrücklich noch offen. Text: „Nach der Bitcoin-Bestätigung prüfst du die Gebühr für dein Lightning-Guthaben.“ Der Nettobetrag auf Lightning ist noch nicht garantiert.
4. **Einzahlung bestätigen:** Gerätefreigabe, dauerhafte Speicherung des Auftrags und der signierten Transaktion, anschließend Broadcast. Die genaue Einzahlungsreferenz `network + txid + vout` wird gespeichert.
5. **Warten:** Den eigenen Bitcoin-Ausgang und den Spark-Eingang abgleichen. Keine feste Wartezeit oder pauschale Anzahl Bestätigungen versprechen; der tatsächlich verwendete Provider muss die Verfügbarkeit melden.
6. **Zweite Prüfung:** Sobald der passende Eingang claimbar ist, eine Quote abfragen. Bruttobetrag, genaue Übernahmegebühr und Lightning-Nettogutschrift anzeigen. Eine erneute Gerätefreigabe gilt nur für diesen Eingang und diese Gebührenobergrenze.
7. **Für Lightning freigeben:** Den bestehenden Claim-Adapter verwenden. Ein Transfer-Identifier bedeutet noch keine abgeschlossene Gutschrift. Status und verfügbares Spark-Guthaben abgleichen, dann Umbuchung abschließen.

Beispiel mit frei gewählten Demonstrationswerten: Einzahlung 100.000 Sats, Bitcoin-Netzwerkgebühr 400 Sats, Gesamtabbuchung onchain 100.400 Sats. Die später angebotene Übernahmegebühr beträgt 300 Sats. Lightning erhält 99.700 Sats; die gesamten Kosten betragen 700 Sats. Diese Werte sind keine aktuellen Gebührenangebote.

Die erste Version nutzt bewusst zwei Freigaben. Die Wallet sperrt aktuell beim Wechsel in den Hintergrund; eine spätere Signatur darf nicht mit einer alten Sitzung oder einer bloß gespeicherten UI-Zustimmung fortgesetzt werden. Ein späterer Ablauf mit einer einzigen Freigabe benötigt ein gesondertes Konzept für eng begrenzte Autorisierung und Wiederaufnahme. Ein offenes Smartphone oder gespeicherter Seed ist dafür kein Ersatz.

Lehnt der Nutzer die zweite Gebühr ab, bleibt der Vorgang als **Freigabe ausstehend** erhalten. Es gibt **Später fortsetzen** und, nach gesonderter Gebührenprüfung, **Onchain zurückholen**. Die erste Netzwerkgebühr ist dann bereits angefallen. Die Rückholung nutzt die Spark-Refund-Funktion für den gesamten noch offenen Einzahlungsausgang abzüglich weiterer Netzwerkgebühr; deren Funktion auf beiden Plattformen ist ein Freigabekriterium.

## Ablauf Lightning zu Bitcoin

1. **Richtung und Betrag:** Quelle Lightning, Ziel eine neue eigene Onchain-Empfangsadresse. Betragsfeld **Onchain erhalten**; der Nutzer bestimmt damit den exakten Nettobetrag am Ziel.
2. **Gebühren vorbereiten:** Der Nutzer startet diesen Schritt ausdrücklich. Spark 0.7.12 kann bereits bei `getWithdrawalFeeQuote` interne Signaturen auslösen; daher den bestehenden Schutz durch Gerätefreigabe beibehalten. Es gibt keine solche Abfrage beim Öffnen, Tippen oder Richtungswechsel.
3. **Prüfung:** Zielbetrag, Bitcoin-Netzwerkgebühr, Spark-Servicegebühr und gesamte Lightning-Abbuchung gemeinsam anzeigen. Die eigene Zieladresse ist in den Details nachvollziehbar und an den Auftrag gebunden.
4. **Übertragung bestätigen:** Frisches verfügbares Guthaben und Quote-Ablauf prüfen. Bestehenden `withdraw`-Adapter mit `deductFeeFromWithdrawalAmount: false` wiederverwenden. So bleibt der angezeigte Zielbetrag erhalten und die Kosten kommen hinzu.
5. **Status:** Provider-Annahme, Broadcast und eigener Onchain-Eingang unterscheiden. Als abgeschlossen gilt der Vorgang erst nach nachgewiesener passender Onchain-Transaktion und der festgelegten Bestätigungspolitik.

Beispiel: Onchain erhalten 100.000 Sats, Netzwerkgebühr 1.000 Sats, Servicegebühr 200 Sats. Die Lightning-Abbuchung beträgt 101.200 Sats. Auch dies sind Demonstrationswerte.

Die unterschiedlichen Eingabebeschriftungen verhindern eine unklare Brutto-/Nettoauslegung. Bei Richtungswechsel werden Betrag, Gebührenquote und Freigaben zurückgesetzt. Ein „Max“-Knopf ist für den ersten Umfang nicht erforderlich. Er folgt erst mit nachgewiesener Berechnung des größten möglichen Zielbetrags einschließlich Gebühren. Der SDK-Modus mit Gebührenabzug wird nicht als Abkürzung eingesetzt: In SDK 0.7.12 übergibt dieser Pfad die Quote-ID nicht wie der heute verwendete Pfad.

## Normales Empfangen und Senden

Empfangen bietet Bitcoin onchain und Lightning als eindeutige Auswahl. Bei Bitcoin wird eine Adresse der neuen eigenen Onchain-Wallet erzeugt; eingehende BTC werden ohne Claim als Onchain-Eingang angezeigt und nach der Bestätigungspolitik verfügbar. Bei Lightning bleibt der bestehende Empfangsweg bestehen. Die letzte Auswahl kann gespeichert werden, muss aber vor dem Teilen des Codes klar sichtbar sein.

Senden an eine Bitcoin-Adresse verwendet standardmäßig Onchain-Guthaben. Der bereits vorhandene Weg **Aus Lightning-Guthaben senden** bleibt als ausdrücklich gewählte Alternative erhalten und zahlt direkt aus Spark an den externen Empfänger aus. So erzwingen wir keinen Umweg über die eigene Onchain-Adresse mit einer zusätzlichen Bitcoin-Transaktion. Quelle und Gebühren sind vor der Freigabe sichtbar. Übertragen zwischen Guthaben verwendet ausschließlich eigene Zielkonten.

Eine Lightning-Rechnung verwendet Lightning-Guthaben. Fehlt dort Geld und ist Onchain-Guthaben vorhanden, bietet die App **Zu Lightning übertragen** an und weist vorab auf Gebühren und Wartezeit hin. Nach der Umbuchung prüft der Nutzer die ursprüngliche Zahlung neu; insbesondere kann die Rechnung inzwischen abgelaufen sein. Es gibt keinen automatischen zweiten Zahlungsschritt oder stillen Wechsel der Finanzierungsquelle.

Während der Einführung können bestehende Auszahlungen aus Spark weiter intern benötigt werden. Bestehende Checkout- und Händlerabläufe werden vor Umstellung auf ihre bisherige Quelle geprüft. HBAR bleibt außerhalb der Übertragungen zwischen Bitcoin-Guthaben.

## Technische Grundlage

### Eigene Onchain-Wallet

BDK mit React-Native-Bindings ist der erste Integrationskandidat. Vor Festlegung sind ein iOS- und Android-Build mit Expo 54 und React Native 0.81.5, die verwendeten Gerätearchitekturen und die Einbindung in das vorhandene native Kryptomodul nachzuweisen. Die genaue Bibliotheksversion wird nach diesem Versuch festgeschrieben.

Die vorhandenen BIP39-Recovery-Wörter mit bisheriger Passphrase-Regel bleiben die Grundlage. Für Onchain wird ein eigener BIP84-Zweig verwendet, beispielsweise Mainnet `m/84'/0'/0'` mit getrennten Empfangs- und Wechselgeldketten. Testnet/Signet/Regtest verwenden getrennte Konfiguration und Speicherung. Bestehende Spark- und Hedera-Ableitungen werden nicht verändert.

Zu implementieren sind Adresserzeugung, persistierte Descriptor-/Adressindizes, Wiederherstellung mit Adresssuche, UTXO-Abgleich, Coin Selection, Wechselgeld, PSBT-Erstellung und Signatur, Gebührenprüfung und Broadcast. Die Wallet benötigt einen konfigurierten Bitcoin-Datenprovider, etwa Esplora/Electrum, mit Regtest-Unterstützung. Der heutige Mainnet-Rohtransaktionsabruf ist noch kein vollständiger Wallet-Synchronisierer.

Als konservativer V1-Standard werden eigene Onchain-Eingänge einschließlich Wechselgeld nach einer Bitcoin-Bestätigung auswählbar. Unbestätigte Eingänge bleiben sichtbar und nicht ausgebbar. Die Claim-Verfügbarkeit einer Spark-Einzahlung folgt zusätzlich den tatsächlichen Provider-Anforderungen. Eine Reorganisation kann den Status wieder ändern und muss den ausgebbaren Bestand neu berechnen.

Private Schlüssel bleiben lokal und werden nur in einer gültigen entsperrten Sitzung verwendet. Adresse und nächster Index werden vor dem Anzeigen dauerhaft gespeichert. Die Wiederherstellung darf sich nicht ausschließlich auf lokale Adressindizes verlassen. Rescan-Limits, wiederholte Empfangsanfragen ohne Zahlung und weit auseinanderliegende benutzte Adressen gehören zur Prüfung.

### Guthaben und Kontoidentität

Das Asset bleibt BTC. Neu ist eine separate Kontodimension, beispielsweise `bitcoin_onchain` und `bitcoin_spark`. Der vorhandene Präsentationsalias `lightning` wird nicht stillschweigend umgedeutet; gespeicherte Daten erhalten eine nachvollziehbare Migration. Zahlungsweg (`onchain`, `lightning`, `spark`) und Finanzierungsquelle bleiben getrennt.

Jede Quelle liefert bestätigten, verfügbaren, reservierten und ausstehenden Bestand sowie Aktualisierungszeit und Fehlerzustand. Spark-Verfügbarkeit kommt weiterhin aus den bestätigten verfügbaren Leaves; `owned` und `incoming` werden nicht einfach addiert. Onchain-Verfügbarkeit stammt aus überprüften, nicht reservierten Ausgängen.

Die Onchain-Kontoidentität besteht aus Netzwerk und einer aus dem Wallet-Descriptor abgeleiteten öffentlichen Identität. Sie darf nicht davon abhängen, dass Spark erfolgreich gestartet ist. Der Umbuchungsauftrag bindet beide Kontoidentitäten dauerhaft. Alte Vorschauwerte bleiben korrekt ihrer bisherigen Spark-Quelle zugeordnet.

### Dauerhafter Umbuchungsauftrag

Ein eigenes versioniertes SQLite-Journal speichert vor jedem externen Aufruf mindestens:

| Feldgruppe | Inhalt |
| --- | --- |
| Identität | lokale Operation-ID, Schema-Version, Wallet- und Netzwerkbindung |
| Richtung | Quellkonto und Zielkonto |
| Betrag | Eingabesemantik, Betrag in Sats, geprüfte gesamte Abbuchung und Zielbetrag |
| Kosten | freigegebene Netzwerk-/Servicegebühren, Claim-Obergrenze, tatsächliche Gebühren |
| Onchain | reservierte Inputs, eigene Zieladresse, signierte Transaktion, `txid:vout`, Ersetzungsbeziehungen |
| Spark | Quote-ID, Ablaufzeit, Provider-Request-ID und Transfer-ID |
| Fortschritt | aktueller Zustand, Zeitpunkte, belegte letzte Antwort und Wiederaufnahmebedarf |

Seed, private Schlüssel, Zahlungs-Preimages und Sitzungstoken gehören nicht in dieses Journal. Eine gespeicherte Gebührenfreigabe dokumentiert den Auftrag; sie berechtigt nach Sperre oder Neustart nicht zum Signieren.

Mögliche fachliche Zustände:

| Zustand | Anzeige und erlaubte Fortsetzung |
| --- | --- |
| Entwurf | Betrag ändern oder verwerfen |
| Prüfung | Angebot prüfen; veränderte oder abgelaufene Angebote erneut vorbereiten |
| Übermittlung wird geprüft | Existenz des bereits begonnenen Auftrags feststellen; keine zweite Übermittlung |
| Bitcoin-Bestätigung ausstehend | Onchain-Nachweis abgleichen; zur Startseite zurückkehren |
| Lightning-Freigabe ausstehend | konkrete Claim-Gebühr prüfen oder Rückholung vorbereiten |
| Lightning-Gutschrift wird geprüft | Provider-Nachweis und Spark-Guthaben abgleichen |
| Abgeschlossen | beide Seiten und tatsächliche Gebühren nachvollziehen |
| Rückholung läuft oder abgeschlossen | Rückholtransaktion unabhängig prüfen und zuordnen |
| Vor Übermittlung abgebrochen | Reservierungen kontrolliert freigeben |

Ein Transportfehler ist kein Beleg für eine fehlgeschlagene Zahlung. Lokale Reservierungen und Statusabgleich verhindern Doppelaufträge. Bei normalem Onchain-Broadcast kann dieselbe dauerhaft gespeicherte signierte Transaktion erneut gesendet werden; es wird keine neue Zahlung konstruiert. Bei Spark bestimmt der belegte Provider-Auftrag die Wiederaufnahme, da `withdraw` keinen Client-Idempotenzparameter anbietet.

Konfliktregeln gelten auch gegenüber normalem Senden. Ein reservierter Bitcoin-Ausgang kann nicht parallel ausgegeben werden. Ein unklarer Spark-Auszahlungsauftrag bleibt durch die bestehende Schutzlogik gesperrt. Claim und Refund desselben Eingangs dürfen nicht gleichzeitig beginnen.

### Gesamtwert und Historie

Quellabbuchung, Betrag unterwegs und Zielgutschrift gehören zu einem Auftrag. Der gleiche Betrag darf zu jedem Zeitpunkt nur einmal in die Portfolioanzeige eingehen. Bei fehlendem oder widersprüchlichem Nachweis wird der Gesamtwert als unvollständig bzw. zuletzt bekannt gekennzeichnet. Eine grobe Addition zweier unterschiedlich alter Guthabensnapshots reicht dafür nicht aus.

Die Aktivität zeigt einen Umbuchungseintrag mit Quelle, Ziel, Brutto-/Nettoangaben, Gebühren und technischen Referenzen in den Details. Zugeordnete interne Einzahlungs-, Claim- und Auszahlungsereignisse werden in dieser Darstellung zusammengeführt. Unabhängige externe Zahlungen bleiben sichtbar. Die Zuordnung verwendet exakte Auftrags- und Transaktionsreferenzen, niemals nur Betrag und Uhrzeit.

Bei Seed-Wiederherstellung werden vorhandene BTC zuerst anhand Chain und Spark wiedergefunden. Lässt sich eine frühere interne Zuordnung nicht beweisen, bleiben die Ereignisse getrennt und erhalten keine erfundene Umbuchungsbeziehung. Verfügbarkeit darf nicht von der Wiederherstellung alter lokaler Beschreibungen abhängen.

Der aktuelle OPAGO-Transaktionsvertrag bildet BTC nur über `spark` und `lightning` ab; `lib/opago/tx-sources.ts` lässt Onchain-Requests ausdrücklich aus. **Neue Onchain-Zahlungen und interne Umbuchungen werden ab der ersten Veröffentlichung mit dem OPAGO-Konto synchronisiert.** Der Nutzer hat dies ausdrücklich bestätigt; eine Veröffentlichung mit ausschließlich lokalem neuem Verlauf erfüllt den Umfang nicht. Dafür sind eine versionierte, zu bestehenden Clients kompatible Vertragserweiterung, Backend-Unterstützung und Ende-zu-Ende-Prüfung erforderlich. Neue Ereignisse werden nicht als Spark- oder Lightning-Zahlungen falsch einsortiert.

Die bestehende Kontoanbindung und ihre Anmelde-/Einwilligungsregeln bleiben maßgeblich. Lokale Journale ermöglichen Offline-Nutzung und spätere zuverlässige Synchronisierung. Der Kontoverlauf ist kein Beleg für ausgebbares Guthaben und darf unabhängig überprüfte Onchain-Funktionen bei einem Backend-Ausfall nicht blockieren. Fehlender Zugriff auf den erforderlichen Backend-Teil wird als konkrete offene Integrationsabhängigkeit dokumentiert; er wird nicht durch vorgetäuschte Sync-Erfolge oder einen stillen Wechsel zu ausschließlich lokalem Verlauf umgangen.

## Übernahme vorhandener Wallets

Bestehendes Spark-Guthaben erscheint künftig unter Lightning. BTC werden beim Update nicht bewegt. Die neue Onchain-Wallet wird aus demselben Seed abgeleitet und kann bereits bestehende BIP84-Ausgänge besitzen, wenn die Recovery-Wörter zuvor anderswo verwendet wurden; sie startet daher mit Synchronisierung statt einer pauschalen Nullannahme.

Bereits geteilte Spark-Einzahlungsadressen werden weiter überwacht. Noch offene Eingänge erscheinen als **Einzahlung auf bisherige Bitcoin-Adresse** mit den Aktionen **Für Lightning freigeben** und **Onchain zurückholen**. Sie zählen bis zur Prüfung weder als frei verfügbares Spark-Guthaben noch als gewöhnliche Ausgänge der neuen Onchain-Wallet. Neue Empfangscodes für Bitcoin verwenden die neue Adresse.

Eine vollständig neue Transaktion an eine alte geteilte Adresse muss auch nach dem Update auffindbar bleiben. Die Oberfläche erklärt bei alten Eingängen den zusätzlichen Schritt und die möglichen Gebühren. Wallet-Löschen invalidiert zuerst die Sitzung und leert danach auch neue Datenbanken, Vorschauen, Reservierungen und Adressindizes; verspätete asynchrone Ergebnisse dürfen sie nicht wieder anlegen.

## Umsetzung in sechs Arbeitspaketen

| Paket | Ergebnis | Abnahmekriterium |
| --- | --- | --- |
| 1 Native Integration und Wiederherstellung | BDK-Version und Datenprovider festlegen; eigene Adresse und Seed-Wiederherstellung | iOS/Android-Builds, BIP84-Testvektoren, echte Testnetz-Einzahlung, Wiederfinden nach leerer lokaler Datenbank; Spark offline möglich |
| 2 Onchain empfangen und senden | UTXO-Synchronisierung, Teilbeträge, Wechselgeld, Gebühren und dauerhafter Broadcast-Auftrag | Testnetz-Senden mit mehreren Eingängen, Staubgrenzen, Gebührenänderung, Neustart und parallelen Sendeversuchen |
| 3 Home und Kontentrennung | getrennte Guthaben unter Alle Coins, Guthabendetails mit Übertragen-Aktion, passende Empfangs-/Sendequelle; Kaufen folgt separat mit MoonPay | korrekte Gesamtwerte bei Teilladung, getrennten Provider-Ausfällen und Migration bestehender Spark-Werte |
| 4 Lightning zu Bitcoin | bestehende Auszahlung auf eigene Onchain-Adresse; Wiederaufnahme und ein Historieneintrag | exakter Zielbetrag und freigegebene Kosten; keine doppelte Auszahlung nach Timeout, Hintergrundwechsel oder Neustart |
| 5 Bitcoin zu Lightning und Rückholung | Einzahlung, zweite Claim-Freigabe, passende Gutschrift; Refund bei offenem Eingang | exakte Outpoint-Zuordnung, abgelehnte/verteuerte Quote, erfolgreiche Rückholung, Ausschluss paralleler Claim-/Refund-Aufträge |
| 6 Gesamtabnahme und Einführung | Migration, Wallet-Wiederherstellung, Übersetzungen, vollständige Konto-Synchronisierung und Geräteprüfung | vollständige Testmatrix, kontrollierte End-to-End-Testnetz-Transaktionen einschließlich Backend-Sync, Startzeiten und bestehende Lightning-/HBAR-/Checkout-Tests ohne Regression |

Paket 4 ist der erste vollständige Umbuchungsweg, weil der Auszahlungsadapter bereits vorhanden ist. Das Produktziel bleibt die Freigabe beider Richtungen. Ein unfertiger Gegenweg erscheint nicht als funktionsfähige Aktion. Neue Zahlungspfade werden erst nach ihrer Geräte- und Wiederherstellungsprüfung aktiviert.

## Testfälle mit besonderer Bedeutung

- Wiederherstellung allein aus Recovery-Wörtern: beide Guthaben, Wechselgeld, alte Spark-Adresse und mehrere verwendete Onchain-Adressen.
- Gleichzeitiges Senden und Übertragen, Doppeltippen, parallele Gerätesitzungen und ein inzwischen extern ausgegebener Bitcoin-Ausgang.
- Prozessende direkt vor/nach Speicherung, Signatur, Broadcast, Provider-Annahme und Claim. Nach Neustart keine doppelte Abbuchung.
- Änderung von Netzwerk, Wallet oder Sitzung während einer Vorbereitung; Hintergrundsperre und abgelaufene Gebührenquote.
- Betrag kleiner als Gebühren/Staubgrenze, fehlender Gebührenrest und beschädigte oder unerwartete Providerwerte.
- Mempool-Verzögerung, ausgetauschte oder entfernte Transaktion, Reorganisation und verspätete Provider-Indizierung. Eine anfängliche Bestätigung ist nicht für immer endgültig.
- Onchain-Gebührenerhöhung nur mit sicherer Ersetzungszuordnung. Bei einer Einzahlung für Lightning muss ein neuer Outpoint vor Claim verwendet werden; eine Ersetzung nach begonnener Claim-Übermittlung wird nicht automatisch angeboten. Die erste Version kann diese Funktion für laufende Umbuchungen gezielt auslassen.
- Gemeinsame statische Spark-Adresse mit mehreren gleich hohen Einzahlungen: ausschließlich der gespeicherte Outpoint wird übernommen oder zurückgeholt.
- Claim-Gebühr zu hoch: Eingang bleibt sichtbar, spätere Freigabe und Rückholung funktionieren.
- Home-Gesamtwert und Historie bei zeitlich versetzten Snapshots: keine doppelte Zählung und keine scheinbare externe Einnahme durch eine interne Umbuchung.
- Android und iOS, Hell-/Dunkelmodus, 320 dp Breite, große Schrift und Screenreader; DE/EN/FR/ES. Empfangen und Senden bleiben erreichbar; Kaufen erscheint erst mit funktionierendem Euro-Kauf. Guthabendetails bleiben kompakte Bottom Sheets, Zahlungsabläufe haben eigene Bildschirme. Alle Coins startet wie bisher eingeklappt.
- Konto-Synchronisierung von Onchain-Ein-/Ausgängen und Umbuchungen einschließlich Offline-Nachlieferung, Wiederholung, Reihenfolgeänderung, Wallet-/Kontowechsel und Wiederherstellung. Interne Umbuchungen werden nicht als externe Einnahmen oder doppelte Kontobewegungen dargestellt.

## Gezielte Änderungen im bestehenden Projekt

| Bestehender Bereich | Geplante Änderung |
| --- | --- |
| `app/(tabs)/index.tsx` | getrennte Einträge unter Alle Coins mit Zugang zu Guthabendetails; laufende Umbuchung und deduplizierte Aktivität; dritte QuickAction Kaufen erst mit Euro-Kauf |
| `hooks/useWalletBalances.ts`, `lib/home-balance-preview.ts` | unabhängige Onchain-/Spark-Snapshots und versionierte Anzeigevorschau |
| `lib/wallet-assets.ts`, `lib/payment-details.ts`, `lib/wallet-display.ts` | Konto-/Asset-/Route-Unterscheidung und Umbuchungsdarstellung |
| `app/(tabs)/receive.tsx`, `app/(tabs)/send.tsx` | eigene Bitcoin-Adresse und passende Guthabenquelle |
| `lib/bitcoin/onchain.ts` | bestehenden Spark-Auszahlungsweg als solchen abgrenzen; geprüfte Wiederverwendung für Rückrichtung |
| `lib/bitcoin/deposits.ts`, `components/bitcoin/deposit-screen.tsx` | Claim als explizite Lightning-Freigabe; Altadressen und Refund-Fortsetzung |
| `lib/wallet-seed.ts`, native Kryptomodule, Wallet-Lebenszyklus | separater Bitcoin-Zweig, lokale Signatur und Cleanup |
| `lib/opago/tx-contract.ts`, `lib/opago/tx-sources.ts` | versionierte Onchain-/Umbuchungs-Semantik nach Backend-Abstimmung |
| neue `lib/onchain/`, `app/exchange-flow.tsx` | Onchain-Engine-Adapter, langlebiger Umbuchungsauftrag und Oberfläche |

Die vorhandenen 53 einschlägigen Tests bestanden bei der Bestandsaufnahme. Diese Basis deckt die neuen Funktionen noch nicht ab. Die Abnahmekriterien oben bestimmen die erforderlichen neuen Adapter-, Integrations- und Gerätetests.

## Referenzen

- [Spark statische Einzahlungsadresse](https://docs.spark.money/api-reference/wallet/get-static-deposit-address)
- [Spark Claim einer statischen Einzahlung](https://docs.spark.money/api-reference/wallet/claim-static-deposit)
- [Spark Rückholung einer statischen Einzahlung](https://docs.spark.money/api-reference/wallet/refund-static-deposit)
- [Spark Auszahlung auf Bitcoin](https://docs.spark.money/api-reference/wallet/withdraw)
- [Bitcoin Dev Kit für React Native](https://github.com/bitcoindevkit/bdk-rn)
- [BIP84 für native SegWit-Konten](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)

Für konkrete Signatur-, Gebühren- und Wiederaufnahmeentscheidungen bleibt der Quellcode der festgeschriebenen SDK-Version maßgeblich.
