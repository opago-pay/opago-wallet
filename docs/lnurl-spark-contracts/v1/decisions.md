# Feedback zu V6 und festgelegte Ergänzungen

Version 6 klärt die fachlichen Vorgaben erheblich. Für dieses Paket gelten die neueren Festlegungen: minimale Vergleichsdaten, interner führender Bestand einschließlich verschlüsselter Fotos, automatischer Daten-Foto-Abgleich, kein vollständiges KYC und keine 1.000-Euro-Grenze im non-custodial MVP. Die frühere Ablage neuer Wallet-Daten über Airtable/SharePoint wird dadurch ersetzt. Der bestehende Firmen-KYB-Bestand bleibt außerhalb dieses Vorhabens.

Die drei technischen Vertragslücken aus dem V5-Review sind in V6 weitgehend unverändert. Dieses Paket schließt sie durch konkrete Festlegungen; es wartet dafür nicht auf ein weiteres Teamdokument.

## Aufgelöste Widersprüche

| V6-Fundstelle | Festlegung dieses Pakets |
|---|---|
| Abschnitt 9 ordnet Konto-Löschung pauschal Wallet-Token zu | Konto-Token und frische OIDC-Authentifizierung, auch bei null Wallets. Jede Route hat eine eigene Auth-Policy. |
| 3.5 nennt für Restore aktiver Wallets nur Wallet-Login, 4.1 zusätzlich Kontozugang | Lokaler Seed-Restore funktioniert unabhängig von OPAGO. Eine neue Server-Session für eine bereits kontogebundene Wallet verlangt Kontozugang derselben Partei plus Wallet-Signatur. Vorhandene normale Wallet-Refresh-Sessions bleiben gemäß ihrer Laufzeit verwendbar. |
| Wallet-Konto-Bindung fehlt in Aktionsliste und Endpunkten | Neue Aktion `wallet_bind`, signiert Partei und Kontogeneration; `POST /api/v2/account/wallets` verbraucht den einmaligen Nachweis unter frischem Kontozugang. |
| UUID je KYC-Revision versus mehrere Änderungen/Fotos | UUID je logischer Schreiboperation; separate langfristige Submit-Deduplizierung pro Revision; explizite neue Revision auch für Korrekturen. |
| Adressvorschlag aus freigegebenen Daten versus Auswahl während Prüfung | Vorschlag aus den eigenen eingereichten Daten nach Konto-Bindung; Reservierung `pending_kyc`; Aktivierung erst bei gebundenem Konto und erfolgreichem Serverabgleich. |
| Neue Beobachtungsversion fehlt in Ingest-Beispiel | Inhaltlich deterministische Ereignisversion und Ereignis-ID, mit Korrekturbezug. Keine lokal hochgezählte globale Versionsnummer, die auf zwei Geräten kollidiert. |
| Helper-Kurzmodell bezeichnet fehlenden Datensatz als `not_executed` | Fehlender Datensatz ist `unknown`. Ein eigener Fence-Aufruf kann atomar einen dauerhaften Sperrdatensatz erzeugen, der verspätete POSTs derselben Operation verhindert. |
| Signierte UMA-Discovery und Prüfung roher Gegenantwort ohne App-API | Vier konkrete interne Vermittlungsschritte mit Exchange-/Request-IDs, fest gebundenen Zielen und serverseitigen Schlüsseln. |
| Neue Fehler fehlen im Katalog | Ergänzt, einschließlich `operation_conflict`, `amount_mismatch`, `address_changed`, `revision_conflict`, `account_mismatch` und `upstream_pending`. |
| Gleicher Description-Hash für LNURL und UMA angenommen | Das festgelegte Python-UMA-SDK 1.6.0 hängt serialisierte payerData an die Invoice-Metadaten an. Der Vertrag speichert und prüft deshalb für UMA die tatsächlichen SDK-Invoice-Metadaten getrennt vom Discovery-Hash. Normales LNURL bleibt unverändert. |

## Technische Entscheidungen der Vertragsversion

