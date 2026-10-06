# F3 Wallet – Implementierung und Integrationsübergabe

Stand: 06.10.2026. Auftrag: App-Seite von F3, Airtable `recS1r5jYbUEwDMFP`, gemeinsamer Vertrag `docs/lnurl-spark-contracts/v2`, Version 0.2.0. Keine Produktivveröffentlichung, Store-Einreichung oder echten Zahlungen.

## Was implementiert ist

- Optionales OPAGO-Konto unter Einstellungen und Lightning-Empfang. Lokale Wallet-Erstellung, bisherige 12-Wörter-Wiederherstellung und BTC-/Lightning-/HBAR-Verarbeitung bleiben unabhängig davon.
- Kontoanmeldung über externen Browser mit Authorization Code, PKCE S256, State/Nonce und getrennten Access-/ID-Tokens. Signaturen beider Tokens werden gegen frisches, issuergebundenes JWKS geprüft: RS256 über die nativen Android-/iOS-Plattformfunktionen, ES256 über die vorhandene Kurvenbibliothek. Issuer, beide Audiences, Subject, Typ, Nonce, verifizierter Kontakt und Ablauf werden kontrolliert; ungeprüfte Claims genügen nicht. Der Browserwechsel erhält die aktuelle Sitzung und widerruft ältere Zahlungsfreigaben.
- Eigener Wallet-Besitznachweis mit dem vorhandenen Spark-Signer und anschließend ausdrücklich bestätigte Kontobindung. Die vorhandene Implementierung `lib/wallet-auth-proof.ts` wurde um die F3-Aktionen erweitert; Hashes aller unterstützten Aktionen stimmen mit den gemeinsamen Fixtures überein.
- Kontoanmeldung und Kontolöschung sind auch bei fehlender Spark-Verbindung möglich. Besitznachweis, Bindung, Wiederherstellung und Zahlungen benötigen die passende lokale Wallet. OPAGO-Abmeldung löscht keine lokalen Wallet-Schlüssel.
- Klare KYA-Schnittstelle über `Wallet.photo_match`: Revision, aktive Freigaberevision, Korrekturstatus und Prüfstatus. Eine spätere nicht erfolgreiche Revision ersetzt die aktive Freigabe nicht stillschweigend (PHOTO-04). Fotoabgleich ist keine vollständig verifizierte Identität; `NOT_VERIFIED` bleibt erhalten.
- Lightning-Adresse setzen, umbenennen, deaktivieren und separat reaktivieren. Eine nutzbare Adresse benötigt einen frischen, eigentümergeprüften Backend-Snapshot mit Status `active`. Adresse, LNURL, QR-Inhalt und konfigurierte öffentliche Herkunft müssen zusammenpassen. Im Empfangsbildschirm steht die bestätigte persönliche Adresse vor der weiterhin verfügbaren einzelnen Spark-Rechnung.
- Vier UMA-Vermittlungsschritte: `uma-discovery`, `uma-discovery/verify`, `uma-pay-request`, `uma-pay-response`. Die App transportiert die Backend-Nachricht und die exakten Gegenantworten; VASP-Schlüssel, IVMS-Formatierung, Signaturprüfung der Gegenpartei und Compliance-Entscheidungen bleiben im Backend.
- Vor dem ersten UMA-Austausch: Empfänger, Betrag, Gebührenobergrenze und erforderliche Daten je Anbieter anzeigen; ausdrückliche Zustimmung. Danach: überprüfte Rechnung, Empfänger, Betrag, Netzwerk und Zahlungsgebühren gesondert bestätigen. Der Live-Zahlungsweg verwendet bestehende Spark-Vorbereitung, Gebührenprüfung, Geräteautorisierung und das Zahlungsjournal.
- Lokale Prüfung von Rechnungs-Signatur, Betrag, Netzwerk, Exchange-ID, Empfänger-Metadaten, HTTPS-Ziel, Payment-Hash, effektivem UMA-Description-Hash und Ablaufzeit. Der effektive Hash kommt vom Backend; er wird nicht pauschal als SHA256 der Discovery-Metadaten berechnet.
- Beständige Operationsschlüssel vor mutierenden Aufrufen, begrenzte Wiederholungen mit unveränderten Eingaben und begrenztem Backoff/Retry-After. Gegenantworten werden vor der Backend-Prüfung gespeichert, damit verlorene Antworten nicht zu erneutem Datenversand führen. Ein unklarer Zahlungsstatus bleibt `pending` und erlaubt keine zweite Zahlung. Unabgeschlossene Adressvorgänge können explizit wiederaufgenommen werden.
- OPAGO-Wallet schließen, Konto-/Wallet-Nachweis nach lokaler Wiederherstellung, getrennte Adressreaktivierung, Kontolöschung ohne aktive OPAGO-Wallet, Löschbeleg und expliziter Neustart nach bestätigter Löschung. Die Löschung weist auf die serverseitige Aufbewahrung hin und behauptet keine vollständige Datenvernichtung.
- Geschützte lokale Speicherung mit gerätegebundenem SecureStore, begrenzten Chunks und atomarem Zeigerwechsel. AsyncStorage enthält nur einen Index opaker Schlüssel. Die bestehende lokale Wallet-Löschung entfernt auch diese F3-Daten.
- Android verwirft ungültiges UTF-8, statt signierte Peer-Antworten durch Ersatzzeichen zu verändern. Gültiges UTF-8 einschließlich BOM, kombinierter Zeichen und Zeilenumbrüchen bleibt erhalten. Der vorhandene strikte Netzwerktransport sperrt Redirects und private Ziele und begrenzt Antworten.

