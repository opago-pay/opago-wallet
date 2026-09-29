# iOS Safe HTTP: isolierte native Abnahme

**Noch nicht ausgeführt.** Die Swift-Dateien wurden auf Windows bearbeitet; hier gibt es weder `pod install` noch Swift-Kompilierung, `.xcresult`, iPhone- oder iPad-Test. Ein grünes Node-Gate belegt diese Eigenschaften nicht.

## Voraussetzungen und Testkopie

Mac mit Xcode 26+ und iOS/iPadOS-26-SDK, Node **22.23.1**, CocoaPods, ein isoliertes iPhone und iPad mit eigener Test-App-Kennung, kontrolliertes IPv6-only-/DNS64-/NAT64-Netz, kontrollierte DNS-/HTTPS-Ziele und Test-CA. Die vorhandene Nutzerwallet und die produktive Bundle-ID `com.opago.wallet` bleiben unberührt. Der Test-Host wird ausschließlich in eine frische Kopie installiert.

Die installierte Expo-Autolinking-Version setzt `includeTests` standardmäßig auf `false`; das Podspec allein erzeugt also keinen ausführbaren Testlauf. `scripts/ios-safe-http-test-gate.sh prepare` kopiert den Quellstand ohne Wallet-/Umgebungsdateien in einen **neuen Ordner außerhalb** des Checkouts, setzt eine eigene `*.safehttptest`-Bundle-ID, generiert iOS dort und fügt nur für `OpagoSafeHttp` `:testspecs => ['Tests']` vor `use_expo_modules!` ein. Der produktive Podfile wird nicht geändert. CocoaPods soll mit `requires_app_host = true` einen separaten XCTest-Host erzeugen; ob der Scheme tatsächlich verfügbar ist, muss `xcodebuild -list` auf dem Mac erst bestätigen.

Die Fixture-Datei ist bei `prepare` optional, damit `pod install`, der unsigned App-Build und die Parser-/Adress-Unit-Tests schon ohne Testnetz vorbereitet werden können. **Der verpflichtende vollständige `run`-Abnahmelauf** verlangt dagegen alle Fixtures; `{}` fällt sofort durch.

```sh
node --version # v22.23.1
bash scripts/ios-safe-http-test-gate.sh prepare /tmp/opago-safe-http-test \
  com.opago.safehttptest
cd /tmp/opago-safe-http-test
xcodebuild -version
xcodebuild -list -workspace ios/*.xcworkspace
xcodebuild -workspace ios/*.xcworkspace -scheme <SCHEME_AUS_LISTE> \
  -configuration Release -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO build
```

**Ein fehlender Scheme, ein fehlgeschlagenes `pod install` oder Swift-Compile ist ein offener Blocker**, kein übersprungener Test.

Die sechs lokalen Parser-/Adress-Unit-Tests lassen sich vor Bereitstellung der Netzwerk-Fixtures auf einem iOS-Simulator ausführen; `unit` prüft auch hier die genaue Testanzahl und verbietet Skips:

```sh
bash scripts/ios-safe-http-test-gate.sh unit /tmp/opago-safe-http-test \
  'platform=iOS Simulator,name=iPhone 17' /tmp/opago-safe-http-unit-results
```

## Fixtures

`controlled-Fixtures.json` enthält ausschließlich HTTPS-URLs zu synthetischen Testdaten und alle 18 Schlüssel:

Für den vollständigen `run`-Lauf eine **neue** Testkopie mit dem vierten `prepare`-Argument `/path/to/controlled-Fixtures.json` erstellen. Die ohne Fixtures gebaute Kopie dient nur der Kompilierung und den sechs Unit-Tests.

`json`, `text`, `rebinding`, `private`, `mixed`, `redirect`, `invalidCertificate`, `gzip`, `oversizedNoLength`, `oversizedFalseLength`, `malformedLength`, `timeout`, `slow`, `proxyOnly`, `nat64Public`, `nat64Private`, `nat64Mixed`, `nat64DnsChange`.

Die Datei wird in die XCTest-Ressourcen kopiert; `{}` im Repository ist absichtlich **nicht** lauffähig. `validate-ios-safe-http-fixtures.cjs` verhindert fehlende Schlüssel und offensichtliche Platzhalter. Die Tests selbst scheitern bei fehlenden Fixtures; sie verwenden kein `XCTSkip`.

Für die synthetischen HTTP-Antworten liegt `scripts/ios-safe-http-fixture-server.py` bei. Beispiel: `python3 scripts/ios-safe-http-fixture-server.py --bind :: --port 8443 --cert test-fullchain.pem --key test-key.pem`. Ein ausschließlich im Labor verwendetes Zertifikat mit SANs für alle Testnamen und eine auf den **Testgeräten** installierte Test-CA sind erforderlich; für `invalidCertificate` einen zweiten Server mit falschem/abgelaufenem Zertifikat nutzen. Die DNS-Zonen, DNS64-Übersetzung, private/mixed Antworten, DNS-Wechsel und Proxy-only-Route werden im isolierten Testnetz bereitgestellt und protokolliert. Der Server allein beweist diese Netzwerkbedingungen nicht.

