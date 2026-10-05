# Opago Wallet – Feature-Matrix

Stand: **5. Oktober 2026**. Die App ist für ihren implementierten Wallet-Funktionsumfang production-ready. Signierte Produktionsbuilds und der öffentliche APK-Download sind in [Production release status](PRODUCTION_RELEASE_STATUS.md) belegt. Fabian bestätigt die laufende Geräteerprobung der implementierten Funktionen durch mehr als zehn Personen über TestFlight und Android. Für diesen Umfang sind keine separaten Gerätetests oder Geräteabnahmen offen. Die früheren R02-Restprüfungen sind überholt; siehe [aktueller Geräteteststand](DEVICE_TESTING_STATUS.md).

Erfolgreiche Builds vom aktuellen Hauptbranch `724ca2e` liegen vor: iOS 46, Android 11 und Android-APK 12. Der protokollierte Qualitätslauf vom 4. Oktober umfasst 718 erfolgreiche App-Testfälle, einen übersprungenen Fall und neun erfolgreiche Contract-Tests sowie TypeScript und Lint. Eine Gesamtquote für den vollständigen OPAGO-MVP wird daraus nicht abgeleitet.

Die Bewertung gilt für **unsere mobile Wallet und ihre Plattform-Anbindung**. Sie bewertet nicht den Entwicklungsstand des separaten Opago-Backends, Portals, POS oder der E-Commerce-Produkte. Die groben Prozentangaben aus dem Meeting sind keine geprüften Fertigstellungsgrade dieses Repositorys.

- **🟢 Fertig umgesetzt:** Die abgegrenzte Funktion ist implementiert und durch die vorhandenen Prüfungen belegt. Die Bewertung bezieht sich auf diese Funktion; Store-Publikation und zusätzliche Integrationen werden separat geführt.
- **🟡 In Arbeit / nicht abgeschlossen:** Es gibt Code oder einen Prototyp; Integration, Fehlerbehebung oder entscheidende Funktionstests fehlen noch. Der Status bedeutet nicht, dass gerade jemand aktiv daran arbeitet.
- **🔴 Fehlt:** Die eigentliche Funktion ist in unserer Wallet noch nicht implementiert. Ein Button oder ein Plan zählt nicht als Implementierung.

## Implementierter Wallet-Umfang und konkrete Provider-Themen

