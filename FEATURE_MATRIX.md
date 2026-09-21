# Opago Wallet – Feature-Matrix

Stand: **21. September 2026**. Grundlage: Meeting-Dokument `opago-MVP-Uebersicht.pdf` (besonders Seiten 2 und 5), aktueller Wallet-Code und dokumentierte Prüfungen bis 21. September 2026.

Die Bewertung gilt für **unsere mobile Wallet und ihre Plattform-Anbindung**. Sie bewertet nicht den Entwicklungsstand des separaten Opago-Backends, Portals, POS oder der E-Commerce-Produkte. Die groben Prozentangaben aus dem Meeting sind keine geprüften Fertigstellungsgrade dieses Repositorys.

- **🟢 Fertig umgesetzt:** Die abgegrenzte Funktion ist implementiert und durch die vorhandenen Prüfungen belegt. Das bedeutet keine öffentliche Freigabe der gesamten App.
- **🟡 In Arbeit / nicht abgeschlossen:** Es gibt Code oder einen Prototyp; Integration, Fehlerbehebung oder entscheidende Funktionstests fehlen noch. Der Status bedeutet nicht, dass gerade jemand aktiv daran arbeitet.
- **🔴 Fehlt:** Die eigentliche Funktion ist in unserer Wallet noch nicht implementiert. Ein Button oder ein Plan zählt nicht als Implementierung.

