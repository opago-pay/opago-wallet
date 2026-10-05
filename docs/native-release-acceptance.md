# Native Releaseprüfungen

Stand: 5. Oktober 2026. Mehr als zehn Personen testen die implementierten App-Funktionen bereits über TestFlight und die Android-Verteilung. Für diesen Umfang bestehen keine offenen Geräteabnahmen. Maßgeblich ist der [aktuelle Geräteteststand](DEVICE_TESTING_STATUS.md).

Aktuelle erfolgreiche Builds vom Hauptbranch `724ca2e`: iOS 46, Android 11 und Android-APK 12. Die folgende Tabelle bewahrt ausgeführte Prüfungen des historischen Kandidaten vom 24. September; daraus wird kein heutiger Gerätetest-Rückstand abgeleitet.

## Tatsächliche Prüfungen

| Gerät/Umgebung | Testfall | Erwartung | Tatsächliches Ergebnis und Beleg | Status |
| --- | --- | --- | --- | --- |
| Node 22.23.1, Windows | Letztes vollständiges Node-Gate vor der Scheme-/UTF-8-Testkorrektur | TypeScript, Lint, App- und Contract-Tests bestehen | `npm run phase5:verify`: 548/548 App- und 9/9 Contract-Tests, Typecheck und Lint bestanden (`output/node22-ios-nat64-final-gate.log`; eine bestehende Lint-Warnung). Nach der Korrektur wurden nur die betroffenen 19 Node-Tests erneut ausgeführt. Swift-/Pod-Code gehört nicht zum Node-Gate. | bestanden für damaligen Quellstand |
| Node 22.23.1, Windows | iOS-Testgate-Korrektur | CocoaPods-Scheme/Target-Auswahl und JS-Transportschutz | Fünf betroffene Testdateien: 19/19 bestanden. Der neue Verhaltenstest umfasst `OpagoSafeHttp-Unit-Tests`, fehlendes Scheme/Target und Mehrdeutigkeit sowie den CLI-Aufruf. Bash-Syntaxprüfung bestanden; kein Xcode-Projekt erzeugt. | bestanden als Quellprüfung |
| Node 22.23.1, Windows | UI-Regressionen dieses Stands | Start-Aktionsreihenfolge und Kaufen-Sperre | Typecheck bestanden; Lint ohne Fehler (eine bestehende Warnung); `lazy-home-history` und `moonpay`: 14/14 Tests bestanden. | bestanden |
| Android JVM, Release-Variant | Native Modulkompilierung, IP-Adresspolitik, Bridge-Zahlen | Modul kompiliert; Sonderbereiche und fehlerhafte Grenzen werden verworfen | `:opago-safe-http:testReleaseUnitTest` im neuen Build bestanden (`output/native-response-fix-android-build.log`); die Modul-Tests waren Gradle-`UP-TO-DATE` und ihr vorheriger 2/2-Lauf ist in `output/native-safe-http-tests-final.log` belegt. Kein Hardware-HTTPS-Beleg. | bestanden |
| Node 22.23.1, Windows | React-Native-Response nach nativer Bridge lesen | JSON und Text sind lesbar; unmarkierte Antworten bleiben gesperrt | `tests/native-response-regression.test.cjs` verwendet die echte installierte `whatwg-fetch.Response` und prüft die vollständige JS-Kette samt Fehlern, Grenzen und Abbruch; zusammen mit `strict-http-transport.test.cjs` 11/11 bestanden. Kein Gerätetest. | bestanden |
| Android 14, PG3NBG7YA | Installation/Start des hier gebauten APK | `adb install -r` aktualisiert ohne Löschflag; Start ohne Crash | Für SHA-256 `C4C46633…3559B6B`: `adb install -r` → `Success`; `am start -W` → `Status: ok`, `Activity: com.opago.wallet/.MainActivity`, Warmstart 2419 ms; Prozess-ID 15787. Vorhandene Wallet-Daten wurden nicht geöffnet oder auf Erhalt geprüft. | bestanden |

## Weitere Releasearbeit

Offene Implementierungen und Backend-Integrationen, konkrete Fehler, unabhängige Sicherheitsprüfung und Store-/Betreiberfreigaben behalten ihren eigenen Status. Die früheren Geräteszenarien sind keine offenen Releaseaufgaben für die bereits implementierten Funktionen.