Fotoaufnahme/OCR, vollständiges KYA-Intake, POS-Bindung, Transaktionssynchronisierung/F5 und MoonPay bleiben eigene Pakete. Es wurde keine Xapo-Sonderintegration hinzugefügt. Ein UMA-Fehler wechselt nicht automatisch zu LNURL, BTC oder einem anderen Zahlungsweg.

## Dateien und Schnittstellen

| Bereich | Einstieg |
| --- | --- |
| Kontoseite | `app/opago-account.tsx` |
| UMA-Seite | `app/uma-send.tsx` |
| Bestätigte Adresse im Empfang | `components/opago/lightning-address-receive.tsx` |
| Konto-/Wallet-Zustand, Proofs, Restore, Löschung | `lib/opago/account.ts` |
| UMA-Zustandsautomat und lokale Rechnungsprüfung | `lib/opago/uma.ts` |
| Live-Anbindung und bestehender Spark-Zahlungsweg | `lib/opago/runtime-native.ts`, `installF3Integration(...)` |
| Vertrag und HKA | `lib/opago/contract.ts`, `lib/opago/api.ts`, `lib/opago/hka.ts`, `lib/opago/hpke-crypto.ts`, `lib/opago/encoding.ts` |
| OIDC-/Browser-Anbindung und Signaturen | `lib/opago/oidc.ts`, `lib/opago/oidc-native.ts`, `lib/opago/oidc-verifier.ts`; native `OidcSignature.kt` / `OidcSignature.swift` |
| Konfiguration und automatische Live-Anbindung | `lib/opago/settings-native.ts`, `lib/opago/bootstrap-native.ts`, `.env.example` |
| Native private Speicherung | `lib/opago/store-native.ts` |
| Ausdrücklicher lokaler Testadapter | `lib/opago/test-adapter.ts`, `lib/opago/test-invoice.ts` |
| Generierte Vertragstypen | `lib/opago/contract-types.ts`; neu erzeugen mit `node scripts/generate-f3-contract-types.cjs` |

Die Vertragsdateien wurden nicht verändert. Die generierten Typen und die Laufzeitprüfung verwenden dieselben öffentlichen Routen und Schemas. `HkaTransport.request` muss eine authentifizierte, bereits entschlüsselte Antwort liefern; Klartext-Fallback ist ausgeschlossen.

## Testadapter ausprobieren

In einem Development-Build: Einstellungen → OPAGO-Konto → „Vertragstest starten“. Konto anmelden, Wallet-Besitz nachweisen, ausdrücklich verbinden, „Test: Vergleich bestanden“ wählen und einen Adressnamen aktivieren. Dann UMA öffnen, `$alice@receiver.example` und einen SAT-Betrag eingeben, Datenfreigabe prüfen, zustimmen und die simulierte Zahlung bestätigen. Schließen, Wiederherstellung und Löschbeleg lassen sich anschließend ebenfalls durchspielen.

