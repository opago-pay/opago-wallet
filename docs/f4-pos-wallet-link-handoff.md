# F4 · Wallet-side POS link

Stand: 06.10.2026. Task `recfkncDb6Ol9ZAYw`, Vertrag `docs/lnurl-spark-contracts/v2`, Version 0.2.0. Keine Geräte-/Backend-Abnahme, kein Deployment, keine echten Zahlungen oder produktive Verknüpfung.

## Ausgangsbasis und F3

Remote-Referenzen aktualisiert. Neuer Branch `codex/f4-pos-wallet-link` direkt aus `origin/mvp-branch` bei `d980097e9bbca4d397a959aa2ce8ad40d35bf47b` (Merge von F3-PR #40). Separater Worktree; der ursprüngliche Checkout und alle vorhandenen lokalen Dateien bleiben erhalten. Keine Übernahme fehlender Abhängigkeiten aus anderen Branches. Keine AGENTS.md im Repository oder seinen übergeordneten Arbeitsverzeichnissen gefunden.

F3 stellt Konto-/Wallet-Sitzungen, installationsgebundene Wallet-Proofs, Spark-Signer, Gerätefreigabe, private Speicherung, beständige Operationsschlüssel und den HPKE/HKA-Transport bereit. Diese Bausteine werden wiederverwendet. Der Signer unterstützt jetzt zusätzlich `pos_bind` mit exakt `{pos_id, binding_intent_id, binding_version}` und JCS-Hash. Wallet/Empfängerzuordnung folgt dem authentifizierten Wallet-Bearer und dem eingefrorenen Intent; kein erfundenes Empfängerfeld im Proof. Wallet-Proof und POS-Verwaltungsrechte bleiben getrennt.

## Tatsächliche Vertragslücken

| 0.2.0 bietet | Für die vollständige Wallet-Integration fehlt |
| --- | --- |
| `POST /api/v2/pos/{pos_id}/binding-intents`, nur `operator_fresh`, Antwort `PosBindingIntent` | QR-Payload/Encoding, sichere Erkennung, ggf. Herkunft und opake Referenz |
| `GET /api/v2/pos/{pos_id}`, nur `operator`, Antwort `Pos` | Wallet-lesbarer Intent und autoritative Händler-/POS-/Empfängerdaten; Händler ist kein Feld von `Pos` |
| `POST /api/v2/pos/{pos_id}/bindings`, `wallet`, Request `PosBindingConfirm`, Antwort `Pos` | Lesbarer Status einschließlich beider Zustimmungen, unbekanntem Ergebnis und endgültigem Abschluss |
| Intent enthält `operator_confirmed`, `recipient_confirmed`, Ablauf und nächste Version | Separater Betreiberbestätigungsschritt und dessen Routing/Status sind nicht definiert. Protokoll sagt Betreiberzustimmung beim Start; Task verlangt separate Bestätigung. Dieser Unterschied muss versioniert geklärt werden. |
| Neues zweiseitiges Binding für Empfängerwechsel; alte Rechnungen bleiben beim alten Empfänger | Wallet-seitige Auflistung, Ablehnung/Abbruch und Trennung sind nicht definiert |

Die Vertragsdateien und fremden Berechtigungen wurden nicht geändert. Insbesondere wird der Betreiber-GET nicht mit Wallet-Bearer oder Konto-Bearer als vermeintlichem Verwaltungsrecht aufgerufen. Neue URLs oder Endpunkte wurden nicht erfunden.

`PosLinkSource` ist ein **App-Port für die noch zu vereinbarenden Funktionen**, kein neuer API-Vertrag: `decodeQr`, `review`, `list`. Er liefert `PosBindingIntent`/`Pos` aus 0.2.0, autoritative Händler-/Walletdaten und einen verbindlichen Status. `F3Integration.posLinkSource` verbindet einen späteren geprüften Backend-Adapter mit diesem Port. Es ist noch kein Live-Adapter installiert. Ohne ihn bleibt Live-F4 ausdrücklich gesperrt. Der einzige bereits vertragliche Wallet-Schreibaufruf geht durch `OpagoAccount.mutate` und den bestehenden HPKE-Transport zu `/bindings`.

## Implementierte App-Funktionen

- F4-Seite über OPAGO-Konto erreichbar. Kamera, Einfügen und manuelle Eingabe verwenden den vorhandenen Scanner samt Berechtigungs-, Hintergrund-, Fokus- und Wallet-Sitzungsschutz. Beim erkannten POS-Code wird zum eigenen Prüfablauf navigiert; keine Zahlungs-Erkennung, Rechnung oder Zahlungsfreigabe. QR-Inhalte werden nicht als URL abgerufen oder als Backend-Autorität verwendet. Navigation nutzt das bestehende einmalig konsumierbare Scan-Postfach statt QR-Geheimnissen in Routerparametern.
- Anzeige von Händlername/-ID, POS-ID/-Adresse, Zielwallet-ID/-Adresse, Netzwerk, Verknüpfungsversion und Ablauf. Wallet-Pubkey, Netzwerk, Wallet-ID, Version und unveränderliche Details werden gegen eigene Backend-Wallet und Intent geprüft. Erneute autoritative Prüfung direkt vor Zustimmung; geänderte Details erfordern eine neue Anfrage.
- Getrennte ausdrückliche Nutzerzustimmung mit Gerätefreigabe, `pos_bind`-Challenge/Proof und beständiger Bestätigung. Ablehnung auf diesem Gerät erzeugt keinen Proof und keinen POS-Schreibaufruf. Sie ist ausdrücklich **kein** serverseitiger Widerruf, weil der Vertrag dafür keinen Endpunkt enthält.
- Wallet-Zustimmung zeigt „Betreiberbestätigung ausstehend“. `Pos` als Schreibantwort genügt nicht als Erfolgsnachweis. Erst aktueller autoritativer Status mit beiden Zustimmungen, Zielwallet, aktivem POS und exakter Version zeigt Abschluss. Gespeicherter Erfolg nach Neustart/Hintergrund wird ohne erneute Prüfung nicht als aktuell bestätigt angezeigt.
- Ablauf, Wiederverwendung, falsche Wallet, fehlende Bereitschaft, Kontolöschung/Sitzungsablauf, Proof-Bindung, veränderte Details, konkurrierende Versionen und unklare Ergebnisse. Vor dem Dispatch gespeicherte Proof-Eingaben, Verify-Bytes und UUID erlauben explizite Wiederaufnahme ohne neue Bestätigung. Ein unbekanntes Ergebnis blockiert eine neue Anfrage; ein bestätigtes Ergebnis wird autoritativ abgeglichen.
- Bestehende Links über den Backend-Port; fehlgeschlagene Abfrage verwirft die alte Liste. Empfängerwechsel wird als neue Betreiberanfrage mit Zustimmung der neuen Wallet erklärt. Kein Trennungsbutton und keine erfundene Trennungsroute.
- Texte in Deutsch, Englisch, Französisch, Spanisch und Italienisch. Bestehende lokale BTC-/Lightning-/HBAR-Funktionen und F3 bleiben unabhängig.

## Lokaler Testadapter

`F4ContractTestBackend` baut auf dem bestehenden F3-Testadapter auf. Er verwendet ausschließlich synthetische Wallet-/Händlerdaten und den öffentlichen Fixture-Signer, flüchtigen UI-Speicher und lokale Methoden. Kein Netzwerk, Gerät oder SDK-Zahlungsdispatch. `opago-pos-test:<UUID>` ist **nur ein lokales Testformat**, kein behaupteter Vertrags-QR. Der lokale Adapter wird nur nach ausdrücklichem Einschalten im `__DEV__`-Build erstellt und kann nicht als Live-Integration installiert werden. Es gibt keinen automatischen Rückfall vom produktiven Ablauf.

Testablauf im Development-Build:

1. Einstellungen → OPAGO-Konto → Vertragstestmodus. Konto anmelden, Besitz nachweisen, Wallet verbinden, Vergleich bestehen lassen und eine Testadresse aktivieren.
2. „POS-Wallet-Verknüpfungen“ öffnen. Testmodus ist sichtbar. „Test: Betreiber startet die Verknüpfung“ erzeugt eine lokale 5-Minuten-Anfrage und lädt ihre Details.
3. Zustimmen oder lokal ablehnen. Nach Zustimmung muss „Betreiberbestätigung ausstehend“ erscheinen.
4. „Test: Betreiber bestätigt separat“ simuliert ausschließlich die zweite Rolle. Erst danach erscheint die bestätigte lokale Verknüpfung. „Aktuelle POS-Verknüpfungen laden“ zeigt sie.

Die automatisierten Tests simulieren zusätzlich Prozessverlust mit dem PrivateStore-Port, verlorene Antworten, Ablauf, unterschiedliche Bestätigungsreihenfolge, konkurrierende Änderungen und Sitzungsablauf. Der UI-Testadapter ist flüchtig; er behauptet keine dauerhafte Backend-Datenbank oder echte mobile SecureStore-/Kamera-Abnahme.

## Integration und verbleibende Abnahme

Lokale Prüfungen:

| Prüfung | Ergebnis |
| --- | --- |
| Vollständige bestehende Wallet-Suite | `npm test`: 796 Tests, 795 bestanden, 0 Fehler, 1 bestehender iOS-Test übersprungen. Log: `output/f4-full-tests.log`. |
| F4-Nachweise | 32 zusätzliche Tests: 24 Zustands-/Proof-/Fehlerfälle, 5 Bildschirmabläufe, 2 Scannerfälle, 1 authentifizierter HPKE-Rundlauf der vertraglichen Bestätigungsroute. Enthält eine echte lokale Signatur mit dem vorhandenen Spark-SDK-Signer, ohne RPC oder Zahlungsdispatch. |
| Statische Prüfungen | `npm run typecheck`, `npm run lint` und `git diff --check` erfolgreich, keine Lint-Warnungen. |
| Android-/iOS-Bundles | Lokaler Expo-/Hermes-Export für beide Plattformen erfolgreich. Log: `output/f4-native-bundles.log`. Bestehende Sentry-/Noble-Package-Exportwarnungen im Log; kein APK-/Xcode-/Geräte- oder Backend-Nachweis. |

Der übersprungene bestehende iOS-Test und lokale JS-/Hermes-Bundles zählen nicht als Geräteabnahme. Gemeinsame `acceptance.json` und ihre Nachweiskennzeichnungen bleiben unverändert.

1. Mit M3/Backend eine versionierte Ergänzung für QR, wallet-lesbare Details, Status/beide Zustimmungen, Auflistung und gegebenenfalls Ablehnung/Trennung festlegen. Betreiberzustimmung beim Start versus separate Bestätigung und das aktuelle `Pos`-Antwortschema abgleichen.
2. `PosLinkSource` an diese vereinbarten, autorisierten Routen anbinden; echte HKA-/OIDC-Konfiguration und Backend-Readiness von F3 provisionieren. Keine Wallet-Verwaltungsrechte ergänzen.
3. Auf Android/iOS in isolierter Umgebung ohne Zahlungsdispatch prüfen: Kamera/Paste, explizite Ablehnung/Zustimmung, frischer aktionsgebundener Spark-Proof und HPKE, separate Betreiberbestätigung, fünf Minuten Ablauf, verwendeter QR, falsche Wallet, abgelaufene Sitzungen, Abbruch, Hintergrund/Lock/Prozessverlust, verlorene Antwort und konkurrierende Clients.
4. Backend-/Geräte-Abnahme: atomare Bindung nur mit beiden Zustimmungen und alter Version; QR/Proof-Replay über Replikate; Liste/Status nur für eigene Wallet; unbekannte Schreibantwort mit gleicher Operationskennung; neuen Empfänger nur per neuer beidseitiger Zustimmung. Frühere offene Discovery-Kontexte ungültig, bereits ausgegebene Rechnungen weiterhin ursprünglichem Empfänger zugeordnet. Kein echter Zahlungsnachweis in diesem Auftrag.

F4 bleibt **In progress**. Erfolgreiche Simulationen ersetzen weder fehlende Backend-Funktionen noch Geräte-/Integrationsabnahme. Nur dieser Task wird aktualisiert; F3/M3 und andere Tasks bleiben unverändert.
