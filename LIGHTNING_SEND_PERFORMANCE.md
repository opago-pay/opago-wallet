# Lightning-Sendezeit: Gerätebefund vom 22.09.2026

## Letzter Eigentümervergleich: Überlappungs-Kandidat

APK `a59174b8d9e4bf58d247ed852fc3bca75d809629a33884fddd8e64938d1f9b3d`, Beleg `.codex-local-evidence/lightning-pipeline-capture.json`: **10,827 s nach Ende der Gerätefreigabe**, Gesamtablauf 14,849 s. Gerätefreigabe endet bei 4,022 s. Das Fünf-Sekunden-Ziel bleibt offen.

Diesmal benötigt die interne Spark-Guthabenaufteilung (`leaves_swap`) 6,467 s; im vorherigen 5,692-s-Lauf entfiel sie. Die laufende Guthabenabfrage endet 531 ms nach der Freigabe. Transfer-/Preimage-Vorbereitung zusammen 1,879 s (zuvor 3,245 s), abschließende SSP-Anfrage 1,365 s. Die neue `preimage_prepare`-Spanne (1,075 s) liegt vollständig innerhalb der Transfer-Vorbereitung: tatsächliche Überlappung bestätigt, nicht zusätzlich addieren. Aufteilung umfasst unter anderem Vorbereitung 1,790 s, SSP-Swap 0,959 s und Rückübernahme 3,272 s.

Ohne die gemessene Aufteilung verbleiben rechnerisch 4,360 s. Das ist keine gemessene Zahlung ohne Aufteilung und keine Fünf-Sekunden-Abnahme. Zahlungsbetrag, Guthabenstruktur, Route und Ergebnis wurden nicht erfasst; daraus weder vollständige kausale Codewirkung noch funktionale Zahlungsabnahme oder WOS-interne Unterschiede ableiten. Auf Eigentümerwunsch nach diesem Test nur analysiert, keine weiteren App-Optimierungen oder Installationen vorgenommen.

## Ergebnis des nativen HTLC-Kandidaten und nächste Überlappung

**Weiteren Kandidaten installiert:** 22.09.2026, 23:35:50 MESZ, Android …8690. APK SHA-256 `a59174b8d9e4bf58d247ed852fc3bca75d809629a33884fddd8e64938d1f9b3d`, identisch auf Gerät. 413 Tests, TypeScript, geänderter Lint, Release-/native Kryptoprüfungen, APK-v2-Signatur und 91 gebündelte Quellmodule geprüft. Der SDK-Vergleich prüft auch unveränderbare RPC-Clients. Erstinstallation unverändert; gesperrter Start ohne beobachtete Startfehler. Noch keine Eigentümer-Messung dieser Überlappung. Belege `.codex-local-evidence/lightning-pipeline-{tests.log,android-build.log,source-hashes.json,device-update.json}`; nächster anonymer Leser `.codex-local-evidence/read-lightning-pipeline.ps1`.

Eigentümertest mit APK `0749b4c9aa6d6ce703d2b2e4466c63bdbbdab2dc625523555c2fc95c3280a70a`, Beleg `.codex-local-evidence/lightning-htlc-native-capture.json` (87 anonyme Zeitdatensätze). **5,692 s nach Ende der Gerätefreigabe**, gegenüber zuvor 9,190 s. Gesamtablauf 10,450 s einschließlich 4,757 s Gerätefreigabe. Fünf-Sekunden-Ziel **weiterhin nicht erreicht**.

SDK-Aufruf 5,429 s. Transfer-Vorbereitung jetzt 1,598 s statt 4,050 s; der darin enthaltene HTLC-Refund-Aufbau 0,538 s statt 3,016 s. Der einmalige öffentliche HTLC-Ausgabecode benötigt 67 ms, seine native Kurvenmultiplikation 6 ms. Preimage-Swap 1,647 s, abschließende SSP-Anfrage 1,719 s. Beide Guthabenabfragen liefen weitgehend während der Freigabe; die zweite Antwort kommt nur 41 ms nach deren Ende. Journal/Abschluss erklären den kleinen Rest. Verschachtelte Abschnitte nicht addieren. Einzelmessung, keine Aussage über alle Guthabenstrukturen/Routen und kein Zahlungsstatus aus den Zeitdaten abgeleitet.