Der Adapter arbeitet ausschließlich mit synthetischen Daten und einem öffentlichen Fixture-Schlüssel. Er ruft weder OIDC/Backend/UMA-Anbieter noch Spark-Zahlungsfunktionen auf. Die Testadresse hat absichtlich keinen Empfangs-QR. Der UI-Schalter ist auf `__DEV__` begrenzt; es gibt keinen automatischen Wechsel vom Live-Betrieb zum Testadapter. Im UI-Testmodus ist der Speicher flüchtig. Prozessverlust und beständige Wiederaufnahme werden zusätzlich in den Vertragstests mit dem Speicherport simuliert.

## HKA-Bestandsprüfung, Umsetzung und Konfiguration

HKA recgCEWwCBr0Civid bleibt unverändert **Done** gemäß Fabian. Michaels Aktivierungsauftrag rec0YgcGumC9pllk0 für AUTH_HPKE_KEYRING_FILE bleibt separat.

Vor der Umsetzung wurden aktueller Wallet-Checkout, lokale und aktualisierte Remote-Branches, Wallet-PRs/-Historie und lokale Worktrees geprüft. Im verfügbaren Wallet-Quellstand war kein exportierbarer 0.2.0-HKA-App-Transport auffindbar. Im lokalen C:\dev\opago-api existieren services/hpke_auth_service.py / PR 546 für das ältere Login-Format und services/wallet_v3_transport.py für die neuere Wallet-Transportgrenze. Das ältere Login-Format mit anderem info, leerem AAD und Klartext-Tokenantwort erfüllt den neuen Vertrag nicht.

Auf ausdrücklichen Folgeauftrag wurde der fehlende **F3-App-Transport** ergänzt. Wiederverwendet werden die vorhandene native Netzwerkschicht, SecureStore, Spark-Signer und der gemeinsame Transportvertrag. Die RFC-9180-KEM-/Key-Schedule-/Exporter-Implementierung stammt aus hpke-js (@hpke/core 1.9.0, @hpke/common 1.10.1, X25519-Erweiterung 1.8.0); AES-256-GCM und HKDF kommen aus den Noble-Bibliotheken. Ein schmaler Adapter verbindet diese Bibliotheken ohne SubtleCrypto mit Hermes. Es gibt keinen eigenen kryptografischen Algorithmus und keinen alten AES-/Klartext-Fallback. Bibliotheksquellen: https://github.com/dajiaji/hpke-js und https://github.com/paulmillr/noble-ciphers.

Implementiert sind signiertes Ed25519-Schlüsseldokument gegen lokal gepinnte Haupt-/Backup-Roots, Audience und Ablauf, Widerrufe, dauerhaft gespeicherte Rollback-Marken, AppConfig-Freshness höchstens 300 Sekunden, tatsächliche native Buildnummer und Mindest-Build-Sperre. Doppeltes JSON, ungültiges UTF-8/Base64url und mehrdeutige Pfade/Queries werden abgewiesen. Jeder Versuch hat neuen Senderkontext und Replay-Nonce; fachliche UUID und Eingabe bleiben erhalten. GET/DELETE verwenden den verschlüsselten Header, POST/PUT einen JSON-Envelope. Antworten sind mit ursprünglichem AAD und HTTP-Status gebunden; ein authentifizierter Schlüssel-Fehler erlaubt genau eine erneute Konfigurations-/Schlüsselabfrage. Ein Klartextfehler bleibt ein Fehler. Bei Mindest-Build-Sperre führt ein ausdrücklicher Update-Knopf zum lokal konfigurierten, geprüften Verteilungslink; es wird nichts installiert oder eingereicht.

Die öffentliche Konfiguration in .env.example ist standardmäßig **deaktiviert**. Für eine eigene isolierte Umgebung müssen folgende öffentliche Buildwerte provisioniert werden:

