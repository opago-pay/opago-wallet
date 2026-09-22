# Wallet-Abnahme vom 21. September 2026

Stand des automatischen Testlaufs: **Prüfungen bestanden; Rückmeldung zu Geräteblock 1 noch ausstehend**. Am 22. September wird die Geräteabnahme in kurzen Einzelschritten fortgesetzt: [Geräteabnahme](TEST_ACCEPTANCE_2026-09-22.md). Noch keine zusätzlich gelbe Feature-Zeile vollständig abgenommen. Die Feature-Matrix bleibt bei 8 grünen, 12 gelben und 12 roten Funktionen, bis die jeweils fehlenden Nachweise vorliegen. Einzelne bestandene Teilprüfungen werden hier separat erfasst.

## Geprüfter Stand

- Arbeitsverzeichnis auf Basis von Commit `4ea11f74b097829753ad7dcc6ca873249a2044d6`, mit den vorhandenen, noch nicht eingecheckten Änderungen. Kein sauberer Release-Commit behauptet.
- `package-lock.json` SHA-256: `dd36e3615d0903806b9aed3ae94af0855d7e982a8421f6576cc635e3eba02e2b`.
- Installierte APK: `7945015707b0415ee45ce382f4fdb07690f376dcb19a7cf9f60cdca63a9dc128`; Paket `com.opago.wallet.productioncandidate`, Android 14, UMIDIGI G7, Gerät …8690. Installiert um 14:31:23; bestehende Wallet-Daten erhalten. Signatur und 65 gebündelte Module wurden vor diesem Testlauf abgeglichen.
- Dieser Testlauf ergänzt ausschließlich Tests und Nachweise. Keine Zahlungs-, Schlüssel- oder UI-Implementierung geändert; für diese Ergänzungen ist kein neues APK erforderlich.

## Automatisch oder durch Artefaktprüfung belegt

| Prüfung | Ergebnis | Bezug und Grenze |
| --- | --- | --- |
| Vollständiger lokaler Qualitätslauf | Bestanden | `npm run phase5:verify`: TypeScript, App-Lint, 270 damalige App-Tests, Contract-Kompilierung, 9 lokale Contract-Tests und Dienst-/Skript-Syntax. Keine Netzwerkzahlung. |
| Erweiterte App-Suite | **279/279 bestanden** | Acht neue Tests des echten Wallet-Providers mit simuliertem Gerätespeicher/Authentifizierung und ein zusätzlicher Übersetzungsabgleich. |
| Neu: bestehende Wallet nicht überschreiben | Bestanden | Erstellen/Wiederherstellen bei vorhandenen Schlüsseln abgelehnt; keine Speicheränderung. W08/W09. |
| Neu: fehlende Schlüssel und ungültige Recovery-Phrase | Bestanden | Keine automatische Ersatz-Wallet, keine Authentifizierung/Schreiboperation für ungültige Wörter. W08. |
| Neu: Gerätefreigabe abgebrochen | Bestanden | Weder Erstellen noch Wiederherstellen schreibt Schlüssel oder startet Spark. Simulierter Systemdialog; echte Bedienung separat. W09. |
| Neu: Backup-Status nach Provider-Neustart | Bestanden | Erfolgreich gespeicherter Status wird nach erneutem Entsperren wieder geladen; zuvor neutraler Ladezustand. W05/W08. |
| Neu: Recovery-Abbruch und Speicherfehler | Bestanden | Fehlerhafte Wiederherstellung wird zurückgerollt; expliziter neuer Versuch möglich. Verspätete Seed-Ergebnisse nach Sperre werden gelöscht. Fehlgeschlagene Backup-Schreiboperation zeigt keinen Erfolg. W08/W09. |
| Vorhandene Zahlungs-/Abbruch-/Neustarttests | Bestanden | P01–P07: genaue Beträge/Gebühren, Signatur/Ablauf/Netzwerk, frisches Guthaben, Doppelsenden, persistente unbekannte Ergebnisse, Wiederaufnahme und Claim-Freigabe. Kontrollierte SDK-Antworten ersetzen keine echte Provider-Abnahme. |
| Übersetzungen | Bestanden | 496 Schlüssel in jedem DE-/FR-/ES-Katalog, Platzhalterabgleich; 404 statische UI-Schlüssel geprüft, davon 403 übersetzt und der Markenname Bitcoin absichtlich unverändert. Dynamische Providertexte und Screenreader-Verhalten separat. W04. |
| Vollständiger App-/Hook-/Bibliotheks-Lint | Keine Fehler | Eine vorhandene Stilwarnung in `lib/hedera/mirror.ts:62` (`Array<T>` statt `T[]`), ohne Laufzeitwirkung. Geänderte Test-Hilfen ebenfalls fehlerfrei. |
| Aktueller npm-Audit aller Abhängigkeiten | **0 bekannte Schwachstellen** | Vom 21.09.2026. Ersetzt keine unabhängige Sicherheitsprüfung. R03 bleibt offen. |
| Expo-Abhängigkeitsprüfung | Bestanden | `npx expo install --check`, ohne Installation oder Versionsänderung. |
| Native BIP39-Prüfung | 2/2 bestanden, vorhandener Nachweis wiederverwendet | JVM-Testreport vom selben Tag, native Quellen unverändert. Alle unterstützten Wortzahlen und ungültige Eingaben geprüft; kein iOS-/Geräte-Recovery-Nachweis. |
| Installationsprofil | Bestanden | Installiertes Release-Paket ohne Debuggable-Flag; Erstinstallation unverändert. Android Auto Backup ist aktiviert, die referenzierten SecureStore-Regeln schließen den Schlüsselspeicher aus. Kein tatsächlicher Cloud-Backup-/Restore-Versuch durchgeführt. |
| Synthetische QR-Negativfälle | 3/3 Parserprüfungen bestanden | REGTEST in Mainnet, abgelaufene Mainnet-Rechnung, manipulierte Signatur. Echte Kamera noch offen. |