Nächste gezielte Änderung: Frische Betreiber-Commitments und lokale normale Refund-Signierung für die Preimage-Phase laufen nun parallel zum ersten Transfer-Paketaufbau. Diese Arbeit ist von dessen HTLC-Transaktionen unabhängig; das ursprüngliche SDK bleibt für den einzigen `initiate_preimage_swap_v3`-Aufruf verantwortlich und erhält die unveränderten Zahlungs-/Gebühren-/Idempotenzdaten erst nach vollständiger Vorbereitung. Es werden keine Gebührenprüfungen, Journale oder Freigabeschritte übersprungen und keine ausgehenden Transfers vorgezogen.

Vorbereitete Daten sind an genau das zurückgegebene Paketobjekt, Transfer-ID, Zahlungshash, Empfänger, Blattobjekte und deren öffentliche Transaktions-/Schlüsseldaten gebunden. Nur einmal verwendbar, keine geteilte globale Client-/Prototypänderung; höchstens vier parallele Vorbereitungen. Abbruch, veränderte Daten, unvollständige Commitments und Wallet-Bereinigung verhindern das Senden. Verspätete Vorbereitungsfehler sind beobachtet. SDK-Commitments bleiben in getrennten frischen Abfragen und die SDK-Signierung erzeugt weiterhin frische Nonces.

**413 App-Tests, TypeScript und geänderter Lint bestanden.** Tests nutzen die installierten Originalmethoden für Transfer- und Preimage-Auftrag mit synthetischen RPC-Doubles: tatsächliche Überlappung ohne vorzeitigen Versand, identische SDK-Requestdaten/Idempotenzkennung, getrennte parallele Zahlungen, einmalige Verwendung, Fehler beider Phasen, Cleanup, Änderungen an Empfänger/Hash/Transaktion und begrenzte Zusatzarbeit. Keine Agenten-Zahlung. Das gepinnte SDK 0.7.12 und die erwarteten internen Methoden sind Integrationsgrenzen; bei SDK-Upgrades neu prüfen. Gerätezeit dieses weiteren Kandidaten noch offen. Neuer anonymer Zeitabschnitt `preimage_prepare` zeigt die Überlappung; keine zusätzlichen Inhaltsdaten.

## Zweite gezielte Optimierung: HTLC-Aufbau und Freigabevorbereitung

Abnahmekriterium auf ausdrücklichen Eigentümerwunsch: **höchstens fünf Sekunden nach Ende der Gerätefreigabe**. Die vorherigen 9,190 s erfüllen dieses Ziel nicht.

Quellprüfung des gepinnten SDK 0.7.12: `signRefundsForLightning` erstellt pro Guthabenteil bis zu drei Transaktionen, deren identischer HTLC-Ausgabecode jeweils erneut durch `p2tr` berechnet wird. Ein eng begrenzter Adapter erstellt diesen öffentlichen Ausgabecode nur einmal je Zahlungshash/Sender/Empfänger innerhalb des Aufrufs. Die öffentliche Taproot-Skalarmultiplikation nutzt Androids bereits gebündelte Spark-Rust-Funktion. Taproot-Merkle-Hash, NUMS-Punkt, Zeitsperre, Transaktionsversion, Gebührenregel, Anchor, Inputs, Outputs und Sighashes bleiben identisch. Das SDK führt weiter die eigentliche Nonce-Erzeugung und FROST-Signierung aus. Kein geheimer Wallet-Schlüssel wird für diese öffentliche Berechnung benötigt. Andere Plattformen ohne die native Funktion behalten den ursprünglichen SDK-Aufbau.