| Wert | Bedeutung |
| --- | --- |
| EXPO_PUBLIC_OPAGO_F3_ENABLED | true nur für einen bewusst konfigurierten nativen Build |
| EXPO_PUBLIC_OPAGO_F3_API_ORIGIN | Exakte öffentliche HTTPS-API-Origin, ohne abschließenden Slash |
| EXPO_PUBLIC_OPAGO_F3_ADDRESS_ORIGIN | Exakte HTTPS-Origin der persönlichen Lightning-Adressen |
| EXPO_PUBLIC_OPAGO_F3_HPKE_ROOTS_JSON | JSON-Objekt Signing-Key-ID → kanonischer Base64url-Ed25519-Public-Key; Haupt-/Backup-Roots derselben Umgebung, keine Fixture-Keys |
| EXPO_PUBLIC_OPAGO_F3_OIDC_ISSUER | Exakter erlaubter HTTPS-Issuer; Discovery-Endpunkte und JWKS bleiben auf dessen Origin |
| EXPO_PUBLIC_OPAGO_F3_OIDC_CLIENT_ID | Provisionierter öffentlicher Mobile-Client, kein Client Secret |
| EXPO_PUBLIC_OPAGO_F3_OIDC_REDIRECT_URI | Exakt beim Identity Provider registrierte App-Redirect-URI; App-Schema opagowallet existiert |
| EXPO_PUBLIC_OPAGO_F3_OIDC_ACCESS_AUDIENCE | Erwartete API-Audience des Access-Tokens, getrennt vom ID-Token |
| EXPO_PUBLIC_OPAGO_F3_IOS_UPDATE_URL / ANDROID_UPDATE_URL | Tatsächlicher, freigegebener Verteilungslink je gebauter Plattform auf opago.com, Apple/TestFlight oder Google Play |

Die Werte sind keine Geheimnisse. Auth-/Token-/JWKS-Endpunkte werden über geprüfte OIDC-Discovery ermittelt. Die Live-Integration wird beim ersten Öffnen eines Kontodienstes automatisch erstellt; ein vorhandenes anderes Modul kann weiterhin über installF3Integration angeschlossen werden. Fehlt Konfiguration, sichere native Bridge, frisches AppConfig oder ein vertrauenswürdiger Schlüssel, bleiben Kontodienste gesperrt und die lokale Wallet nutzbar. Der öffentliche Fixture-Root und .invalid-Ziele sind im Live-Bootstrap ausgeschlossen. Expo Go/Web sind keine Live-HKA-Laufzeit; ein aktualisierter nativer Build ist erforderlich.

Weiterhin benötigt werden funktionierende öffentliche Vertragsrouten im Backend, Michaels Keyring-Aktivierung und provisionierter Keycloak-Client/JWKS/Redirect samt Access-Audience. Kritische serverseitige Sitzungs-/Key-Revoke- und Tombstone-Prüfungen sowie die freigegebene Aufbewahrungsmatrix bleiben Backend-Aufgaben. KYA/KYS muss Wallet.photo_match liefern; reczMRuGA087rQj75 ist noch Blocked. Fotoaufnahme, binärer Foto-Upload/Mediennormalisierung und die KYA-App-Oberfläche bleiben das getrennte Paket. Der gemeinsame Photo-Exporter-Vektor wird lokal geprüft; dies ist kein implementierter Foto-Upload oder Geräte-Nachweis.

## Offene UMA-/TRU-Entscheidung

Der am 06.10. erneut gelesene TRU-Auftrag `recAtXztY1cAEL0cw` beschreibt seit 04.10. ausdrücklich: „A non-custodial payment never waits for this exchange.“ Slice 1/PR 596 baut auf PR 586 auf; die vollständigen Party-Felder kommen nach Datenmodell-Schritt 5 (`recPrG3VjJjno2wDp`).

Demgegenüber stellt Vertrag 0.2.0 in `UmaPayResponseOutput` nur `complete` oder `failed` bereit; die gültige UMA-Rechnung wird nach dem abgeschlossenen, verifizierten Austausch ausgegeben. Die App darf daraus keine neue Zahlungsfreigabe bei `pending`, Timeout oder Fehler ableiten.