- `json`, `text`: gültige kleine UTF-8-Antworten. `rebinding`: erste DNS-Antwort öffentlich, nächste privat; der Server der ersten IP liefert harmlosen Inhalt. DNS-Protokoll muss die einzelne Zielauflösung zeigen.
- `private`, `mixed`: private/Loopback-Adresse bzw. gemischte öffentliche/private Antwort. `redirect` ist 3xx; `invalidCertificate` hat ein ungültiges Zertifikat. Normalziel-Zertifikate müssen mit der regulären System-Trust-Prüfung gültig sein, ohne Trust-Ausnahme.
- `gzip` erzwingt Kompression. `oversizedNoLength` und `oversizedFalseLength` senden mehr als 32 Bytes; `malformedLength` bricht vor deklarierter Länge ab. `timeout` und `slow` antworten spät; `slow` wird aktiv abgebrochen.
- `proxyOnly` darf nur über einen konfigurierten Systemproxy erreichbar sein; eine direkte Verbindung muss scheitern. Proxy-Log muss zeigen, dass keine HTTP-Anwendungsdaten gesendet wurden. Ein fehlender Proxy-Testaufbau kann durch einen bloß fehlgeschlagenen Direktaufruf **nicht** als Nachweis gewertet werden.
- Die vier `nat64*`-Namen werden durch das kontrollierte DNS64 synthetisiert. `nat64Public` hat eine öffentliche IPv4-Ursprungsadresse, `nat64Private` eine private, `nat64Mixed` liefert zusätzlich eine private/spezielle Adresse, `nat64DnsChange` wechselt nach der ersten Antwort. Die Tests verlangen einen auf `ipv4only.arpa` entdeckten Präfix und einen über diesen Präfix gebundenen IPv6-Endpunkt für `nat64Public`; ein Dual-Stack-Erfolg über IPv4 zählt nicht.

Die Testnetz-DNS- und TLS-Logs sowie das tatsächliche IPv6-only-Routing sind manuell mit dem `.xcresult` abzugleichen. Ein anderes Netzwerk nach Präfixermittlung, ein VPN oder eine manipulierte DNS64-Antwort erfordern einen gesonderten Angriffstest. Der Code baut keine NAT64-Adresse selbst: Er prüft die vom System aufgelöste IPv6-Adresse und bindet `NWConnection` an genau diesen IP-Endpunkt. Er akzeptiert nur RFC-6052-Präfixe, die `ipv4only.arpa` für das aktuelle Netz liefert, und verwirft eingebettete nicht öffentliche IPv4-Adressen.

## Testlauf und harter Nachweis

```sh
cd /path/to/opago-source-checkout
bash scripts/ios-safe-http-test-gate.sh prepare /tmp/opago-safe-http-network-test \
  com.opago.network.safehttptest /path/to/controlled-Fixtures.json
cd /tmp/opago-safe-http-network-test
export OPAGO_TEST_TEAM=<APPLE_DEVELOPMENT_TEAM_ID>
bash scripts/ios-safe-http-test-gate.sh run /tmp/opago-safe-http-network-test \
  'platform=iOS,id=<IPHONE_UDID>' /tmp/opago-safe-http-iphone-results
bash scripts/ios-safe-http-test-gate.sh run /tmp/opago-safe-http-network-test \
  'platform=iOS,id=<IPAD_UDID>' /tmp/opago-safe-http-ipad-results
```

`unit` und `run` lesen die tatsächlich erzeugten Schemes **und Targets** aus `xcodebuild -list -json -project ios/Pods/Pods.xcodeproj`. Der reguläre CocoaPods-Name ist `OpagoSafeHttp-Unit-Tests`; fehlt er oder gibt es mehrere mögliche Testtargets, scheitert das Gate vor dem Testlauf. `unit` übergibt den ermittelten Targetnamen an `-only-testing`. `run` verlangt die Testkopie mit Fixtures, führt `xcodebuild test` mit `.xcresult` aus und liest die Zusammenfassung mit `xcresulttool`. `check-ios-safe-http-xcresult.cjs` vergleicht die ausgeführten mit allen `test...`-Methoden im Swift-Quellstand: **0 fehlgeschlagen, 0 übersprungen, 0 fehlend, mindestens acht ausgeführt**. Jede Abweichung beendet das Gate mit Fehler. Lauf, Xcode-/SDK-Version, Test-App-ID, Gerät, DNS-/Proxy-Konfiguration, Signatur und Hash des gebauten Artefakts dokumentieren.

Ein gewöhnlicher [EAS-App-Build](https://docs.expo.dev/build-reference/ios-builds/) kann auf einem Cloud-Mac `pod install` und die App kompilieren; dessen dokumentierter Ablauf führt diese XCTest-Methoden **nicht automatisch** aus. Der Simulator-Unit-Lauf und die signierten iPhone-/iPad-Netzwerkfälle brauchen einen ausdrücklich eingerichteten macOS-Testjob beziehungsweise das oben beschriebene Labor. EAS-Build, XCTest-Resultat und signierter App-Kandidat sind getrennte Nachweise.

Danach dieselbe isolierte Test-App für die echten JS-Einstiegspfade LNURL, Lightning-Adresse und OCP mit synthetischen Daten prüfen; ohne natives Modul muss der Pfad weiterhin gesperrt bleiben. Erst dann ist eine Freigabeentscheidung möglich. Keine Mainnet-Zahlung und keine Store-Einreichung.
