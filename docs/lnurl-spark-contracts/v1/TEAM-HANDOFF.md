# Umsetzung je Repository

Verwende dieses Paket unverändert in Version 0.1.0 als gemeinsamen Vertrag. Es basiert auf Plan V6. Der Code der Anwendung wurde durch die Vertragserstellung nicht bereits implementiert. Für jeden Auftrag zuerst lokale Repository-Anweisungen und bestehenden Code prüfen. Vorhandene Nutzeränderungen erhalten. Änderungen an gemeinsamen Verträgen versionieren und an alle Verbraucher weitergeben; keine still abweichenden Feldnamen, Fehlercodes oder Hashregeln implementieren.

## App Repository opago-wallet

Implementiere den Wallet-MVP aus `README.md`, `openapi-public.json`, `schemas.json` und `protocol.md`. Verwende die festgelegten Routen für Bootstrap, OIDC-Kontoanmeldung, getrennten Wallet-Besitznachweis und explizite Kontobindung. Baue den minimalen Daten-Foto-Abgleich mit Revisionen, persistenten Operationsschlüsseln und Statusdarstellung. `approved` bedeutet Fotoabgleich, nicht verifizierte Identität. Salden und Zahlungsautorisierung bleiben im Spark SDK.

Zeige nach Aktivierung als ersten Empfangs-QR die vom Backend bestätigte Lightning-Adresse. Vor Aktivierung den verständlichen Prüfstatus anzeigen. Implementiere die Wiederherstellungsmatrix, Kontolöschung ohne aktive Wallet und den ausdrücklichen Neustart nach Kontolöschung. Ergänze Ingest mit deterministischen Ereigniskennungen und lückenlosem Cursor. Für UMA die vier Vermittlungsschritte verwenden; VASP-Schlüssel bleiben im Backend. Vor Zahlung zusätzlich Betrag, Netzwerk und BOLT11 prüfen.

Prüfe die gemeinsamen Fixtures in der tatsächlichen Android-/iOS-Laufzeit. Verwende Mocks für noch nicht implementierte Backend-Routen und kennzeichne sie als solche; kein Fallback auf Produktions-LNbits oder fest eingebaute Zugangsschlüssel. Berichte erfüllte Szenarien aus `acceptance.json`, ausgeführte Prüfungen und verbleibende reale Geräte-/Backend-Nachweise.

## Öffentliche API Repository opago-api

Implementiere ausschließlich die Fassaden- und Transportzuständigkeit aus dem Vertrag. Nutze `route-map.json` für Methode/Pfad-Zuordnung. Stelle HPKE für den neuen Wallet-Vertrag einschließlich AAD, Antwortverschlüsselung, signiertem Schlüsseldokument, Replay-Prüfung und begrenztem Foto-Upload um. Das vorhandene Login-HPKE-Format reicht dafür nicht. Produktionsschlüssel werden über das vorhandene Secret-Management bereitgestellt; die Testschlüssel im Paket sind öffentlich.

Leite Nutzer-Credentials neben dem Service-Credential weiter, entferne gefälschte Identitätsheader und lass api-internal fachliche Entscheidungen treffen. Fachliche Status-/Fehlerantworten unverändert verschlüsselt zurückgeben. Externe LNURL-/UMA-Routen sind normales HTTPS/JSON. Keine automatische Wiederholung schreibender Fachaufrufe. Konfiguriere nur die ausdrücklich benötigten Cloudflare-Ausnahmen; bestehende custodial/Händlerzugänge bleiben geschützt.

Teste Weiterleitungszuordnung, Credential-Verwechslung, Größen-/Zeitlimits, Replay über mehrere Replikate, Schlüsselrotation und Fehler nach bereits erfolgter interner Wirkung. Weise die relevanten Fälle aus `acceptance.json` nach. Eine erfolgreiche HTTP-Weiterleitung allein ist keine Zahlungsabnahme.

## Interne API Repository opago-compliance

Übernimm das Paket als gemeinsamen Vertragsstand nach `contracts/lnurl-spark/v1/` und implementiere `openapi-internal.json` mit den Zustandsregeln aus `protocol.md`. Revalidiere Nutzer und Service für jede geschützte Route. Erstelle Migrationen für Parteien, Wallet-Bindungen, Enrollment/Revisionen, intern verschlüsselte Dokumente, gemeinsame Namen, dauerhafte Operationsschlüssel, Zahlungskontexte/Registrierungen, Beobachtungen und Nachweise, Lösch-Tombstones und Outbox.

Neue Wallet-Daten gehen nicht in die alte Firmen-KYB-Strecke. Der automatische serverseitige Fotovergleich schaltet nur den non-custodial Zugang frei. Behalte vollständige Identifizierung und custodial Gates getrennt. Für non-custodial gilt keine 1.000-Euro-Regel. Implementiere die zentralisierte Invoice-Orchestrierung, Amount-Bindung, Fencing-Abgleich, verspätete Ergebnisse und reale Mehrfachzahlungen. Beobachtete und bestätigte Transaktionen dürfen nicht vermischt werden.

Implementiere UMA über die gepinnten offiziellen SDKs, einschließlich korrekter `NOT_VERIFIED`-Aussage für reine Fotoabgleiche, IVMS-Format, tatsächlichem SDK-Description-Hash und unabhängig validierten Gegenantworten. Dokumentiere die Python-/JS-Interoperabilität statt nur eigene Nachrichten gegeneinander zu testen. Setze Löschung einschließlich Keycloak, Queues, Dokumenten, Projektionen und Backup-Restore-Regeln um. Keine produktiven Aufbewahrungsfristen aus den unverbindlichen 5-/10-Jahres-Annahmen ableiten.

Prüfe konkurrierende Requests und Worker-Abstürze gegen echte Datenbanktransaktionen. Berichte erfüllte Akzeptanzfälle, Migration/Rollback, notwendige Deployment-Werte und die verbleibende Compliance-Freigabe. `opago-risk-reporting` wird dadurch nicht erneut zum führenden Repository erklärt.

## Spark Helper Repository opago-spark

Implementiere `openapi-helper.json` mit dauerhafter Operationskennung, unveränderlichen Eingaben, Eigentümer-Lease, Generation und Fence-Endpunkt. Nur api-internal darf den Helper aufrufen. Für fehlende Operationsdatensätze zunächst `unknown` zurückgeben; `not_executed` ist erst nach atomarer, dauerhafter Sperre verspäteter POSTs zulässig. Keine Wiederholung des SDK-Aufrufs allein wegen Timeout oder Pod-Neustart.

Führe F2 auf isolierten Test-Wallets mit kontrollierten Beträgen durch: Invoice serverseitig für genau den Nutzer-Pubkey erzeugen, aus einer unabhängigen Lightning-Wallet bezahlen, direkte Gutschrift auch bei offline befindlicher App nachweisen. LNbits und Spark-Transfers als Ersatz für den Lightning-Test sind dabei ausgeschlossen. Belege außerdem Signatur-Hashing des SDK, Verfügbarkeit/Zuordnung von Anbieterereignissen, Ablaufverhalten und Privacy-Grenzen. Dokumentiere Resultate und reale Artefakte; keine Produktions-Wallet für destruktive Tests benutzen.