Die neuen Provider-Tests verwenden ausschließlich öffentlich bekannte synthetische BIP39-Daten und simulierten Speicher. Sie belegen Programmabläufe, nicht Android-Keystore, Hardware-Biometrie oder erfolgreiche Wiederherstellung realer Guthaben.

## Neue Messung des echten Geräts

Messung beginnt nach erfolgreicher Geräteauthentifizierung. Es werden ausschließlich erlaubte numerische Startup-Marker gespeichert, keine Recovery-Wörter, Guthaben, Adressen oder vollständigen Geräte-Logs.

| Durchlauf | Gespeicherter Stand gerendert | Aktuelles Bitcoin-Guthaben gerendert | Ergebnis |
| --- | --- | --- | --- |
| 1 | 1,372 s | **3,631 s** | Ziel unter 5 s auf dem aktuellen APK bestätigt. |
| 2 | 1,435 s | **4,477 s** | Unter 5 s. |
| 3 | 1,307 s | **5,019 s** | Unter 7,5 s; das strengere 5-s-Ziel knapp verfehlt. |
| 4 | 1,329 s | **3,538 s** | Unter 5 s. |

Die Aufzeichnung wurde am 21. September gestartet und am 22. September beendet. Alle vier frischen Guthaben lagen unter 7,5 s, drei unter 5 s; Mittelwert **4,166 s**. Einzelne Marker enthalten nur relative Zeiten und keine Uhrzeit; daraus lassen sich keine Abnahmen bestimmter manueller Schritte oder ein Datum pro Durchlauf ableiten. Die bisherigen drei Messungen in W06 bleiben historische Nachweise.

## Geräteprüfungen mit dem Eigentümer