| ID | Bereich | Feature | Status | Vorhanden / noch offen |
| --- | --- | --- | --- | --- |
| W01 | Grundlage | React-Native-App und interner Android-Build | 🟢 Fertig umgesetzt | App wird gebaut und auf Android installiert. Die letzte vollständige Aktualisierung ist auf dem ersten Gerät nachgewiesen; das zweite benötigt noch denselben Stand. |
| W02 | Grundlage | Lokale Wallet-Schlüssel und Non-Custodial-Grundmodell | 🟢 Fertig umgesetzt | Recovery-Phrase in nativem SecureStore; Signierung im Gerät. Unabhängige Sicherheitsprüfung separat unter R03. |
| W03 | Oberfläche | Startbildschirm, Home und Navigation | 🟢 Fertig umgesetzt | Bitcoin als Standard: Einstieg und Bitcoin-Eurobetrag; HBAR-Guthaben und Asset-Auswahl über „Erweiterte Optionen“. Darunter gemeinsame Historie für Bitcoin und HBAR. Logo/Scanner, Aktionen, Kontur-Icons und sichtbare Zurück-Aktionen vorhanden. |
| W04 | Oberfläche | Englisch, Deutsch, Französisch und Spanisch | 🟢 Fertig umgesetzt | Sprachauswahl, gespeicherte Präferenz und Übersetzungen implementiert; automatische Tests und Browserprüfung dokumentiert. Native Sprach-/Screenreader-Abnahme unter R02. |
| W05 | Oberfläche | Laden, echtes Nullguthaben und veraltete Werte unterscheiden | 🟢 Fertig umgesetzt | Unbekannte Werte erscheinen nicht als null; Aktualisierung und Fehler sind gekennzeichnet. |
| W06 | Performance | Guthaben nach dem Entsperren schnell anzeigen | 🟢 Fertig umgesetzt | Ziel auf Android …8690 erreicht: drei gemessene Starts nach Authentifizierung mit aktuellem Bitcoin-Guthaben nach 3,617 / 4,162 / 3,837 s (Ø 3,872 s; alle unter 5 s), zuvor 11,805 s. Gespeicherter Stand nach 1,2–1,7 s sichtbar. Einmalige native Seed-Berechnung und nachgeladene optionale Bereiche umgesetzt. Weitere Geräte/iOS unter R02 noch abzunehmen. |
| W07 | Oberfläche | Transaktionshistorie ausklappen und erst dann laden | 🟢 Fertig umgesetzt | Eine gemeinsame Historie für Bitcoin und HBAR unterhalb der erweiterten Optionen, anfangs eingeklappt. Beide Assets laden erst beim Öffnen der Historie, unabhängig von der erweiterten Asset-Liste. Tests prüfen Reihenfolge, gemischte Einträge, Öffnen, Schließen und Aktualisieren. |
| W08 | Sicherheit | Backup-Führung und Wiederherstellung | 🟡 In Arbeit | Nummerierte Worteingabe, Backup-Prüfung und dauerhafter Status vorhanden. Vollständige Wiederherstellung beider Mainnet-Assets auf dem zweiten Gerät noch offen. |
| W09 | Sicherheit | Biometrie, Geräte-PIN und Inaktivitätssperre | 🟡 In Arbeit | Implementiert und automatisch getestet. Vollständige Geräteprüfung für PIN, Abbruch, Hintergrundwechsel und tatsächliche Inaktivität offen. |
| P01 | Bitcoin | Lightning-Zahlungen über Spark senden | 🟡 In Arbeit | Betrag, Rechnung, Gebühren, Review, Autorisierung und Versand implementiert. Vollständige Mainnet-Abnahme inklusive Fehlerfällen offen. |
| P02 | Bitcoin | Lightning-Zahlungen anfordern und empfangen | 🟡 In Arbeit | Rechnung/QR, Statusprüfung und automatisches Schließen der Erfolgsanzeige vorhanden; Nutzer hat einen Zahlungseingang berichtet. Vollständige Neustart-/Ablauf-/Fehlerfallprüfung offen. |
| P03 | Bitcoin | QR, LNURL und Lightning-Adressen | 🟡 In Arbeit | Scanner, Empfängerauflösung und variable Beträge umgesetzt. Einzelne Live-Auflösungen geprüft; wiederholtes Scannen und vollständiger Zahlungsablauf auf Geräten noch abzunehmen. |
| P04 | Zahlungen | Betrags- und Gebührenprüfung vor Freigabe | 🟢 Fertig umgesetzt | Review und Grenzprüfungen implementiert und durch Regressionstests belegt. Geräteautorisierung und vollständige Zahlungsabnahme bleiben eigene Punkte. |
| P05 | Zahlungen | Offene Zahlungen nach Neustart abgleichen | 🟡 In Arbeit | Dauerhafte Journale und Abgleich vorhanden. Vollständige Mainnet-Prüfung bei Verbindungsabbruch und Prozessende fehlt. |
| A01 | Opago-Account | Login/Logout über Opagos öffentliche API | 🔴 Fehlt | Unsere Einstiegsseite erstellt/restauriert eine Wallet; sie meldet nicht bei einem Opago-Account an. |
| A02 | Opago-Account | Wallet und Dashboard bidirektional verknüpfen/trennen | 🔴 Fehlt | Kein fertiger Verknüpfungsablauf, kein Konto-/Gerätestatus und kein Widerruf in der App. |
| A03 | Opago-Account | Account-2FA | 🔴 Fehlt | Lokale Biometrie und Geräte-PIN sind vorhanden; eine zusätzliche Anmeldung mit Opago-Account-2FA fehlt. |
| A04 | Opago-Account | Privat-/Geschäftskundenstatus in der App | 🔴 Fehlt | Keine integrierte Zuordnung zu einem Opago-Profil und dessen Berechtigungen/Identifizierungsstatus. |
| D01 | Dashboard | Opago-Zahlungen dem Account zuordnen und synchronisieren | 🔴 Fehlt | Lokale und netzwerkbasierte Historie vorhanden; kein fertiger Plattformabgleich mit gemeinsamen Zahlungsreferenzen. |
| D02 | Dashboard | Übrige Wallet-Transaktionen optional teilen | 🔴 Fehlt | Auswahl, Einwilligung, Synchronisation und Widerruf fehlen. |
| I01 | Identifizierung | Browserbasierte Identifizierung / KYC-Anbindung | 🟡 In Arbeit | eID-Referenzcode und lokale Referenzdienste vorhanden, in der aktuellen Wallet deaktiviert. Fertige Provider-/Plattformintegration und Abnahme fehlen. |
| I02 | Identifizierung | Automatische Identifizierung bei Opago-Zahlungen | 🔴 Fehlt | Kein produktiver Ablauf vom verknüpften Account zur erforderlichen Identitätsübermittlung. Der eID-Prototyp allein erfüllt dieses Feature nicht. |
| I03 | Identifizierung | Vollständige UMA-Zahlungen | 🔴 Fehlt | LNURL-Vorarbeit vorhanden; die vollständige UMA-Anbindung mit den benötigten Identitäts-/Protokollabläufen fehlt. |
| R01 | Veröffentlichung | Google-Play-/Apple-App-Store-Einreichung | 🔴 Fehlt | Interne Android-Installation vorhanden; keine abgeschlossene Store-Einreichung im geprüften Projektstand nachgewiesen. |
| R02 | Veröffentlichung | Vollständige Android-/iOS-Geräteabnahme | 🟡 In Arbeit | Android-Builds, Teilprüfungen und automatische Tests vorhanden. Vollständige Mainnet-/Recovery-/Barrierefreiheitsmatrix und iOS-Abnahme offen. |
| R03 | Veröffentlichung | Unabhängige Sicherheitsprüfung und Freigabe | 🔴 Fehlt | Interne Prüfungen und Unterlagen vorhanden; abgeschlossene unabhängige Prüfung mit Freigabe nicht dokumentiert. |
| X01 | Bisheriger Umfang | HBAR senden/empfangen mit bestehender Konto-ID | 🟡 In Arbeit | Implementiert; frühere Testnet-/Mainnet-Nachweise vorhanden. Aktuelle Fehlerkorrekturen benötigen noch vollständige Geräteabnahme. Im Bitcoin-MVP nur über „Erweiterte Optionen“ sichtbar; vorhandene Schlüssel und Guthabenzugriff bleiben erhalten. |
| X02 | Bisheriger Umfang | Neue HBAR-Wallet direkt aus HashPack finanzieren | 🔴 Fehlt | Kompatibler erster Aktivierungsablauf fehlt. Bestehende aktive Konten bleiben nutzbar; der aktuelle Hinweisbildschirm löst die Aktivierung nicht. |
| X03 | Bisheriger Umfang | Tauschen / Swaps | 🔴 Fehlt | Nur „Coming soon“. Keine Swap-Ausführung. Im Meeting-Dokument nicht als Payment-App-MVP-Feature aufgeführt. |