Während einer längeren Gerätefreigabe wird das Bitcoin-Guthaben begrenzt aktualisiert (höchstens sechs zusätzliche, nicht überlappende Abfragen, jeweils frühestens 2,5 s nach der vorherigen Antwort). Abbruch beendet den Timer; verspätete Antworten starten keine neuen Abfragen. Die vorher entsperrte Wallet-Sitzung wird zusätzlich unabhängig von der Navigation geprüft, damit Sperren/erneutes Entsperren während des PIN-Fensters keine weiteren Abfragen derselben Vorbereitung erlaubt. Veraltete Daten nach angehaltener/ausgeschöpfter Aktualisierung werden weiterhin neu gelesen: **Das Fünf-Sekunden-Aktualitätslimit wurde nicht erhöht.** Ein Fehler, ein zu geringes Guthaben oder eine laufende neuere Abfrage wird nicht durch einen älteren guten Stand übergangen. Kein Journal oder Versand vor Freigabe; Session-, Ablauf-, Gebühren- und Zahlungsnachweisprüfung unverändert.

**Prüfung:** 404 App-Tests, TypeScript und geänderter Lint bestanden. Öffentliche synthetische Taproot-Vektoren gegen ursprüngliches `p2tr` verglichen. Ganze Refund-Transaktionen, Sighashes, Reihenfolge und Commitment-Zuordnung bytegenau gegen den installierten Original-SDK-Aufbau geprüft, einschließlich direkter/fehlender direkter Transaktion, Bit-30-Sequenzen und Beträgen beiderseits der Gebühren-Schwelle. Fehlerhafte native Antworten, ungültige Transaktionen/Zeitsperren, parallele Aufrufe und getrennte Empfänger scheitern sicher bzw. bleiben getrennt. Freigabe-Tests prüfen Abbruch, verspätete Fehler, fallendes Guthaben, laufende Abfrage, begrenzte Wiederholung und ungültig gewordene Ansicht.

**Integrationsgrenze:** Adapter verwendet interne Methoden des gepinnten SDK; bei einem SDK-Upgrade sind die Vergleichstests zwingend erneut zu prüfen. Native Rechenfunktion bereits Bestandteil des bisherigen Android-Builds; automatisierte JS-Tests simulieren ihre mathematische Ausgabe und ersetzen keine echte Geräteabnahme. Der oben dokumentierte Eigentümer-Vergleich dieser zweiten Optimierung beträgt 5,692 s nach Freigabe; das Fünf-Sekunden-Ziel bleibt offen. Die freigegebene nächste Einzelaufzeichnung ergänzt ausschließlich die festen Zeitlabels `htlc_output` und `public_curve`, keine Inhalte. Keine Zahlung durch den Agenten.

**Android-Kandidat installiert:** 22.09.2026, 23:16:32 MESZ, Gerät …8690. APK SHA-256 `0749b4c9aa6d6ce703d2b2e4466c63bdbbdab2dc625523555c2fc95c3280a70a`, identisch auf Gerät. Release-/native Kryptoprüfungen, APK-v2-Signatur, 90 Quellmodule und native Spark/ARM64-Module geprüft. Erstinstallation unverändert, gesperrter Start erfolgreich, keine beobachteten Startfehler. Eigentümer-Sendevergleich inzwischen oben dokumentiert; keine PIN-Eingabe oder Zahlung durch den Agenten. Belege `.codex-local-evidence/lightning-htlc-native-{tests.log,android-build.log,source-hashes.json,device-update.json}`. Leser für die nächste anonyme Einzelmessung: `.codex-local-evidence/read-lightning-htlc-native.ps1`.

## Vergleich nach der Optimierung