| Block | Schritte | Stand |
| --- | --- | --- |
| 1 – Entsperren und Scanner | Unter Sicherheit sperren; PIN-/Biometrie-Abfrage abbrechen → gesperrt; regulär entsperren; Home-Scanner dreimal öffnen/schließen → kein Lock; andere App öffnen und zurück → gesperrt. Verwendete Authentifizierungsart dokumentieren. | Anleitung übermittelt; Rückmeldung ausstehend. Ein neuer Ladezeitlauf bereits gemessen. |
| 2 – Wirkliche Inaktivität | Nach Entsperren mindestens 2:15 Minuten alle 15–20 Sekunden Tabs wechseln/scrollen → bleibt offen. Danach 2:15 Minuten keinerlei Eingabe → gesperrt. | Noch nicht gestartet. |
| 3 – Negative Zahlungs-QRs | Die drei vorbereiteten Codes nacheinander mit der Kamera scannen. Erwartete Ablehnung, kein Zahlungsreview/Versand. Danach erneut Scanner öffnen. | [Vorbereitet](output/acceptance/negative-payment-qr.html), noch nicht am Gerät bestätigt. |
| 4 – Backup und Darstellung | Bestehenden Backup-Status vor/nach Neustart prüfen; drei Wörter privat am Gerät bestätigen; falsches Wort muss abgelehnt werden. Lesbarkeit mit großer Schrift und TalkBack, EN/DE/FR/ES; keine Recovery-Screenshots. | Noch nicht gestartet; bestehende synthetische native Sprachprüfungen separat dokumentiert. |
| 5 – Lightning echt | Kontrollierten Betrag mit eigener externer Wallet empfangen, automatisches Ausblenden nach drei Sekunden, exakten Betrag einmalig in der Historie prüfen; kleine Rückzahlung mit sichtbarer Gebühr und Gerätefreigabe. | Betrag/Gegenwallet vor Beginn festlegen; keine echte Zahlung von der Automatisierung ausgeführt. |
| 6 – Unterbrechung und Ablauf | Rechnung erstellen, Opago tatsächlich beenden, extern bezahlen, neu starten; unbezahlte Rechnung ablaufen lassen; vor und nach bestätigtem Versand Verbindung unterbrechen und offen gebliebene Zahlung abgleichen. | Noch nicht gestartet. Nur kontrolliert und ohne erneuten Versand einer unklaren Zahlung. |
| 7 – Zweites Android / Recovery | Gleichen Build installieren, Besitzer stellt privat aus Papierbackup wieder her; beide Assets, Identitäten und Guthaben vergleichen. Vorhandene Wallet auf dem zweiten Gerät nicht überschreiben. | Zweites Gerät momentan nicht per ADB verbunden. |
| 8 – Onchain / Claim / HBAR | Eigene Gegenwallet, vorher abgestimmte Testbeträge und echte Gebühren; beide Richtungen, Wiederaufnahme und Historie prüfen. | Offen; Details in [Bitcoin-Abnahme](BITCOIN_PAYMENT_ACCEPTANCE.md). |

## Grenzen, die sich nicht durch lokale Tests schließen lassen

- A01–A04, D01–D02, I02–I03 und X03: eigentliche App-Integration bzw. Swap-Ausführung fehlt.
- I01 und X02: vorhandener Prototyp/Hinweis ist kein abgeschlossener Identifizierungs-/Aktivierungsablauf.
- P08: gemeinsame Empfangs-URI wird noch nicht ausgegeben; zugehörige Implementierung und eindeutige Rechnungszuordnung fehlen.
- P06/P07: echte Spark-/Mainnet-Abnahme, endgültige Fehlerauflösung und Recovery ohne lokales Journal bleiben offen.
- R01/R02/R03: Store-Einreichung, vollständige zweite Android-/iOS-/Barrierefreiheitsabnahme und unabhängiges Audit sind eigene Arbeitspakete.

## Nachweise

Neue versionierte Tests: `tests/wallet-lifecycle.test.cjs`, Übersetzungsabgleich in `tests/language.test.cjs`; gemeinsame Hook-Testhilfe um `useMemo` ergänzt. Die vorhandenen Änderungen des Projekts wurden erhalten.

Lokale, ignorierte Protokolle: `.codex-local-evidence/matrix-acceptance-quality.log` und `.codex-local-evidence/matrix-acceptance/` mit `app-tests.log`, `audit-all.json`, `expo-dependencies.log`, `full-lint.log`, `translations.json`, `timing-session.json`, `timings-*.jsonl` und Generator der rein synthetischen QR-Codes. Der Übersetzungsbericht führt Bitcoin als erlaubten unveränderten Markennamen; der dauerhafte Regressionstest behandelt diesen Fall ausdrücklich.