| ID | Bereich | Feature | Status | Vorhanden / noch offen |
| --- | --- | --- | --- | --- |
| W01 | Grundlage | React-Native-App und Android-/iOS-Builds | 🟢 Fertig umgesetzt | Aktuelle Builds und laufende Tests über TestFlight und Android mit mehr als zehn Personen bestätigt. |
| W02 | Grundlage | Lokale Wallet-Schlüssel und Non-Custodial-Grundmodell | 🟢 Fertig umgesetzt | Recovery-Phrase in nativem SecureStore; Signierung im Gerät. Unabhängige Sicherheitsprüfung separat unter R03. |
| W03 | Oberfläche | Startbildschirm, Home und Navigation | 🟢 Fertig umgesetzt | Bitcoin als Standard: Einstieg und Bitcoin-Eurobetrag; HBAR-Guthaben und Asset-Auswahl über „Erweiterte Optionen“. Darunter gemeinsame Historie für Bitcoin und HBAR. Logo/Scanner, Aktionen, Kontur-Icons und sichtbare Zurück-Aktionen vorhanden. |
| W04 | Oberfläche | Englisch, Deutsch, Französisch und Spanisch | 🟢 Fertig umgesetzt | Sprachauswahl, gespeicherte Präferenz und Übersetzungen implementiert; automatische Tests und Browserprüfung dokumentiert. |
| W05 | Oberfläche | Laden, echtes Nullguthaben und veraltete Werte unterscheiden | 🟢 Fertig umgesetzt | Unbekannte Werte erscheinen nicht als null; Aktualisierung und Fehler sind gekennzeichnet. |
| W06 | Performance | Guthaben nach dem Entsperren schnell anzeigen | 🟢 Fertig umgesetzt | Ziel auf Android …8690 erreicht: drei gemessene Starts nach Authentifizierung mit aktuellem Bitcoin-Guthaben nach 3,617 / 4,162 / 3,837 s (Ø 3,872 s; alle unter 5 s), zuvor 11,805 s. Gespeicherter Stand nach 1,2–1,7 s sichtbar. Einmalige native Seed-Berechnung und nachgeladene optionale Bereiche umgesetzt. |
| W07 | Oberfläche | Transaktionshistorie ausklappen und erst dann laden | 🟢 Fertig umgesetzt | Eine gemeinsame Historie für Bitcoin und HBAR unterhalb der erweiterten Optionen, anfangs eingeklappt. Beide Assets laden erst beim Öffnen der Historie, unabhängig von der erweiterten Asset-Liste. Tests prüfen Reihenfolge, gemischte Einträge, Öffnen, Schließen und Aktualisieren. |
| W08 | Sicherheit | Backup-Führung und Wiederherstellung | 🟢 Fertig umgesetzt | Nummerierte Worteingabe, Backup-Prüfung und dauerhafter Status vorhanden; keine offene Geräteabnahme für den implementierten Umfang. |
| W09 | Sicherheit | Biometrie, Geräte-PIN und Inaktivitätssperre | 🟢 Fertig umgesetzt | Lokale Authentifizierung, Abbruch, Inaktivitätssperre und Sperre nach App-Wechsel implementiert und im laufenden Nutzertest. |
| P01 | Bitcoin | Lightning-Zahlungen über Spark senden | 🟢 Fertig umgesetzt | Regulärer Mainnet-Versand am 22.09. vom Eigentümer bestätigt: 20 SAT in eigener Gegenwallet angekommen, 22 SAT abgezogen, tatsächliche 2 SAT Gebühr innerhalb des angezeigten Maximums. PIN-Abbruch zuvor ohne Versand geprüft; automatische Fehlerfalltests bestanden. Anbieterklärung für unbekannte Zahlungsversuche bleibt unter P05 getrennt dokumentiert. |
| P02 | Bitcoin | Lightning-Zahlungen anfordern und empfangen | 🟢 Fertig umgesetzt | Echter 100-SAT-Empfang mit korrekter Gutschrift, automatischem Ausblenden und einmaliger Historie bestätigt. Weitere 30 SAT während beendeter App nach Neustart korrekt verfügbar; erledigte Anfrage und einmaliger Historieneintrag bestätigt. Unbezahlte 7-SAT-Anfrage wird nach Ablauf als abgelaufen angezeigt und ihr QR ausgeblendet. |
| P03 | Bitcoin | QR, LNURL und Lightning-Adressen | 🟢 Fertig umgesetzt | Am Android-Gerät bestätigt: Scanner dreimal ohne Lock, 3/3 ungültige Rechnungs-QRs abgelehnt, gültige 20-SAT-Rechnung erkannt und bezahlt. Weitere 20 SAT über eigene Lightning-Adresse versendet, exakter Eingang und einmalige Historie bestätigt. Separater Wallet-of-Satoshi-LNURL-QR gescannt und korrekte Übersicht mit 20 SAT, Empfänger und maximaler Gebühr erreicht; dafür keine zusätzliche Zahlung. Signatur, Netzwerk, Ablauf, LNURL-Betrag und Metadaten-Hashbindung automatisch geprüft. |
| P04 | Zahlungen | Betrags- und Gebührenprüfung vor Freigabe | 🟢 Fertig umgesetzt | Review, Grenzen und erneute Guthabenprüfung automatisch getestet. Am 22.09. real bestätigt: 20 SAT Empfängerbetrag, höchstens 2 SAT im Review, anschließend 22 SAT Gesamtabzug und 20 SAT Eingang. PIN-Abbruch ohne Versand ebenfalls geprüft. Anbieterklärung unter P05 getrennt dokumentiert. |
| P05 | Zahlungen | Offene ausgehende Zahlungen nach Neustart abgleichen | 🟡 In Arbeit | Reale Unterbrechung getestet, endgültige Auflösung nicht bestanden: 20-SAT-Vorgang bleibt offen, Gegenwallet ohne Eingang. Auch die direkte Betreiberabfrage liefert wie Auftragsindex und Historie keinen passenden Treffer (je 26 Durchläufe). Für künftige Versuche Pending-Speicherung erst nach erfolgreicher letzter Guthabenprüfung; 296 Tests bestanden. Alter Vorgang bleibt geschützt und ungeklärt. Verbindliche Anbieterklärung erforderlich: [technischer Befund und vorbereitete Fragen](SPARK_PENDING_SEND_INTEGRATION.md). |
| P06 | Bitcoin | Aus demselben verfügbaren Guthaben Onchain senden | 🟡 In Arbeit | Echte Gebühren-/Auszahlungsadapter, Adress-/BIP-321-Prüfung, Gebührenaddition und dauerhaftes Journal implementiert und automatisch geprüft. Eigene Gerätefreigabe für die signierende SDK-Vorbereitung. Providerbestätigte endgültige Fehlerfreigabe bleibt eine separate Anbieterfrage. |
| P07 | Bitcoin | Bitcoin-Adresse, Einzahlung und Gebührenfreigabe zur Übernahme | 🟡 In Arbeit | Statische Adresse, bestätigte UTXOs, Brutto-/Nettoprüfung, Claim mit freigegebener Maximalgebühr und Wiederaufnahme implementiert. Wiederaufnahme endgültig gescheiterter Claims bleibt eine separate Anbieterfrage. |
| P08 | Bitcoin | Gemeinsame Lightning-/Onchain-Empfangsanfrage | 🟡 In Arbeit | Kombinierte Anfragen werden beim Senden geparst. Empfang bietet vorerst ausdrücklich Lightning-Code plus separate Bitcoin-Adresse. Eindeutige Onchain-Rechnungszuordnung und externe Unified-URI-Abnahme fehlen; kein gemeinsamer Empfangs-QR freigegeben. |
| X01 | Bisheriger Umfang | HBAR senden/empfangen | 🟢 Fertig umgesetzt | Implementiert und im laufenden Nutzertest. Main enthält die Aktivierungs-API und verifizierte Kontobindung; HBAR ist über die erweiterten Optionen erreichbar. |
| X02 | Bisheriger Umfang | Neues HBAR-Konto aktivieren | 🟢 Fertig umgesetzt | Aktivierungs-API und verifizierte Mainnet-Kontobindung seit PR 33 integriert; HashPack-Finanzierung ist kein erforderlicher Aktivierungsweg mehr. |

