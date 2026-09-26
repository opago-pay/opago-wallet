# OPAGO Wallet – vorbereitetes Apple-Einreichungspaket

**Arbeitsstand 24.09.2026 · Entscheidung für den identifizierten Stand: NO-GO.** Es wurde nichts bei Apple hochgeladen oder im Store geändert. Dieses Paket bündelt [Netzwerk-Nachweis](native-network-release-evidence.md), [Legacy-Nachweis](legacy-recovery-release-evidence.md), [Geräteabnahme](native-release-acceptance.md), [Datenflussmatrix](wallet-data-flows.md) und [Rechtstextentwurf](legal-wallet-draft.md). Es trennt belegte Apple-Vorgaben von zusätzlichen Produkt- und Sicherheitsempfehlungen.

## Kandidat und Kontostand

`HEAD e0d3a23db8d6c5a576c569986eb4136bf40daef0` **plus zahlreiche uncommitted Änderungen** ist keine eingefrorene Release-Revision. `app.json` nennt Version 1.0.0 und iOS-Bundle-ID `com.opago.wallet`, `ios.supportsTablet=true`. Das eingecheckte `eas.json`-Produktionsprofil aktiviert Spark- und Hedera-Mainnet und Node 22.23.1. Eine ferne EAS-Produktionsumgebung, dortige Geheimnisse, endgültige remote Buildnummer und tatsächlich erreichbare Anbieter sind nicht belegt.

