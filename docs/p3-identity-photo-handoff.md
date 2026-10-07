# P3 Identifizierung und Foto-Upload

## Bestandsübersicht vor Änderungen (07.10.2026)

Wallet-Basis: `origin/mvp-branch` / `c67bdf26b466f636d2703dc757aa9bb04cf8184b`.
API-Basis: `origin/main` / `0df3cd52c700a9aef9e99748c81e6eb5e0b241c5` (550–553/555 gemergt).
Backend nur gelesen: `opago-compliance/main` / `3066c1af34fb0c58d0141cee0bb97f4ecdf12725`.
Neue separate Worktrees und `codex/p3-identity-photo`; ursprüngliche Checkouts unverändert.
Keine AGENTS.md in den geprüften Repository-Bäumen/übergeordneten C:/dev-Verzeichnissen gefunden.

1. **Vorhanden:** F3 OIDC, Wallet-/Bootstrap-Sitzung, explizite Bindung, geschützte Speicherung,
   HPKE/HKA und autoritativer `Wallet.photo_match` inklusive aktiver Freigaberevision. Öffentlicher Vertrag
   0.2.0 definiert acht Pflichtfelder, JPEG/PNG, 10 MiB/480–10000 px/24 MP, authentifizierten PhotoDescriptor,
   Exporter `opago-photo`, binären AES-GCM-Upload, Revisions-CAS, Status/Submit/Discard und Idempotenz.
   API-Routenmanifest/Handler leiten diese vorhandenen Routen weiter; Fotoentschlüsselung/Hash/Typ/Dimensionen
   werden bereits geprüft. Ein Exporter-Vektor allein wurde ausdrücklich nicht als Upload betrachtet.
2. **Fehlender Wallet-Code:** vollständige Form-/Review-/Status-/Korrekturansicht, Kamera/Auswahl,
   Medienaufbereitung und temporäre Dateien, tatsächlicher binärer HKA-Upload, beständige Operationen und
   unbekannte Ergebnisse mit Statusabgleich. Kein vorhandenes vollständiges P3-Modul gefunden.
3. **Öffentliche API:** bislang keine fehlende Route festgestellt; keine künstliche zusätzliche API nötig.
   Die reale öffentliche Grenze wird mit synthetischem internem Dienst lokal geprüft.
4. **Externe Abhängigkeiten:** öffentliche 0.2.0-Business-Routen im internen Backend, produktiver RecordKeyring,
   DocumentReader, Aufbewahrung/Löschung, isolierte OIDC/HKA-Konfiguration und native Geräteabnahme.
   Aktueller Backend-Bericht nennt Keyring unverdrahtet (503) und Stub-Reader (kein Pass).
5. **Vertragsfragen:** Backend `docs/wallet-identity-match.md` beschreibt nur interne realm-admin/Tenant-Routen
   mit `given_names`, optionaler Nationalität, 5 MiB und `matched/mismatched/unreadable`. Es fehlen dort
   öffentliches Enrollment/Submission-ID/Idempotenz/CAS/Worker-Status-Mapping und Gateway-Client-Vertrag.
   Außerdem sperrt dort eine neue fehlgeschlagene Revision frühere Freigaben; PHOTO-04 des öffentlichen
   Vertrags erhält sie. Diese Unterschiede brauchen Backend-Team-Entscheidung. Kein Realm-Admin-Token,
   Selfie-Feld, neues Secret, Endpoint oder eigene Freigabelogik wird in der Wallet erfunden.

## Grundlage

Implementierung verwendet den vollständigen öffentlichen Vertrag 0.2.0, nicht das abweichende interne Format.
Kontakt-E-Mail/Passwort bleiben beim Identity Provider; Fotoabgleich ist keine vollständige Identitätsprüfung,
Dokumentenechtheit oder regulatorische Freigabe. Lokale Wallet-Funktionen und Zahlungs-Gates bleiben erhalten.
Geräte-/Backend-Abnahme wird getrennt von synthetischen Tests dokumentiert.

## Implementierte App-Funktionen

