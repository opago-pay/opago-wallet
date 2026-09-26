# iOS-TestFlight-Kandidat vom 25.09.2026

Dieser Nachweis betrifft den signierten EAS-Build [0cbbe1a9-01e8-4255-a60f-f46fd36cae7d](https://expo.dev/accounts/fabcot01/projects/wallet/builds/0cbbe1a9-01e8-4255-a60f-f46fd36cae7d), nicht die Geräte- oder öffentliche Store-Freigabe.

| Merkmal | Tatsächlicher Stand |
| --- | --- |
| App | `com.opago.wallet`, Version `1.0.0`, iOS-Buildnummer `4` |
| Profil | EAS `production`, Store-Distribution, Spark- und Hedera-Mainnet laut `eas.json` |
| Apple-Team | `68782L3HKV`, opago GmbH |
| Toolchain | EAS-Mac mit Xcode `26.0 (17A324)` und Node `22.23.1` |
| Build | `FINISHED` am 25.09.2026 um 13:47:39 UTC; Xcode-Archiv und IPA-Export erfolgreich |
| IPA | `25.080.232` Bytes; SHA-256 `ECC8C3C1604B04A4BD724C473776D58A552026ACDC14E9472D825BC0FA83221D` |
| Qualitätsgate | Auf dem EAS-Mac: 559/559 App-Tests und 9/9 Contract-Tests, Typecheck und Lint bestanden. |
| App Store Connect | App-ID `6816107766`; EAS-Submit-Auftrag [1d692afd-71ab-4535-a76d-5b907c148c21](https://expo.dev/accounts/fabcot01/projects/wallet/submissions/1d692afd-71ab-4535-a76d-5b907c148c21) wurde am 25.09.2026 um 14:41:48 UTC abgeschlossen. `eas submit:status` meldete anschließend für Build `1.0.0 (4)` `processingState=VALID` und `internalState=IN_BETA_TESTING`. |

Der erste iOS-Versuch (Buildnummer 3) stoppte im Post-install-Gate, weil die App-Tests die Produktions-Netzwerkvariablen erbten. `scripts/eas-production-gate.cjs` entfernt diese Variablen **nur** aus dem Test-Subprozess. Das Produktionsprofil des tatsächlichen Builds bleibt unverändert. Der korrigierte Gate-Lauf bestand lokal unter Node 22.23.1 mit injizierter Produktionsumgebung und erneut auf dem EAS-Mac.

EAS meldet den Commit `e0d3a23db8d6c5a576c569986eb4136bf40daef0`, aber der hochgeladene Quellstand enthält uncommitted Änderungen. Der Commit allein reproduziert den Build nicht. Die neue Swift-Komponente wurde als Teil der App kompiliert; ihre separaten XCTest-Sicherheits- und kontrollierten HTTPS-/DNS-Gerätetests wurden durch diesen normalen EAS-Build **nicht** ausgeführt. iPhone-/iPad-Abnahme, Zahlungsfälle und die übrigen Punkte aus `native-release-acceptance.md` bleiben offen. Es wurde keine Mainnet-Zahlung und keine öffentliche App-Store-Veröffentlichung ausgelöst.

EAS legte für interne Tests die Gruppe `Team (Expo)` an und meldete TestFlight-Zugriff für `fabian.cotic@opago.com` und `michael.fischer@opago.com`. Das belegt die serverseitige Bereitstellung, nicht eine Installation oder Funktionsprüfung auf deren iPhones.

## Face-ID- und Erststart-Korrektur: Build 5

Der erste iPhone-Test von Build 4 meldete nach erfolgreicher Face-ID-Systemfreigabe „Return to Opago and try again.“ Die App wartete danach nur zwei Sekunden auf den iOS-Zustand `active`. Build 5 wartet bei iOS bis zu 15 Sekunden, übernimmt eine möglicherweise zwischen Prüfung und Listener-Registrierung eingetroffene Rückkehr und lehnt eine tatsächliche Hintergrund-Rückkehr weiterhin ab. Zusätzlich leitet der Root-Gate bei sicher festgestelltem leerem Wallet-Speicher direkt zur Einrichtung weiter; eine neu erstellte oder wiederhergestellte Wallet erhält anschließend wieder die normale Sperre. Vorhandene Keychain-Objekte werden nicht gelöscht oder ersetzt.

Der lokale vollständige Node-22.23.1-Produktionsgate-Lauf bestand nach diesen Änderungen mit 563/563 App- und 9/9 Contract-Tests, Typecheck und Lint ohne Fehler (eine bestehende Lint-Warnung in `lib/wallet-display.ts`). Neue Regressionstests decken verzögerte iOS-Face-ID-Rückkehr, Hintergrundabbruch sowie Erstellung und Wiederherstellung bei zunächst inaktivem iOS-AppState ab.

Der signierte EAS-Build [7377625d-edbd-4772-85e2-1aa2f67f4b0d](https://expo.dev/accounts/fabcot01/projects/wallet/builds/7377625d-edbd-4772-85e2-1aa2f67f4b0d) ist Version `1.0.0 (5)` mit Bundle-ID `com.opago.wallet` und Fingerprint `7c43a453f700b7049dda722ae5128a4a8f405507`. Die [interne TestFlight-Einreichung 5cd9426b-ffde-4450-8a34-2d5fc3815ed7](https://expo.dev/accounts/fabcot01/projects/wallet/submissions/5cd9426b-ffde-4450-8a34-2d5fc3815ed7) wurde am 25.09.2026 um 15:59:14 UTC abgeschlossen. App Store Connect meldet für Build 5 `processingState=VALID` und `internalState=IN_BETA_TESTING`. Die Funktionsprüfung auf dem iPhone Air mit iOS 26.5.2 ist noch offen.