Eigentümer hat den Sendeversuch mit APK `8aa197cfdef013ea8b5308ac1b2c9254384aaa5e280f0cb5500bce6614d7cc4f` selbst durchgeführt. Anonyme Aufzeichnung vollständig ausgelesen (93 feste Zeitdatensätze einschließlich Gesamtzeit), Beleg `.codex-local-evidence/lightning-leaf-selection-capture.json`. Kein erneuter Versand durch den Agenten.

| Abschnitt | Vorher | Neuer Durchlauf |
| --- | ---: | ---: |
| Gesamtablauf ab Senden einschließlich Gerätefreigabe | 29,185 s | 16,315 s |
| Gerätefreigabe | 3,784 s | 7,124 s |
| Ablauf nach Ende der Gerätefreigabe | **25,400 s** | **9,190 s** |
| SDK-Sendeaufruf | 25,161 s | **7,888 s** |
| Guthabenauswahl/Aufteilung (innerhalb SDK) | 15,519 s | unter 1 ms, keine Aufteilung erfasst |
| Transfer-Vorbereitung (innerhalb SDK) | 5,447 s | 4,050 s |
| Preimage-Swap (innerhalb SDK) | 2,170 s | 1,879 s |
| Abschließende SSP-Anfrage (innerhalb SDK) | 1,568 s | 1,503 s |

Nach der Freigabe ist dieser Lauf **63,8 % kürzer**, der SDK-Aufruf **68,6 % kürzer**. Die Abschnitte sind verschachtelt, nicht addieren. Die Freigabedauer enthält Bedienzeit und Android-Authentifizierung; sie ist keine reine App-Rechenzeit. Wegen der längeren Freigabe war die vorab gelesene Guthabenantwort älter als fünf Sekunden. Die beabsichtigte erneute aktuelle Guthabenprüfung benötigte nach Freigabe weitere 1,125 s. Das Aktualitätslimit bleibt erhalten.

Der größte verbleibende SDK-Block ist die Transfer-Vorbereitung mit 4,050 s, darin 3,016 s Refund-/Signiervorbereitung. Die erfassten einzelnen FROST- und Public-Key-Aufrufe erklären diesen Block nicht vollständig; keine Behauptung, dass dessen gesamte Zeit Signieren oder Netzwerk wäre. Nächster Untersuchungspunkt ist die Vorbereitung innerhalb dieses Blocks.

**Fünf-Sekunden-Ziel weiterhin nicht erreicht.** Dieser einzelne Vergleich belegt den schnelleren neuen Durchlauf, aber nicht, welcher Anteil ausschließlich durch den Code verursacht wurde: Guthabenstruktur, Betrag und Zahlungsroute wurden absichtlich nicht erfasst. Dass diesmal keine Aufteilung nötig war, ist kein Nachweis, dass künftige Zahlungen nie eine brauchen. Die Zeitdaten enthalten bewusst keinen Zahlungsstatus; keine neue funktionale Geräteabnahme allein aus diesen Dauern ableiten. Die einmalige Aufnahme des aktuellen App-Prozesses ist beendet.

## Ursprünglicher Durchlauf

Ein vom Eigentümer selbst ausgeführter Sendeversuch auf Android …8690 mit Diagnose-APK `7fc16039f3fbe6e72c1a3c4e05b93a2c1fe832f21c70d3aa20d2918c8dbdb1ad`. Erfasst wurden ausschließlich feste Schrittnamen und relative Zeiten; keine Zahlungsinhalte. Rohbeleg lokal/ignoriert: `.codex-local-evidence/lightning-send-timing-capture.json`.

## Ergebnis

Gesamtablauf ab Senden: **29,185 s**. Gerätefreigabe endet bei 3,785 s; danach vergehen **25,400 s** bis Ende des Ablaufs. Der Spark-SDK-Aufruf dauert **25,161 s**.