Einstieg: Einstellungen → OPAGO-Konto → Wallet-Besitz nachweisen → „Identifizierung öffnen“.
`app/identity.tsx` bietet die acht Pflichtfelder, vertragliche Validierung, Reisepass/Vorderseite bzw.
Personalausweis/beide Seiten, Kamera/Bildauswahl, Vorschau/Entfernen/erneute Aufnahme, vollständige
Übersicht, Lesbarkeitsbestätigung und ausdrückliche Einreichung. Status, Worker-Fortschritt, Revision,
Korrekturmaske und aktive Freigaberevision kommen vom Backend. Einreichung ist keine Freigabe;
Fotoabgleich ist kein vollständiges KYC, keine Echtheitsprüfung und keine UMA-Verifizierung.
EN/DE/FR/ES/IT einschließlich nativer Berechtigungstexte, Screenreader-Beschriftungen,
Tastatur-/Scrollansicht und Screenshotsperre sind angeschlossen.

`lib/opago/identity.ts` verwendet ausschließlich vorhandene Create/GET/PUT/DELETE/Documents/Submit/
Revision-Routen. Vor jedem Schreiben werden UUID, unveränderter Request und gegebenenfalls Bildhash
beständig im vorhandenen privaten Speicher gespeichert. Bilder und Dateipfade werden dort nicht abgelegt.
Wiederaufnahme liest zuerst Submission-/Revisions-/Dokumentstatus und wiederholt nur dieselbe Operation
mit derselben UUID; neue HPKE-Kontexte/Nonces/IVs bleiben frisch. Es gibt keine automatische Einreichung
beim Laden. Mehrfachklicks und mehrere Ansichten werden über die vorhandene Konto-Warteschlange serialisiert.
Retry-After begrenzt Abfragen/Wiederholungen; unbekannte Ergebnisse bleiben als solche sichtbar.
Nach verlorenem lokalem Bild kann dasselbe Original für den identischen Upload gewählt werden;
ein anderer Hash ersetzt die offene Operation nicht. Ist dieses Original nicht mehr verfügbar und
der Upload nicht im Status nachweisbar, bleibt man beim Statusabgleich: Der Vertrag bietet keine
separate Abbruch-/Suchroute für eine unbekannte Bildoperation.

Konto-/Wallet-/Installations-/Umgebungs-/Synchronisationsgeneration und Wallet-Sperre begrenzen Entwürfe
und verzögerte Antworten. Hintergrundwechsel verbirgt Angaben und entfernt lokale Vorschauen. Der
Systempicker darf kurz im selben entsperrten Kontext öffnen; Kontoänderung/Sperre verwirft sein Ergebnis.
DELETE liefert nur `Ok`: Anschließend wird `/wallet/me` gelesen, um einen entfernten Erstentwurf oder
eine vom Server wiederhergestellte ältere Revision korrekt darzustellen. Eine fehlgeschlagene Abfrage
blockiert einen neuen Vorgang bis zum bestätigten Statusabgleich. Korrekturen erstellen explizit eine
neue, per Account-Sitzung autorisierte Revision und respektieren CAS/Korrekturmaske; Ablehnung startet
keine automatische neue Schleife.

`identity-media-native.ts` prüft tatsächliche JPEG/PNG-Signaturen und Grenzen vor der eigenen Dekodierung,
akzeptiert lokal konvertierbare HEIC-Dateien nur nach begrenzter Container-/Dimensionsprüfung,
normalisiert Orientierung nativ ohne Zuschnitt/Verkleinerung und exportiert JPEG mit Qualität 1.
JPEG-Metadaten einschließlich EXIF/GPS werden entfernt, Größen/Dimensionen danach erneut geprüft und
die Lesbarkeit vom Nutzer bestätigt. Unsichere/unbekannte HEIC-Varianten scheitern geschlossen.
Picker-/Manipulator-Kopien und Vorschauen liegen ausschließlich im privaten App-Cache und werden bei
Abbruch/Abschluss sowie beim nächsten Start bereinigt; ausgewählte Bibliotheksoriginale werden nicht gelöscht.
Dies ist logische Dateibereinigung, keine Garantie physischer Flash-Löschung. Es gibt keinen OCR-/Cloud-Dienst.
Der vorhandene Crash-Filter verwirft freie Fehlermeldungen, Breadcrumbs, Anhänge und Payloads;
P3 protokolliert keine Bilder, Eingaben oder Serverantworten und verwendet dafür keine Routerparameter.