**Konkret zu entscheiden:** Wie liefern die vier F3-Schritte bei einem noch laufenden oder fehlgeschlagenen Austausch eine überprüfbare UMA-Rechnung, während die non-custodial Zahlung nicht wartet? Welche versionierte Antwort beschreibt diesen Zustand, wer prüft den Zahlungsbezug, und wie werden erforderliche Identitätsdaten/Fehler weiterbehandelt? Michael/Backend-/TRU-Verantwortliche müssen dies gemeinsam im Vertrag festlegen. Die App definiert weder ein eigenes AML-Gate noch einen Zahlungs-Fallback.

Zweite Lücke: 0.2.0 liefert vor dem Austausch kein vertrauenswürdiges Manifest der **tatsächlich** benötigten Identitätsfelder und empfangenden Anbieter. Ohne dieses Manifest wäre die verlangte informierte Zustimmung geraten. `UmaDisclosureProvider` beschreibt die erforderliche Schnittstelle mit Empfänger-/Betrags-/Gebührenbindung, Version, Ablauf, Anbietern und Feldern; es wurde keine neue öffentliche Backend-Route erfunden. Der Backend-Adapter muss diese Informationen liefern und ihre Aktualität unmittelbar vor Datenversand bestätigen. Persönliche Werte müssen für diese Übersicht nicht geladen werden.

Live-UMA bleibt ohne angeschlossenes Manifest und dokumentierte Vertragsentscheidung gesperrt. `umaContractResolution` benennt die gemeinsam freigegebene Revision; ein beliebiger Text ist keine fachliche Entscheidung und ersetzt keine nötige Schema-/Vertragsänderung. Der lokale Adapter demonstriert ausschließlich die bestehende 0.2.0-Sequenz `complete` → Rechnungsprüfung → ausdrückliche Zahlungsbestätigung.

## Verifikation und Grenzen der Nachweise

Die automatisierten F3-Tests decken den normalen Ablauf, falsche Kontobindung/Proofs, Sitzungsablauf und Wiederanmeldung, noch nicht aktive oder manipulierte Adresse, Betrag/Netzwerk/Hash/Description/Expiry der Rechnung, manipulierte Gegenantworten/Ziele, nicht unterstützte UMA-Empfänger, fehlendes Manifest, Gebührenüberschreitung, Abbruch, verlorene Backend-Antworten, Prozesswiederaufnahme, konkurrierende Bestätigungen ohne doppelte Zahlung sowie Restore/Löschung/Neustart ab. Bildschirmtests prüfen die Reihenfolge von Zustimmung und Zahlungsbestätigung, QR-Aktivierung, freiwillige Kontobindung und die explizite Löschbestätigung.

| Nachweis | Stand |
| --- | --- |
| Gesamte lokale Node-Testsuite | `npm test`: **764 Tests, 763 bestanden, 0 Fehler, 1 bestehender iOS-Test übersprungen**; davon 43 neue F3-/HKA-/OIDC-/Speicher-/Bildschirmtests und ein zusätzlicher Test der nativen HTTP-Grenze. Log: `output/f3-full-tests.log` |
| Typecheck, Lint, Diff-Prüfung | `npm run typecheck`, `npm run lint`, `git diff --check`: **erfolgreich, keine Fehler oder Lint-Warnungen** |
| Android-Modul | `android/gradlew.bat :opago-safe-http:testDebugUnitTest --offline`: **5 Tests, 0 Fehler**, Kotlin-/Java-Modul kompiliert; 2 PublicAddress-, 2 StrictUtf8- und 1 RS256-Test |
| Android-/iOS-JS-/Hermes-Bundles | Lokaler Expo-Export für beide Plattformen erfolgreich; kein APK-/Xcode-/Geräte-/Backend-Nachweis. Bestehende Sentry-Prebuild-/Noble-Exportwarnungen im Log beachten; `output/f3-native-bundles.log` |
| HPKE-/OIDC-Interop lokal | Alle vier gemeinsamen HPKE-Fixtures einschließlich Response-/Photo-Exporter und Ed25519-KeyDocument stimmen überein, auch ohne globale WebCrypto-API. Schlüsselrotation/Widerruf/Rollback, neue Envelopes bei gleicher UUID, Manipulationen und reale synthetische RS256-/ES256-Signaturen geprüft |
| Spark-Signatur | Lokaler SDK-0.7.12-Signer mit synthetischem Seed sowie gemeinsame F3-Aktions-Hash-Fixtures; kein RPC-Zahlungsnachweis |
| Native Speicherung | Echte Store-Implementierung mit simulierten SecureStore-/AsyncStorage-Ports; größere Daten, atomarer Austausch und Orphan-Wipe geprüft; keine Aussage über ein echtes Gerät |
| AUTH-01/02/03/04/05, PHOTO-01/04/06, UMA-02/03 | App-seitige Regeln bzw. lokale Vertragsfälle teilweise nachgewiesen; keine vollständige Backend-Abnahme, Refresh-Familienwiderruf oder echte Worker-/DB-Transaktion |
| HKA-Android-/iOS-Vektoren, echte Keycloak-/Backend-Aufrufe, offizielle Python-/JS-UMA-Interop | Native Geräte-/Backend-/UMA-Nachweise **nicht ausgeführt**; gemeinsame HPKE-Vektoren bisher nur in der lokalen JS-Laufzeit, nativer Android-RSA-Helfer im JVM-Modultest; iOS-RSA-XCTest vorbereitet, auf Windows nicht ausgeführt |
| Echte Geräteabläufe, tatsächliche Lightning-Abrechnung, externe UMA-Zahlung | **Nicht ausgeführt**; keine echten Zahlungen in diesem Auftrag |