| Nacheinander liegender SDK-Abschnitt | Dauer |
| --- | ---: |
| Gebührenabfrage | 0,351 s |
| Guthaben auswählen und intern passend aufteilen | **15,519 s** |
| Leaf-Erneuerungsprüfung | 0,093 s |
| Lightning-Transfer vorbereiten | **5,447 s** |
| Preimage-Swap vorbereiten/ausführen | 2,170 s |
| Lokalen Transferstatus aktualisieren | 0,001 s |
| Abschließende SSP-Lightning-Sendeanfrage | **1,568 s** |

Kleine Zwischenräume und Rundung erklären die Differenz zum Gesamtwert. Die letzte Anfrage ist nur ein Teil des gesamten Zahlungsvorgangs, keine Messung der kompletten Lightning-Netzwerklaufzeit.

Die Aufteilung (`leaves_swap`, 15,518 s) umfasst Vorbereitung (4,697 s), SSP-Swap-Anfrage (1,146 s), weitere Schritte und Rückübernahme der neuen Guthabenteile (`transfer_claim`, 9,159 s). Vier zeitlich getrennte `refund_signing`-Abschnitte belegen zusammen **11,142 s** innerhalb der größeren Blöcke. Erfasst wurden 45 FROST-Signieraufrufe und 60 öffentliche Schlüsselableitungen; deren Dauern können überlappen und dürfen nicht einfach zusätzlich addiert werden. Die Aufzeichnung beweist nicht, dass jede dieser Ableitungen redundant ist oder welcher Anteil reine CPU-Zeit ist.

Die frische Bitcoin-Guthabenprüfung (1,259 s) läuft parallel zur Gerätefreigabe und verzögert in diesem Durchlauf den Versand nach Freigabe nicht. Pending-Journal 0,081 s, Ergebnis-Journal 0,067 s, Zahlungsnachweisprüfung 0,003 s. Diese Schritte erklären die große Verzögerung nicht.

## Schlussfolgerung für die nächste Änderung

Der größte gemessene Block ist die interne Spark-Guthabenaufteilung, gefolgt von Transfer-/Signiervorbereitung. Das Fünf-Sekunden-Ziel ist nicht erreicht. Selbst vollständiges Wegfallen der gemessenen Aufteilung ließe in diesem Durchlauf ungefähr 9,6 s SDK-Arbeit übrig; eine einzelne Optimierung dieses Blocks genügt daher voraussichtlich nicht.

1. Die Anzahl notwendiger interner Aufteilungen untersuchen und reduzieren. SDK 0.7.12 hat `optimizationOptions.auto=true` und `multiplicity=1` bereits als Standard; kein fehlender einfacher Einschalter. Die bestehende Optimierung wird nur unter bestimmten Bedingungen ausgelöst. Hintergrundaufteilungen verändern/ sperren echte Spark-Leaves und benötigen eine saubere Behandlung von Sperre, Abbruch, parallelem Versand und Wiederherstellung; sie dürfen nicht als bloße lesende Guthabenabfrage eingeführt werden.
2. Wiederholte Schlüsselableitung und Signiervorbereitung innerhalb desselben Vorgangs gezielt reduzieren bzw. den nativen Ausführungspfad erweitern. Transaktionsbau für reguläre Refunds und FROST sind teilweise bereits nativ; nicht erneut pauschal „alles von JavaScript nach Rust“ als Lösung behaupten. Nonces bleiben immer frisch, Schlüsselableitung/Signaturen/Transaktionen müssen identisch bleiben.
3. Mit demselben Gerät und Eigentümer-Test prüfen. Ein einzelner Lauf unterscheidet noch nicht zuverlässig zwischen generell nötiger Arbeit und der aktuellen Struktur dieses Wallet-Guthabens. Die interne Route/SDK-Implementierung von Wallet of Satoshi wurde nicht gemessen.

In diesem Diagnoseschritt wurden keine weiteren Zahlungs-/Kryptoänderungen umgesetzt oder Zahlungen durch den Agenten ausgelöst. Die einmalige Aufzeichnung des laufenden App-Prozesses ist beendet. Das Diagnose-Build-Flag muss beim nächsten regulären Build wieder deaktiviert werden.