HKA verschlüsselt den authentifizierten `PhotoDescriptor` und das tatsächliche Bild über
`Export("opago-photo",32)` / AES-256-GCM mit vertraglicher JCS-AAD; das Bild wird binär als IV/Ciphertext/Tag
gesendet. Android/iOS Native-Bridge akzeptieren die Base64-Brückendarstellung nur für diesen HTTPS-POST,
wandeln sie in die unveränderten verschlüsselten Bytes zurück und behalten DNS-/Peer-/TLS-/Redirect-Schutz.
Kein Klartext-/Fetch-Fallback. Foto-Deadline höchstens 120 Sekunden; Konfigurationsabruf und normales JSON
behalten ihre kurzen Grenzen. F3-Login/-Proof/-Bindung, Zahlungsregeln, lokale Wallet und F4/F5 bleiben erhalten.

## Lokaler Prototyp

1. Abhängigkeiten installieren und einen **neuen Development-Build** mit den ergänzten nativen Expo-Modulen
   verwenden; Expo Go/alte Binärdateien reichen für den sicheren nativen Upload nicht aus.
2. Einstellungen → OPAGO-Konto → „Vertragstest starten“ → „Wallet-Besitz nachweisen“ → „Identifizierung öffnen“.
   Der OPAGO-Vertragstest bleibt zusätzlich zur P3-Testwarnung sichtbar.
3. „Synthetische Identifizierungsfelder verwenden“ und „Synthetische Dokumentbilder verwenden“ wählen oder ausschließlich
   synthetische Testbilder aufnehmen/auswählen. Beide Dokumenttypen durchspielen, Angaben prüfen,
   Lesbarkeit bestätigen und ausdrücklich einreichen.
4. Die ausdrücklich beschrifteten Simulationen zeigen Prüfung/Freigabe/Korrektur/Ablehnung sowie verlorene
   Antworten. Für eine neue Revision zuerst das Testkonto anmelden. Der öffentliche Festfarben-Bildfixture
   enthält keine reale Person oder Ausweisdaten. Es gibt keine Zahlungen oder externe Backend-Aufrufe.
5. Der Adapter ist ausschließlich durch `__DEV__` und explizite Testauswahl zugänglich, niemals eine
   automatische Live-Ausweichroute. Sein UI-Speicher ist flüchtig; echte Neustart-Wiederaufnahme wird
   zusätzlich gegen den Speicherport und im lokalen HTTPS-Test geprüft.

## Reproduzierbare Prüfungen

```powershell
npm run typecheck
npm run lint
npm test
npm run phase5:verify
C:/dev/opago-api/.venv/Scripts/python.exe scripts/test-p3-http.py --api C:/Users/Fabian/.codex/worktrees/p3-identity-photo/opago-api
# Im unveränderten API-Worktree und dessen requirements-test.txt-Umgebung:
C:/dev/opago-api/.venv/Scripts/python.exe -m pytest tests/test_wallet_v2.py -q
# Nach Expo-Android-Prebuild, im generierten android-Verzeichnis:
./gradlew.bat :opago-safe-http:testDebugUnitTest --offline --console=plain
npx expo export --platform android --platform ios --output-dir output/p3-native-export
```

Stand 07.10.2026: Wallet-Testreihe **857 Tests: 856 bestanden, 1 bestehender iOS-Projekttest übersprungen**
(generiertes iOS-Projekt fehlt auf Windows); darunter 22 neue P3-App-/Medien-/UI-Fälle plus binärer HKA-
und Transporttest. Typecheck bestanden, Lint ohne Fehler/Warnungen. Bestehende API-V2-Tests: **151 bestanden**.
Android-Nativmodul: **7 JUnit-Tests bestanden**, einschließlich zwei neuer Tests für Bytegleichheit,
Grenzgrößen und falsche Binärendpunkte. Android-/iOS-Hermes-Bundles lokal exportiert.
Vollständiges `phase5:verify` bestanden einschließlich vorhandener Sicherheits-/Produktionskonfigurationsprüfungen,
Solidity-Kompilierung und **9 lokaler Smart-Contract-Tests**; kein Deployment.
Die iOS-Swift-Tests sind ergänzt, benötigen jedoch macOS/Xcode und wurden hier nicht ausgeführt.
Lokale Laufzeit: Node 24.18.1/Python 3.11.7; Repository/CI erwartet Node 22.23.1.
Ein bestehender F3-Rechnungstest konnte zufällig den unveränderten letzten Bech32-Buchstaben einsetzen;
sein negativer Test verändert jetzt garantiert diesen Buchstaben. Zahlungs-/UMA-Code wurde dafür nicht geändert.