- Kontoauthentifizierung über OIDC Authorization Code mit PKCE S256 und Systembrowser. Tatsächlicher Issuer, Client-ID und exakt registrierte Redirects sind Deployment-Konfiguration, keine vom Client frei wählbaren Ziele.
- Zugangsdaten und Einmalnachweise werden getrennt: Eine Aktionssignatur gibt nur einen Proof-Token zurück und erstellt keine neue allgemeine Wallet-Session.
- Token-Prüfung bleibt in api-internal. Die öffentliche API leitet das ursprüngliche Nutzer-Credential zusätzlich zu ihrem eigenen Service-Credential weiter. Frei gesetzte Party- oder Wallet-Header sind keine Autorität.
- Vergleichergebnis `passed` setzt ausschließlich `wallet_photo_match_status` bzw. die technische Freigabe. `identification_status` bleibt ohne Full-KYC/KYB `unidentified`. Auch externe UMA-Daten dürfen daraus keinen verifizierten KYC-Status machen.
- Vorschlagswerte aus V6 werden für den Vertrag konkretisiert: Access 15 Minuten, Refresh maximal 30 Tage, Aktionsproof 5 Minuten, Kontext 10 Minuten, Invoice maximal 3.600 Sekunden, rollierende Namensänderung alle 30 Tage, keine Weiterleitung alter Namen und keine Namensübertragung in diesem neuen Wallet-Endpunkt. Bestehende Namen bleiben ihrem Empfänger zugeordnet.
- Non-custodial TME bleibt im Schattenmodus; ausgefallener Pre-Check wird mit `unavailable` gespeichert und nachgeholt. Authentifizierung, Betrag, Empfängerbindung, sichere Netzwerkziele und custodial Lizenz-/Identitäts-Gates bleiben hart. Diese aus V6 übernommene Betriebswahl ist im Release-Gate sichtbar, kein versteckter Fallback.
- Aufbewahrungsfristen erhalten keinen pauschalen produktiven 5-/10-Jahres-Default. Produktionsbereitschaft erfordert eine konfigurierte, freigegebene Matrix. Backups brauchen feste Ablaufzeiten und ein Restore-Verfahren, das Lösch-Tombstones vor erneuter Freigabe anwendet.

## Noch tatsächlich nachzuweisen

1. **F2:** Externe Lightning-Zahlung auf eine serverseitig für den Nutzer erzeugte Invoice erreicht ausschließlich die richtige Spark-Wallet, auch bei offline befindlicher App; Signaturverhalten, Anbieternachweise und Privacy-Grenzen werden dokumentiert. Dieses Paket kann den Versuch nicht ersetzen.
2. **HKA/UMA:** Mobile Implementierungen müssen die HPKE-/Signatur-Fixtures auf Android und iOS verarbeiten. UMA benötigt zusätzlich echte Interoperabilitätsnachweise mit den gepinnten offiziellen SDKs. Eine durch ein Schema akzeptierte Nachricht ist kein Signaturnachweis.
3. **Compliance/Datenschutz:** Kategorie, Zweck/Rechtsgrundlage, Fristbeginn, Fristende, Legal Hold und Löschpfad einschließlich Backups müssen freigegeben sein. V6 bezeichnet fünf bzw. zehn Jahre ausdrücklich nur als Annahme. Die Rechtsgrundlagen in seiner Tabelle sind durch dieses technische Review nicht bestätigt.
4. **Release:** Echte Serverimplementierung, konkurrierende Wiederholungen, Wiederanlauf, Löschung, Netzwerk- und Geräteabnahme sowie Signing und Store-Unterlagen bleiben erforderlich.

## Beobachtung zum vorhandenen Code

Lokal gefunden wurde `opago-api/docs/api-internal-lnbits-handoff/openapi.json` in Version `0.1.0-proposal`; dieser Vertrag behandelt die frühere LNbits-Migration. Ein lokaler neuer Wallet-/Spark-Vertrag wurde in den geprüften Quell- und Dokumentverzeichnissen nicht gefunden. Das aktuelle `opago-compliance`-Repository war nicht vorhanden; die Aussage gilt deshalb nicht als vollständige Remote-Inventur.

Die vorhandene `opago-api/docs/hpke-authentication.md` beschreibt ein älteres Login-Format ohne die neue AAD-/Antwortverschlüsselung. Das ist mit V6 nicht kompatibel. Bei Umsetzung muss die dortige HPKE-Verarbeitung auf den hier definierten Vertrag gebracht werden; den gleichen Namen `hpke-v1` zu verwenden reicht nicht. Die lokale `cryptography`-50.0.1-HPKE-Suite bietet in ihrer `encrypt/decrypt`-Oberfläche weder AAD-Parameter noch Exporter-Kontext. Die Produktion benötigt eine hierfür geeignete geprüfte Bibliotheksoberfläche; der Fixture-Test nutzt dafür PyHPKE in einer isolierten Testumgebung.

Es wurde kein Backend aktualisiert, kein Remote-Repository verändert und keine bestehende App-Funktion umgebaut. Alle neuen Dateien liegen in diesem eigenständigen Vertragspaket.
