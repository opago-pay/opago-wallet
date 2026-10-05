# Gerätetests der implementierten Wallet-Funktionen

Stand: 5. Oktober 2026. Die App ist für den implementierten Bitcoin-/Lightning- und HBAR-Wallet-Umfang production-ready. Signierte Builds, öffentlicher APK-Download und überprüfte Signatur sind unter [Production release status](PRODUCTION_RELEASE_STATUS.md) dokumentiert. Fabian hat den aktuellen Teststand bestätigt: Mehr als zehn Personen testen die App bereits auf Geräten über TestFlight und die Android-Verteilung über Google Play beziehungsweise APK.

Für die bereits implementierten Wallet-Funktionen sind keine separaten Gerätetests oder Geräteabnahmen als offene Aufgaben geführt. Frühere Hinweise auf ausstehende Android-/iPhone-Tests, eine zweite Testhardware oder fehlende manuelle Abnahme sind überholt und wurden aus den Statusunterlagen entfernt. Die laufenden Nutzertests sind der aktuelle Geräteteststand.

Diese Bestätigung betrifft die implementierten Funktionen. Noch nicht implementierte OPAGO-Registrierung und UMA, POS-Verknüpfung, Plattform-Synchronisation und Identitäts-Onboarding behalten ihren jeweiligen Entwicklungs- und Backend-Abhängigkeitsstatus. Eine gemeinsame Prüfung dieser zusätzlichen Integrationen kann erst mit ihrer Lieferung erfolgen.

Erfolgreiche Builds vom aktuellen Hauptbranch `724ca2e6da346e181a83d72875d12ba55bca49e1` sind vorhanden:

| Plattform | Build | Profil | Abschluss am 4. Oktober 2026 CEST |
| --- | --- | --- | --- |
| iOS | [46](https://expo.dev/accounts/fabcot01/projects/wallet/builds/f394175c-9eff-44ae-9ca3-bb0511143ce7) | production | 18:39 |
| Android | [11](https://expo.dev/accounts/fabcot01/projects/wallet/builds/88dbf9fb-0e29-409b-9ef0-e4e669629398) | production | 18:15 |
| Android APK | [12](https://expo.dev/accounts/fabcot01/projects/wallet/builds/c1c4852f-88e5-410a-a0e2-7ee9064bc9f4) | production-apk | 18:32 |

Die Build-Ergebnisse wurden am 5. Oktober 2026 direkt aus EAS gelesen. Die Aussage zur laufenden Erprobung und zum Abschluss der Geräteaufgaben stammt von Fabian; sie ist keine nachträgliche Behauptung, dass jeder einzelne historische Labortest vom Agenten durchgeführt wurde.

Offene Implementierungen, konkrete Fehler, Anbieterklärungen, Backend-Lieferungen und Store-/Betreiberfreigaben werden weiterhin jeweils separat dokumentiert. Sie werden nicht als fehlende Geräteabnahme zusammengefasst.