HTTPS-Integration: **7 Tests bestanden**, echte Wallet-Intake-/NativeHka-/HPKE-/strictFetch-Implementierung →
lokale TLS-Verbindung → echte öffentliche API-V2-Blueprint/Schema/Replay/Limiter/Fotoprüfung → TLS → synthetischer
interner Dienst. Geprüft: verlorenes Create/Upload-Ergebnis, authentifizierter Binärtransport und Hash,
explizites 202, neue Account-Revision/Erhalt aktiver Freigabe, manipuliertes AEAD ohne Business-Schreibeffekt,
identischer logischer Retry mit frischer Kryptografie sowie Bild-/Pfadausschluss aus geschütztem Zustand.
`output/p3-http-result.json` hält die tatsächlich getesteten Wallet-/API-Commits und Dirty-Markierung fest.
Blueprint-Testaufbau ersetzt das vollständige App-Startup, Redis und Service-Bearer-Provisionierung;
Native-Socket-Port ist für die lokale Test-CA adaptiert. Keine reale OIDC-/Gateway-Anmeldung,
Produktions-DNS-/Geräteprüfung oder Compliance-Freigabe. Testbilder/Daten sind ausschließlich synthetisch.

## Offene Geräte- und Backend-Abnahme

Android-Geräteinventar war leer. iOS/macOS/Xcode stehen hier nicht bereit. JavaScript-Port-/Hooktests,
Gradle-Modultests und Hermes-Export sind **kein** Gerätenachweis. Auf Android und iPhone/iPad mit einem
isolierten Testbuild jeweils folgende Fälle protokollieren, ausschließlich mit synthetischen Dokumenten:

1. Kamera-Berechtigung erstmals erteilen, verweigern, dauerhaft verweigern und in Einstellungen wieder ändern;
   Bildpicker einschließlich beschränkter iOS-Bibliotheksfreigabe, Abbruch und erneuter Aufnahme.
2. JPEG/PNG/unterstütztes HEIC, EXIF-Rotation 1/3/6/8 und GPS-Metadaten; Ausrichtung, alle Dokumentränder,
   Texte/Lesbarkeit und entfernte Metadaten der tatsächlichen normalisierten Datei nachweisen.
   479 px, 10001 px, mehr als 24 MP, 10 MiB+1, beschädigte und umbenannte Dateien müssen abgewiesen werden.
3. Kleine Displays/große Schrift, Tastatur, TalkBack/VoiceOver, alle fünf Sprachen; explizite Übersicht und
   Bestätigung, Aufnahme/Auswahl/Entfernen ohne Upload und beide Personalausweisseiten.
4. Picker-Hintergrund/normaler Hintergrund, automatische/ausdrückliche Wallet-Sperre, Navigationsabbruch,
   Konto-/Wallet-Wechsel während Decoder/Upload; keine verzögerte Vorschau oder fremde Datenübernahme.
5. App-Prozess nach Auswahl/Upload/Submit beenden, neu starten; Cachebereinigung und geschützten Entwurf
   prüfen. Bibliotheksoriginal bleibt erhalten. Screenshots/App-Umschalter und Logs/Crashbericht ohne Bild/PII.
6. Isolierter Backendbetrieb: Verbindungsabbruch nach Commit, abgelaufene Sitzung, Retry-After,
   konkurrierendes CAS, falsche Eigentümer/Revision/Seite/Hash, Manipulation, HKA-Schlüsselrotation,
   120/115/110-Sekunden-Grenzen, Schutz vor privaten DNS-/Redirect-Zielen und einmalige Business-Effekte.
7. Echte Backend-Worker-Statusübergänge und Korrekturmasken, Ablehnung/Support, explizite neue Revision,
   Erhalt einer älteren Freigabe bei neuem Fehler sowie DELETE einer Folgerevision mit maßgeblichem
   Wallet-/Submission-Status prüfen. Keine eigene clientseitige Entscheidung über Freigabe oder Widerruf.
8. Erst danach Backend-/Geräteabnahme dokumentieren: öffentliches 0.2.0-Enrollment/CAS/Idempotenz/
   Upload-/Worker-Mapping, Gateway-Client-Vertrag, produktiver RecordKeyring/DocumentReader und
   Aufbewahrung/Löschung müssen vom zuständigen Team bereitgestellt bzw. entschieden sein.

API-Code blieb unverändert, deshalb kein API-PR. P3 wird durch lokale Simulationen/HTTP-Fixtures nicht als
produktiv abgenommen oder Done bezeichnet. Kein Merge, Deployment, Store-Upload oder echte Identitätsprüfung.
