# Android Onchain-Geräteprüfung – 14. Oktober 2026

Geprüft auf dem angeschlossenen POS PG3NBG7YA, Android 14, arm64-v8a, mit BDK RN 1.1.0 und Hermes. Die getrennte App `com.opago.wallet.onchainprobe` nutzt eigene Daten und eine öffentliche BIP84-Testphrase. Die OPAGO-Wallet und ihr Seed wurden nicht geöffnet oder verändert. Es wurden ausschließlich wertlose lokale Regtest-Bitcoin verwendet.

Die Probe importiert die tatsächliche `initializeOnchainWallet`-Implementierung, die BIP84-Ableitung und das SQLite-Journal. Nur der Datenprovider wird auf einen über USB erreichbaren lokalen Esplora-Adapter umgestellt. Bitcoin Core 29.0 validiert Signatur und Transaktion; der Knoten hat keine Netzwerk-Peers. Der Testserver ersetzt keine Bitcoin-Konsensprüfung.

Bestandener Durchlauf:

1. Native Mainnet-Adresserzeugung stimmt mit dem öffentlichen BIP84-Testvektor überein.
2. Die Regtest-Empfangsadresse wird lokal erzeugt und vor Rückgabe gespeichert (11 ms nach Wallet-Initialisierung), ohne Netzwerkscan.
3. 100.000 Sats werden eingezahlt, gemined und als verfügbar erkannt.
4. Die Wallet bereitet 25.000 Sats mit 281 Sats Gebühr vor, signiert und speichert die Zahlung. Bitcoin Core akzeptiert den Broadcast.
5. Nach Bestätigung sind Wechselgeld und verbleibender Bestand von 74.719 Sats korrekt; beide Transaktionen sind vorhanden.
6. Nach Zerstörung der nativen Wallet-Instanz und erneuter Initialisierung aus ihrer Datenbank bleibt der Bestand korrekt.
7. Nach Löschung ausschließlich der Test-App-Wallet-Daten und ihres Journals werden aus der Testphrase allein Bestand, Wechselgeld und beide Transaktionen wiedergefunden.

Zusätzliche automatisierte Prüfungen nach dem POS-Feedback: 932 Tests, davon 931 bestanden und einer übersprungen; keine Fehler. TypeScript und ESLint ohne Fehler. Geprüft sind unter anderem die persistente Voreinstellung Bitcoin Only, ausgeblendete HBAR-Zahlungsoptionen, vollständiger Verlauf und Erhalt einer bereits angezeigten Onchain-Adresse bei verspätetem Spark-Start.

Grenzen: kein Mainnet-Geld bewegt, kein iOS-Gerätetest, kein vollständiger Geräte-E2E-Lauf mit Spark-Claim/Refund, kein produktiver Onchain-Kontoabgleich. Diese Nachweise werden nicht behauptet. Die Geräteprüfung ist ein Nachweis für direkte Onchain-Funktionen auf Android, keine allgemeine Produktionsabnahme.

Der Nutzer hat am 14. Oktober 2026 nach ausdrücklichem Hinweis auf die oben genannten offenen Prüfungen die allgemeine Integration angeordnet: „nicht nur für testbuild ganz generell einbauen“. Bitcoin Mainnet ist daher in der regulären Produktionskonfiguration aktiviert; `production-apk` erbt diese Einstellung. Es gibt kein gesondertes Pilotprofil und keine plattformspezifische Vollsperre. Die offenen Nachweise bleiben offen und werden durch diese Produktentscheidung nicht als bestanden gewertet. Der explizite Mainnet-Schalter, HTTPS-Prüfungen, Gerätefreigabe, Gebührenprüfung, UTXO-Reservierung und dauerhafte Speicherung vor Broadcast bleiben wirksam.

Öffentliche Testresultate:

```json
[
  {
    "stage": "started",
    "bdk": "1.1.0"
  },
  {
    "stage": "mainnet-address-vector-passed"
  },
  {
    "stage": "local-receive-address",
    "milliseconds": 11
  },
  {
    "stage": "receive-confirmed"
  },
  {
    "stage": "signed-broadcast-accepted-by-bitcoin-core",
    "feeSats": 281
  },
  {
    "stage": "send-and-change-confirmed",
    "balanceSats": 74719
  },
  {
    "stage": "restart-persisted-wallet-passed"
  },
  {
    "stage": "seed-only-restore-with-change-passed"
  },
  {
    "stage": "PASS"
  }
]
```

Quellstand des geprüften nativen Adapters (SHA-256): `cc05c48ece457052fb0c0cc474e35a0a69aeac98c8d9d36a23160216c5aa4f80`.