## Zusätzliche OPAGO-Integrationen außerhalb des aktuellen Releases

Diese Erweiterungen sind eigene Entwicklungspakete. Ihr Status ist kein Geräteabnahme-Rückstand der ausgelieferten Wallet-Funktionen.

| ID | Bereich | Feature | Status | Vorhanden / noch offen |
| --- | --- | --- | --- | --- |
| A01 | Opago-Account | Login/Logout über Opagos öffentliche API | 🔴 Fehlt | Unsere Einstiegsseite erstellt/restauriert eine Wallet; sie meldet nicht bei einem Opago-Account an. |
| A02 | Opago-Account | Wallet und Dashboard bidirektional verknüpfen/trennen | 🔴 Fehlt | Kein fertiger Verknüpfungsablauf, kein Konto-/Gerätestatus und kein Widerruf in der App. |
| A03 | Opago-Account | Account-2FA | 🔴 Fehlt | Lokale Biometrie und Geräte-PIN sind vorhanden; eine zusätzliche Anmeldung mit Opago-Account-2FA fehlt. |
| A04 | Opago-Account | Privat-/Geschäftskundenstatus in der App | 🔴 Fehlt | Keine integrierte Zuordnung zu einem Opago-Profil und dessen Berechtigungen/Identifizierungsstatus. |
| D01 | Dashboard | Opago-Zahlungen dem Account zuordnen und synchronisieren | 🔴 Fehlt | Lokale und netzwerkbasierte Historie vorhanden; kein fertiger Plattformabgleich mit gemeinsamen Zahlungsreferenzen. |
| D02 | Dashboard | Übrige Wallet-Transaktionen optional teilen | 🔴 Fehlt | Auswahl, Einwilligung, Synchronisation und Widerruf fehlen. |
| I01 | Identifizierung | Browserbasierte Identifizierung / KYC-Anbindung | 🟡 In Arbeit | eID-Referenzcode und lokale Referenzdienste vorhanden, in der aktuellen Wallet deaktiviert. Fertige Provider-/Plattformintegration und Abnahme fehlen. |
| I02 | Identifizierung | Automatische Identifizierung bei Opago-Zahlungen | 🔴 Fehlt | Kein produktiver Ablauf vom verknüpften Account zur erforderlichen Identitätsübermittlung. Der eID-Prototyp allein erfüllt dieses Feature nicht. |
| I03 | Identifizierung | Vollständige UMA-Zahlungen | 🔴 Fehlt | LNURL-Vorarbeit vorhanden; die vollständige UMA-Anbindung mit den benötigten Identitäts-/Protokollabläufen fehlt. |
| X03 | Bisheriger Umfang | Tauschen / Swaps | 🔴 Fehlt | Nur „Coming soon“. Keine Swap-Ausführung. Im Meeting-Dokument nicht als Payment-App-MVP-Feature aufgeführt. |