Der zuletzt gebaute Android-Kandidat ist ein lokales APK (`versionCode=1`, `versionName=1.0.0`, SHA-256 `C4C46633A0535DBCD061388B3F1BCAF202D82F0418209D6673F21C86C3559B6B`), signiert mit dem Android-**Debug-Zertifikat**. Er wurde auf Android 14 installiert und gestartet; das Protokoll steht in `native-release-acceptance.md`. Danach wurde iOS-Quellcode ergänzt; **kein iOS-Kandidat wurde gebaut**. Das vollständige Node-22.23.1-Gate für den jetzigen Quellstand bestand mit 546/546 App- und 9/9 Contract-Tests, Typecheck und Lint (`output/node22-phase5-ios-safe-http-escalated.log`). Swift-/Pod-Kompilierung und isolierte native HTTPS-Gerätetests fehlen. Der frühere APK-Hash `8AA64D3A…F56B9C1` bezeichnet den Stand vor der Android-Response-Korrektur. Der Android-Build ist kein Store-signiertes AAB und belegt weder Apple-Signing noch Xcode-/SDK-Version, iOS-Entitlements oder Privacy-Manifeste. Es gibt hier keinen Zugriff auf ein Apple Developer Program Organisationskonto oder einen App-Store-Connect-Eintrag. Der Expo-Owner `fabcot01` ist kein Organisationsnachweis. Apple erlaubt Kryptowallet-Apps nach Guideline 3.1.5(i) nur von als Organisation registrierten Entwicklern. [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

Seit 28.04.2026 müssen Uploads mit Xcode 26 oder neuer und dem passenden iOS-/iPadOS-26-SDK gebaut sein; der Windows-Rechner kann das nicht überprüfen. Ein späteres signiertes IPA muss auf tatsächliches `CFBundleIdentifier`, `CFBundleShortVersionString`, `CFBundleVersion`, Team/Provisioning, Entitlements, eingebundene Privacy-Manifeste/Required-Reason-APIs, ATS-Konfiguration und effektive Produktionswerte untersucht werden. [Apple Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/), [Apple Third-party SDK Requirements](https://developer.apple.com/support/third-party-SDK-requirements/).

## Produktumfang und Review-Grenzen

- Standardansicht: Bitcoin-Guthaben, Lightning und Bitcoin-Onchain für Senden/Empfangen, lokale Sicherheit und Aktivitäten. HBAR ist unter „Weitere Coins“ erreichbar. Eine neue HBAR-Wallet benötigt gegebenenfalls Kontoaktivierung; dies darf in Marketing und Review nicht als sofort einsatzbereiter HBAR-Empfang versprochen werden.
- Kaufen zeigt in der aktuellen App-Fassung ausschließlich „Demnächst verfügbar“. Die vorhandene MoonPay-Integrationsbibliothek ist vom Screen entkoppelt; kein Kauf kann aus dem UI gestartet werden. **Kauf nicht als verfügbare Store-Funktion bewerben oder als Review-Schritt angeben.** Vor späterer Aktivierung wären OPAGO-Signaturdienst, MoonPay-Verfügbarkeit, Datenschutz und Länder erneut zu belegen. Demo-Server in `demo/` bzw. `server/` gelten nicht als Produktionsdienste.
- Identity-/eID-Zahlungen sind im aktuellen Produktprofil gesperrt; keine Store-Aussage über ihre Verfügbarkeit. Für LNURL/OCP auf iOS existiert inzwischen ein nativer Peer-IP-Quellpfad, aber weder ein kompilierter Kandidat noch kontrollierte Gerätebelege. Fehlt das Modul, scheitert der untrusted Pfad weiterhin geschlossen. Diese Funktion ist auf iOS noch nicht releasefähig.
- Spark- und Hedera-Mainnet-Konfiguration steht im Profil, aber Erreichbarkeit, finaler Netzwerk-/Operatorvertrag, Produktionsgebühren und der signierte iOS-Build sind unbestätigt. Dieser Lauf löste **keine Mainnet-Geldbewegung** aus.
- Zielregionen und dort verfügbare Zahlungs-/Kauffunktionen legt OPAGO fest. Apple 3.1.5(iii) spricht von Anforderungen für **Exchange**-Funktionen; daraus wird hier keine pauschale Lizenzpflicht für jede selbstverwahrte Wallet oder jede MoonPay-Integration abgeleitet. OPAGO muss seine eigene Rolle, MoonPays Rolle und die ausgewählten Länder fachlich/rechtlich prüfen. [Apple App Review Guidelines 3.1.5](https://developer.apple.com/app-store/review/guidelines/).

## Store-Metadaten – redaktioneller Entwurf

Die folgenden Texte beschreiben nur Funktionen, die der finale Build tatsächlich anbieten darf. Nach Konfigurations- und Geräteprüfung werden sie gegen die Screens und die Rechtsfassung abgeglichen. Apple begrenzt Name/Untertitel auf je 30 Zeichen, Beschreibung auf 4000 Zeichen und Keywords auf 100 Bytes pro Lokalisierung. Kategorie und Altersfreigabe werden in App Store Connect bestätigt. [Apple App Information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information), [Platform Version Information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).

| Feld | Entwurf / Status |
| --- | --- |
| Name | `OPAGO Wallet` – Betreiber-/Markenfreigabe offen. |
| Untertitel DE | `Bitcoin einfach nutzen` |
| Untertitel EN | `Bitcoin on your terms` |
| Untertitel ES | `Bitcoin a tu manera` |
| Untertitel FR | `Bitcoin à votre façon` |
| Untertitel IT | `Bitcoin a modo tuo` |
| Primärkategorie | `Finance` als Vorschlag; tatsächliche App-Store-Connect-Auswahl unbestätigt. |
| Altersfreigabe | **Nicht festgelegt**: offiziellen Fragebogen für die tatsächlich verfügbaren Krypto-Funktionen ausfüllen, Ergebnis übernehmen; Kaufen ist derzeit deaktiviert. Keine Alterszahl erfinden. |
| Support-URL | `https://www.opago.com/contact/` – öffentlich zugänglich, Kontaktdaten vor Upload verifizieren. Dashboard `https://dashboard.opago.com/` erfordert Login und ist nicht der alleinige Supportweg. |
| Datenschutz-URL | `https://www.opago.com/privacy/` – erreichbar, aber die Wallet-Ergänzung aus `legal-wallet-draft.md` ist noch nicht veröffentlicht/freigegeben. **Inhaltlich derzeit nicht fertig.** |
| Marketing-URL | `https://www.opago.com/` als optionaler Vorschlag; Wallet-Inhalt und Verfügbarkeit dort prüfen. |
| Keywords DE | `bitcoin,lightning,wallet,sats,bezahlen,empfangen,selbstverwahrung` – redaktionell und gegen 100-Byte-Grenze prüfen. Übersetzungen für EN/ES/FR/IT nach Zielregion festlegen, keine Markennamen anderer Anbieter verwenden. |

**Beschreibung DE, Entwurf:**

> Mit OPAGO Wallet kannst du Bitcoin über Lightning oder das Bitcoin-Netzwerk empfangen und senden. Du kontrollierst deine Wiederherstellungswörter selbst. Die App zeigt dir dein Bitcoin-Guthaben, deine Aktivitäten und vor dem Senden den Betrag sowie verfügbare Gebühreninformationen. HBAR findest du unter „Weitere Coins“, wenn diese Funktion für deine Wallet verfügbar ist. Für einzelne Zahlungswege und Netzwerkfunktionen nutzt die App Drittanbieter. Bewahre deine Wiederherstellungswörter sicher auf und teile sie niemals mit anderen. Verfügbarkeit, Gebühren und Bestätigungszeiten hängen vom gewählten Netzwerk und Dienst ab.

Dieser Text ist **nicht final**, solange iOS-LNURL/OCP, HBAR-Aktivierung, Datenflüsse und Produktionsumfang nicht geklärt sind. EN/ES/FR/IT-Beschreibungen werden erst aus der freigegebenen Produkt-/Rechtsfassung lokalisiert. Keine Aussage „vollständig anonym“, „gebührenfrei“, „garantiert sofort“ oder „alle Daten verschlüsselt“ aufnehmen.

## Screenshots und App-Review-Anleitung

Vom **final signierten Build** ohne private Wallet-Daten aufnehmen: (1) Start mit synthetischem/freigegebenem Testguthaben, (2) Empfangen mit einem eigens erzeugten Test-QR, (3) Zahlungsprüfung ohne echte fremde Adresse und ohne PIN-Eingabe, (4) Aktivitäten mit anonymisierten Testdaten, (5) Sicherheit/Backup-Hinweise ohne sichtbare Recovery-Wörter, optional (6) „Weitere Coins“ nur wenn aktiv. Helle/dunkle Darstellung und tatsächliche Lokalisierungen prüfen. Weder Nutzer-QR noch echte Seeds oder Konto-IDs in Marketingbildern verwenden. Apple akzeptiert 1–10 nichttransparente JPEG/PNG-Screenshots. Für 6,9-Zoll-iPhone sind u. a. 1260×2736, 1290×2796 oder 1320×2868 Pixel im Hochformat gelistet; weil `supportsTablet=true`, sind 13-Zoll-iPad-Bilder (2064×2752 oder 2048×2732) erforderlich. **Es liegen noch keine Screenshots des finalen iOS-Builds vor.** [Apple Screenshot Specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications).

**Review Notes, vorläufige Schrittfolge:**

1. Auf einem frischen Gerät OPAGO Wallet öffnen. „Neue Wallet erstellen“ wählen, lokale PIN/Biometrie bestätigen, Recovery-Wörter gemäß UI sichern und Backup-Verifikation durchführen. Alternativ nur mit einer **separat und sicher bereitgestellten Testwallet** wiederherstellen; keine Recovery-Wörter in den Review Notes oder in diesem Repository hinterlegen.
2. Start zeigt Bitcoin-Betrag und die feste Reihenfolge Empfangen – Senden – Kaufen. „Kaufen“ zeigt nur „Demnächst verfügbar“. „Empfangen“ öffnet einen Lightning-QR; über die Zahlungsweg-Auswahl Bitcoin-Onchain anzeigen. „Weitere Coins“ zeigt HBAR, falls Konto aktiviert.
3. „Senden“ öffnet QR-Scanner und manuelle Eingabe. Mit einer freigegebenen Testanfrage bis zur Zahlungsprüfung gehen; eine echte Sendung nur über eine ausdrücklich vorbereitete Testwallet und Testumgebung. Abbruch und Sicherheitsfreigabe erklären. Bei unbekanntem Ergebnis nicht erneut senden.
4. „Sicherheit“ über das Menü öffnen: Sperre, Backup, Sprache, Hell/Dunkel und Rechts-/Supportlinks. Vor dem Entsperren sind öffentliche Rechts-/Supportlinks ebenfalls erreichbar. Für diese Fassung gibt es keinen Kauf-Review-Schritt.
5. OPAGO legt vor Upload fest, wie Apple Vollzugriff auf finanzierte Testfälle erhält, ohne private Nutzerwallet oder echte Wiederherstellungswörter in Unterlagen offenzulegen. Ein Testnet-/Sandbox-Verhalten wird ausdrücklich als solches ausgewiesen; es gibt keinen versteckten Review-Modus.

Apple verlangt korrekte Metadaten, einen funktionierenden Backendzugang und Review-Zugang zu App-Funktionen. [Apple App Review Guidelines, Before You Submit und 2.3](https://developer.apple.com/app-store/review/guidelines/).

## App Privacy, Verschlüsselung und Freigabematrix

Die Datenflussmatrix nennt lokal gespeicherte Schlüssel und Zahlungsmetadaten sowie Übertragungen an Spark, Hedera, LNURL-Gegenstellen und CoinGecko. Der MoonPay-Kaufablauf ist derzeit nicht erreichbar, das SDK bleibt jedoch im Build und muss auf eigenständige Datenerhebung geprüft werden. Die endgültigen Apple-App-Privacy-Antworten, einschließlich „linked to user“, Zweck, Tracking und Drittanbieter-SDKs, sind **nicht verifiziert**. Das veröffentlichte Datenschutzdokument deckt die Wallet noch nicht ab. Apple verlangt eine Privacy-Policy-URL und Angaben auch zu eingebundenen Drittanbieter-SDKs. [Apple App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).

Die App nutzt Kryptografie für Walletschlüssel, Signaturen, lokalen Schutz und TLS. OPAGO muss anhand des **wirklichen iOS-Builds** Apples Export-Compliance-Fragen beantworten und gegebenenfalls Unterlagen liefern. Eine pauschale Ausnahme wird hier nicht behauptet. [Apple Export Compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance).

| Anforderung | Beleg | Status | Konkreter nächster Schritt |
| --- | --- | --- | --- |
| Apple-Organisationskonto für Wallet | Apple Guideline 3.1.5(i); kein Kontozugriff | nicht verifiziert | OPAGO zeigt Organisationsmitgliedschaft und App-Store-Connect-App-ID/Team-ID. |
| Eingefrorene Quelle und Buildidentität | Dirty `HEAD`, Android-Test-APK-Hash; kein IPA | fehlt | Änderungen prüfen/committen, Release-Tag und Manifest; signiertes iOS-IPA aus Produktionsprofil bauen. |
| Xcode-/SDK-Mindeststand | Apple Upcoming Requirements; kein iOS-Build | fehlt | IPA mit Xcode 26+/iOS-26-SDK bauen und Buildmetadaten prüfen. |
| iOS-Signing, Entitlements, Privacy-Manifeste, Required-Reason-APIs | Kein IPA/Account | fehlt | Signierten Build und alle eingebetteten SDK-Manifeste/Entitlements nativ inspizieren. |
| Native Netzwerkabsicherung für untrusted Ziele | Android-Code und JVM-Tests; iOS-Quellimplementierung ohne Xcode-/Gerätebeleg | fehlt | iOS-Pod kompilieren, signierten Build identifizieren und kontrollierte HTTPS-/DNS-Gerätetests beider Plattformen ausführen. |
| Wallet-/Zahlungs-/Wipe-Abnahme auf iPhone und iPad | `native-release-acceptance.md` | fehlt | Isolierte Geräte/Testwallets und vollständige Abnahmematrix; iPad solange unterstützt. |
| Legacy-v1-Produktentscheidung | `legacy-recovery-release-evidence.md` | fehlt | Unterstützte Ausgangsbasis entscheiden; bei Support sicheren Zuordnungs-/Abschlussprozess belegen. |
| Produktionsdienste/Spark/Hedera | Profil zeigt Mainnet; effektive Dienste nicht belegt | nicht verifiziert | Effektive remote Konfiguration, Betreiberendpunkte und getrennte Mainnet-Nachweise prüfen. MoonPay erst vor einer späteren Aktivierung separat abnehmen. |
| Wallet-Rechtstexte/Privacy-URL | Entwurf liegt vor; Website-Text veraltet für Wallet | fehlt | Datenschutz-/AGB-Ergänzung fachlich/juristisch freigeben, lokalisiert veröffentlichen. |
| App-Privacy-Angaben | Datenflussmatrix vorläufig | fehlt | Anbieterrollen/Logs/Fristen/SDK-Erhebung klären und Formulare nach finalem Build ausfüllen. |
| Export Compliance | Kryptografie vorhanden, Apple-Antworten offen | nicht verifiziert | iOS-Binary und verwendete Kryptografie für Apple-Fragebogen prüfen. |
| Store-Metadaten, Länder, Altersfreigabe | Redaktionelle DE- und Kurztexte; keine Länder/Altersfreigabe | fehlt | Zielländer/Angebot festlegen, Fragebogen, fünf Lokalisierungen und App-Store-Eintrag fertigstellen. |
| iPhone-/iPad-Screenshots | Spezifikation dokumentiert, keine finalen Bilder | fehlt | Echte Screens vom freigegebenen iOS-Build ohne Nutzergeheimnisse aufnehmen. |
| Review-Vollzugriff | Schrittfolge entworfen, kein freigegebener Testzugang | fehlt | Testwallet-/Sandbox-Zugang sicher bereitstellen und Notes finalisieren. |

**Go/No-Go: NO-GO** für den oben identifizierten Stand. Ausschlaggebend sind der fehlende signierte iOS-Build, die offene iOS-Netzwerkgrenze, nicht ausgeführte iPhone-/iPad-Gerätefälle und unvollständige Wallet-Datenschutz- und Kontonachweise. Ein unabhängiger Spark-Review ist eine zusätzliche Sicherheitsempfehlung wegen lokaler SDK-Anpassungen, **keine hier belegte ausdrückliche Apple-Pflicht**.

## Tatsächlich benötigte Betreiberangaben und Freigaben

OPAGO muss nur diese noch fehlenden Angaben/Zugänge liefern: Apple-Organisationskonto und App-Store-Connect-Eintrag; Mac/Xcode-26+-Build-/Signing-Zugang samt finaler EAS-Konfiguration; Zielländer und tatsächlich aktivierte Bitcoin-/HBAR-Funktionen; Anbieterrollen/Datenschutz- und Aufbewahrungsangaben für die Matrix; Entscheidung zu v1-Altinstallationen; isolierte iPhone-/iPad-/Android-Testwallets und kontrollierte Netzwerkziele; finale Freigabe von Texten, Metadaten, Screenshots, Review-Zugang und erst anschließend der konkreten Einreichung. MoonPay-Angaben und Sandbox werden erst vor dessen späterer Freischaltung benötigt. Es wurde keine Veröffentlichung oder externe Änderung vorgenommen.