Die bestehende Suite enthält einen übersprungenen iOS-Test, der zuerst ein generiertes iOS-Projekt benötigt. Dieser Test ist kein bestandener iOS-Integrationsnachweis. Gemeinsame `acceptance.json` und ihre `NOT_EXECUTED`-Kennzeichnung bleiben unverändert.

Nach Ergänzung des iOS-RSA-XCTest wurden die acht bestehenden lokalen Prüfungen für iOS-Testnachweise, Scheme-Auswahl und native Modul-Anbindung erneut erfolgreich ausgeführt. Sie prüfen die Testinfrastruktur und ersetzen die noch offene Ausführung mit Xcode nicht.

## Nächster Integrationstest und Tracking

Nach Provisionierung der öffentlichen HKA-/OIDC-Buildwerte, Verteilungslinks und Backend-Konfiguration zuerst auf Android und iOS mit isolierten Staging-Konten **ohne Zahlungsdispatch** prüfen: externe Anmeldung, getrennte Signatur und Bindung, KYA-Status, bestätigter Adress-QR, abgelaufene Sitzung, verlorene Aktivierungsantwort, 12-Wörter-Restore mit gesonderter OPAGO-Wiederherstellung/Adressreaktivierung und Löschbeleg. Dabei HKA-Vektoren, Rotation/Replay/Build-Gate und native private Speicherung prüfen.

Nach der versionierten TRU-/Manifest-Entscheidung die vier UMA-Schritte mit den gepinnten offiziellen Python-/JS-SDK-Fixtures bis zur geprüften Rechnung und zum Bestätigungsbildschirm nachweisen: exakte Providerdaten/Einwilligung, `NOT_VERIFIED`, korrekter effektiver Description-Hash, falsche Gegenantworten und Wiederholung derselben Operationskennung. Eine reale Zahlung benötigt einen eigenen autorisierten Integrationstest und gehört nicht zu diesem Auftrag.

Nur F3 wurde in Airtable fortgeschrieben. F3 bleibt **In progress**, weil Backend-/OIDC-/KYA-Konfiguration, gemeinsame UMA-Entscheidung und echte Geräte-/Interop-Abnahme fehlen. Der fehlende F3-HKA-App-Transport und Token-Verifier sind jetzt implementiert und automatisch angebunden. HKA, KYA, TRU und Human-Aufgaben wurden nicht geändert. Die Ausgangs-Working-Tree war sauber; vorhandene Repository-Inhalte wurden erhalten. Alle F3- und HKA-App-Änderungen liegen committed auf dem neuen lokalen Branch codex/f3-wallet-registration-hka-uma, ausgehend von codex/production-release-documentation. Kein Push, Deployment oder Store-Upload.