## Store-Veröffentlichung und externe Nachweise

Signierte Release-Artefakte und öffentlicher APK-Zugang sind vorhanden. Öffentliche Store-Publikation und unabhängige Assurance bleiben eigene Nachweise.

| ID | Bereich | Feature | Status | Vorhanden / noch offen |
| --- | --- | --- | --- | --- |
| R01 | Veröffentlichung | Öffentliche Google-Play-/Apple-App-Store-Veröffentlichung | 🟡 Store-Publikation separat | TestFlight und Android-Testverteilung sowie aktuelle Produktionsbuilds vorhanden. Öffentliche Store-Veröffentlichung und zugehörige Betreiberfreigaben bleiben ein eigenes Arbeitspaket. |
| R02 | Veröffentlichung | Geräteerprobung der implementierten Funktionen | 🟢 Bestätigt | Laut Fabian mehr als zehn Tester über TestFlight und Android; keine separate Geräteabnahme offen. Neue OPAGO-Integrationen behalten ihren eigenen Entwicklungsstatus. |
| R03 | Veröffentlichung | Unabhängige Sicherheitsprüfung und Freigabe | 🔴 Fehlt | Interne Prüfungen und Unterlagen vorhanden; abgeschlossene unabhängige Prüfung mit Freigabe nicht dokumentiert. |

Entschieden am 21. September 2026: **Bitcoin ist die Standardansicht; HBAR bleibt unter zunächst eingeklappten erweiterten Optionen erreichbar.** Der große Home-Eurobetrag bewertet ausschließlich Bitcoin. Bestehende HBAR-Wallets werden nicht auf andere Schlüssel umgestellt.

Offene Produktentscheidungen aus dem Strategieabgleich:

1. **Account-Pflicht:** Entscheiden, ob Basiszahlungen ohne Account möglich bleiben oder Anmeldung Voraussetzung wird.
2. **Identifizierung:** Klären, ob „Privatkunden nichts“ auf Seite 2 den heutigen Entwicklungsstand oder den gewünschten Umfang beschreibt; anschließend die konkreten Auslöser und benötigten Daten festlegen.
3. **Plattform-Schnittstelle:** Bestehende API-/Sandbox-Unterlagen und verfügbare Backend-Funktionen prüfen. Hier als fehlend markierte App-Anbindungen können auf bereits vorhandenen Plattformfunktionen aufbauen.

Reihenfolge für die zusätzlichen OPAGO-Integrationen: Account- und Zahlungsreferenz-Schnittstellen mit dem Plattformteam festlegen; Registrierung/UMA, Verknüpfung und Dashboard-Abgleich implementieren; Identitäts-Onboarding integrieren. Diese Pakete werden nach ihrer Lieferung gemeinsam geprüft. Die Geräteabnahme des bereits implementierten Wallet-Umfangs ist abgeschlossen.

Belege: [Release Notes](../RELEASE_NOTES.md), [Release Readiness](PUBLIC_RELEASE_READINESS.md), [Security](../SECURITY.md), [Feature-Schalter](../lib/product-capabilities.ts), [Wallet-Lifecycle](../hooks/useWalletAuth.ts), [Home](<../app/(tabs)/index.tsx>), [Sprachen](../hooks/useLanguage.tsx), [LNURL](../lib/lnurl-safe.ts), [eID-Referenz](../lib/eid.ts), [lokale Historie](../lib/database.ts). **245 App-Tests und zwei native Kryptografie-Tests bestanden am 21. September 2026**, einschließlich Bitcoin-Standard, expliziter HBAR-Auswahl, gemeinsamer Historie für beide Assets, unveränderten Gebühren-/Autorisierungsprüfungen und Bitcoin-Bewertung ohne HBAR-Kurs. TypeScript und Lint für die geänderten App-Dateien bestanden. Die neue Oberfläche wurde im Browser mit synthetischen Daten bei 320/360 px geprüft; die aktuelle Geräteerprobung ist oben dokumentiert.