## Umsetzung für den nächsten Eigentümer-Vergleich

Die gemessenen Engpässe werden durch zwei begrenzte Änderungen adressiert:

- Eine beschränkte Suche findet exakte Guthabenkombinationen, die der Greedy-Algorithmus von SDK 0.7.12 übersieht. Synthetisches Beispiel: Teile 8, 7 und 6, Ziel 13; 7 + 6 vermeidet die Aufteilung. Ist eine Aufteilung nötig, werden möglichst wenige Eingabeteile ausgewählt, statt zunächst viele kleine Teile zu verwenden. Das reduziert potenziell die Anzahl der Signaturen. Es wurden keine echten Guthabenteile ausgelesen; ob diese Fälle im nächsten Versuch auftreten, ist offen.
- Der Android-Signer verwendet deterministische Schlüsselableitungen und öffentliche Schlüssel während eines SDK-Sendeaufrufs wieder. Der begrenzte temporäre Speicher wird bei Abschluss, Fehler, Verbindungsbereinigung/Sperre und Seedwechsel geleert; eigene private Schlüsselkopien werden überschrieben. Bereits laufende SDK-Aufrufe werden dadurch nicht abgebrochen. Zufallsschlüssel und Signier-Nonces bleiben bei jedem Aufruf frisch. Keine zusätzliche dauerhafte Speicherung.

Nur die synchronen Auswahlfunktionen des gepinnten SDK werden erweitert. Mutex, AVAILABLE-Filter, Reservierung, Swap-Netzwerkaufrufe, Wiederherstellung nach möglicherweise übermitteltem Swap und Zahlungsnachweis bleiben beim SDK. Mehrere Zielbeträge behalten die bisherige Auswahl; ungültige/zu große Suchräume fallen auf die SDK-Logik zurück. Keine vorgezogenen Hintergrund-Swaps.

**Prüfung:** 390 automatische App-Tests, TypeScript und Lint der Änderungen bestanden. Die Auswahl wird mit erschöpfender Suche in kleinen synthetischen Guthabenbeständen verglichen. Tests gegen den installierten SDK-LeafManager prüfen parallele Reservierung, notwendigen Swap, Wechselgeld und Abbruch vor/nach Übermittlung. Cache-Tests prüfen identische Schlüssel, frische Zufallswerte, bereinigte Speicherkopien, Fehler, parallele Aufrufe und verspätete Antworten. Es wurden keine echten Zahlungen durch den Agenten ausgelöst.

Das interne Vergleichs-Build behält die ausdrücklich genehmigte einmalige anonyme Zeitaufzeichnung bei. Der ursprüngliche Messbeleg wird getrennt aufbewahrt. **Der neue Durchlauf ist schneller; das Fünf-Sekunden-Ziel und eine wiederholbare Verbesserung sind noch nicht nachgewiesen.**

Android-Release und native Kryptotests bestanden. APK-v2-Signatur, 89 gebündelte Quellmodule, Native-Spark/ARM64- und Kamera-/Seed-Module geprüft. SHA-256: `8aa197cfdef013ea8b5308ac1b2c9254384aaa5e280f0cb5500bce6614d7cc4f`. **Installiert am 22.09.2026 um 22:57:31 MESZ auf Android …8690**, nach Wiederherstellung der Verbindung über scrcpy-ADB. Installierter Hash identisch, Erstinstallation vom 16.09. unverändert. Gesperrter Start erfolgreich, keine beobachteten Startfehler. Kein Entsperren und keine Zahlung durch den Agenten; Eigentümer-Sendevergleich inzwischen oben dokumentiert. Installationsbeleg: `.codex-local-evidence/lightning-leaf-selection-device-update.json`. Neuer Leser: `.codex-local-evidence/read-lightning-leaf-selection.ps1`; ursprünglicher Beleg: `.codex-local-evidence/lightning-send-timing-baseline.json`.