Entschieden am 21. September 2026: **Bitcoin ist die Standardansicht; HBAR bleibt unter zunächst eingeklappten erweiterten Optionen erreichbar.** Der große Home-Eurobetrag bewertet ausschließlich Bitcoin. Bestehende HBAR-Wallets werden nicht auf andere Schlüssel umgestellt.

Offene Produktentscheidungen aus dem Strategieabgleich:

1. **Account-Pflicht:** Entscheiden, ob Basiszahlungen ohne Account möglich bleiben oder Anmeldung Voraussetzung wird.
2. **Identifizierung:** Klären, ob „Privatkunden nichts“ auf Seite 2 den heutigen Entwicklungsstand oder den gewünschten Umfang beschreibt; anschließend die konkreten Auslöser und benötigten Daten festlegen.
3. **Plattform-Schnittstelle:** Bestehende API-/Sandbox-Unterlagen und verfügbare Backend-Funktionen prüfen. Hier als fehlend markierte App-Anbindungen können auf bereits vorhandenen Plattformfunktionen aufbauen.

Empfohlene Reihenfolge: bestehende Zahlungs-/Recovery-/Performance-Punkte abschließen; Account- und Zahlungsreferenz-Schnittstellen gemeinsam mit dem Plattformteam festlegen; Verknüpfung und Dashboard-Abgleich implementieren; Identifizierung/UMA integrieren; vollständige Geräte-, Sicherheits- und Store-Freigabe abschließen. Die Plattformabstimmung kann parallel zur Stabilisierung beginnen.

Belege: [Release Notes](RELEASE_NOTES.md), [Release Readiness](PUBLIC_RELEASE_READINESS.md), [Security](SECURITY.md), [Feature-Schalter](lib/product-capabilities.ts), [Wallet-Lifecycle](hooks/useWalletAuth.ts), [Home](app/(tabs)/index.tsx), [Sprachen](hooks/useLanguage.tsx), [LNURL](lib/lnurl-safe.ts), [eID-Referenz](lib/eid.ts), [lokale Historie](lib/database.ts). **218 App-Tests und zwei native Kryptografie-Tests bestanden am 21. September 2026**, einschließlich Bitcoin-Standard, expliziter HBAR-Auswahl, gemeinsamer Historie für beide Assets, unveränderten Gebühren-/Autorisierungsprüfungen und Bitcoin-Bewertung ohne HBAR-Kurs. TypeScript und Lint für die geänderten App-Dateien bestanden. Die neue Oberfläche wurde im Browser mit synthetischen Daten bei 320/360 px geprüft; vollständige native Zahlungs- und Barrierefreiheitsabnahme bleibt separat offen.
