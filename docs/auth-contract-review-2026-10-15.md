# Website-/Wallet-Auth: Review und Übergabe, 15. Oktober 2026

## Nachtrag: neuer PR-Stand und Veröffentlichung über Fabians CLI

Der erneute GitHub-Abgleich hat #578 inzwischen bei
`a499fa0b0940e0158899ee31da9cc90720fa35a0` gefunden (ein neuer Commit nach
dem unten dokumentierten `c4a0eb3`). Dieser neue Stand korrigiert bereits
Lease-Besitzer, Redirects und private Preflights. Diese Änderungen werden
**nicht nochmals eingespielt**.

Der aktuelle minimale Folgebranch liegt unter
`C:/dev/opago-api/scratch/auth-broker-latest-20261015`,
`codex/auth-broker-latest-followup-20261015`.
Er enthält CI-Ergänzung `924ba4341aa2e444f4cac16ae89363749515a4e4` und
Korrektur `ce82ba15547dcd2c146b23435a625f2d52b1c171`:
Code-/Refreshablauf nach Signierung unmittelbar vor Commit sowie atomare
Behandlung einer bereits belegten Nachfolger-ID. Zehn zusätzliche Testfälle
prüfen auch die schon übernommenen Lease-Sicherungen; fünf davon scheiterten
vor der verbleibenden Korrektur auf `a499fa0`.
Auf `ce82ba1`: **1.558 Tests bestanden, ein optionaler HPKE-JS-Test übersprungen**,
darunter 150 Brokerfälle; Ruff-Selektoren und Formatcheck bestanden.
Simulation und Live-Grenzen unten gelten unverändert.

#576 steht weiterhin auf `328f42582e62b10498578a429c229a227439ba96`.
Der veröffentlichbare API-Folgebranch bleibt ein Fast-forward des vorhandenen
#578; dessen vier fehlende neuere Abhängigkeitscommits sind vor einem Merge
durch den Stack-Verantwortlichen abzugleichen. Der unten dokumentierte
Kombinationsstand `e84182f` und seine 1.557 Tests sind **historische Evidenz**,
kein Test der neuen Revision `ce82ba1` auf dem gesamten aktuellen Stack.
Es wurde kein Merge vorgenommen.

**Die alte API-Patchdatei `api-auth-followup-20261015.patch` ist durch
`api-auth-followup-latest-20261015.patch` ersetzt.** Nur die neue Datei bzw.
den aktuellen Folgebranch für #578 verwenden.

Fabians normale PowerShell erreicht GitHub über `gh api`. Der verweigerte
CLI-Netzzugriff und die nicht interaktive Schreibfreigabe betreffen diese
Agentensitzung. In
`C:/dev/opago-api/scratch/auth-handoff-20261015/publish-auth-prs.ps1`
ist ein manuell in Fabians normaler PowerShell ausführbares Skript vorbereitet.
Es prüft beide PRs, Berechtigungen, lokale Commits und unveränderte Beschreibungen
vor dem ersten Push. Es verwendet keine Force-Pushes, verändert keine
Proxy-/Authentifizierungs-/Freigabeeinstellungen und aktiviert keine Features.
Bei fremden neuen Commits oder Beschreibungen bricht es ab.
Bis zur erfolgreichen manuellen Ausführung sind die PRs **nicht aktualisiert**.

---

Für Fabian, Michael und Andi. **Der durchgehende Ablauf ist noch nicht abnahmebereit.**
Die belegbaren Sicherheitslücken sind lokal korrigiert. Website-Konfiguration,
Backend-Authentifizierung und die Akzeptanz der Broker-Sitzung müssen noch
festgelegt bzw. geliefert werden. Kein Merge, Deployment, produktives Konto,
Zahlung, Nachricht oder Aktivieren eines Feature-Schalters.

## Review von #577 und vorhandener Broker

[API #577](https://github.com/opago-pay/opago-api/pull/577) ist tatsächlich gemergt:
15. Oktober, 08:51:40 UTC, Mergecommit
`422ce4a269e77344349222c596ea11fb8e78db2e`.
Das vollständige [Originaldokument bei `b5f9a01`](https://github.com/opago-pay/opago-api/blob/b5f9a01d43845f5c7ca7038dcee08b64b11515f7/docs/contracts/auth-login-and-app-handover.md)
wurde gelesen; sein Blob auf aktuellem main ist unverändert
`ad851252480610ff994f569cdd7eaa776ae4a487`.

- Ab Zeile 36: API-vermittelte Authentifizierung, kein direkter Keycloak-Zugriff,
  getrennte Kunden-/Staff-Konten und Turnstile für den von Apps verwendeten Browserpfad.
- Dokumentiert: Website-HPKE über `GET /api/v2/auth/login/hpke-key` und
  `POST /api/v2/auth/token`, bisherige Kundensitzung, Signup und E-Mail-Operationen.
- **A2/D1–D6 sind weiterhin ausdrücklich Vorschläge**: Abschnitt ab Zeile 289,
  D2/D3/D6 in Zeilen 330/331/334. Zeile 336 verlangt Entscheidungen vor
  Implementierung und Release. Ein Dokumentenmerge löst diese Punkte nicht.
- AppConfig ab Zeile 338 liefert keine bestätigten Website-Login-/Register-URL-Felder.
  Kontosperre, 2FA und die nachgelagerte Sitzungsautorität bleiben teilweise offen.

Die vorhandene Implementierung liegt in
[API #578](https://github.com/opago-pay/opago-api/pull/578), geprüft bei
`c4a0eb3f42864e3d4631e237fe0da30259cedffc`.
Die [Broker-Dokumentation](https://github.com/opago-pay/opago-api/blob/c4a0eb3f42864e3d4631e237fe0da30259cedffc/docs/wallet-auth-broker.md)
nennt einen API-eigenen OIDC-Broker und als genehmigte Walletwerte:
`opago-wallet`, `com.opago.wallet:/oauth/callback`, Audience `opago-account`,
300 Sekunden Access-/ID-Token, acht Stunden absolute Refreshgrenze.
Das ist ein offener Implementierungs-PR, kein Deploymentnachweis und keine
stillschweigende Entscheidung über sämtliche übrigen D2-/D3-/D6-Fragen.

## Verifizierte Revisionen und PR-Abhängigkeiten

| Repository / PR | Geprüfter Stand |
| --- | --- |
| [Wallet #49](https://github.com/opago-pay/opago-wallet/pull/49) | Offen, Draft; Basis `mvp-branch` bei `4a6029d39b844dca8c6ceb4bbf90910b576f2570`; Head `c604211cf293c9d6f5ca9302994b2bb4e1e0b1f9`. Geeigneter bestehender PR. |
| API main / #577 | `422ce4a269e77344349222c596ea11fb8e78db2e`. |
| [API #570](https://github.com/opago-pay/opago-api/pull/570) | Offen, Head `a0e04c173bf4fb50d0fe79b00a673ecea30d061f`, Basis main; Ruff-/Vulture-Stackbasis. |
| [API #571](https://github.com/opago-pay/opago-api/pull/571) | Offen, Head `4d1f5475b824c887d0d7b1c4f0946820be5963d1`, Basis #570; Signup-Turnstile. |
| [API #572](https://github.com/opago-pay/opago-api/pull/572) | Offen, Head `95460a42317f63631d5eeb20ab34a04c949da101`, Basis #571; Website-Login und inzwischen Passwort-Reset-Rolloutschalter. Ältere Referenz in #577 überholt. |
| [API #576](https://github.com/opago-pay/opago-api/pull/576) | Offen, Head und Branchref `328f42582e62b10498578a429c229a227439ba96`, Basis #572; genaue Origin-Allowlist ohne Credentials. |
| [API #578](https://github.com/opago-pay/opago-api/pull/578) | Offen, Head `c4a0eb3f42864e3d4631e237fe0da30259cedffc`, Basis Branch von #576. Gegen dessen aktuellen Head sechs Commits voraus, vier zurück; gemeinsame Basis `8e0c54cbc744ba8aa655906cfb64dc6b08e3078e`. |
| Dashboard main | `f1dfd0d0268b87f35ef175026cfaba4a818e5357`; aktuelle Auth-Konfiguration, Rollenmodell und Dateibaum gelesen. Kein Website-Broker-Callback; kein neuer Dashboard-PR. |

Die Hauptarbeitsverzeichnisse blieben erhalten: Wallet `0570459` einschließlich
des vorhandenen unversionierten Bitcoin-Plans; API `1b90ca1` einschließlich
zahlreicher fremder Änderungen; Dashboard `aadf19c` einschließlich lokaler Logs.
Branch-/Worktree-Bestand und Auth-Vorarbeiten wurden durchgesehen.
API #569 bei `1ae7829` ist ein alter Kundensitzungs-/Passwortadapter, kein Browserbroker.
Der generische Wallet-OIDC-Client wurde nicht als Keycloak-Ausweichweg aktiviert.
Es entstand keine zweite Brokerimplementierung.

Arbeitsorte und lokale Branches:

- Wallet: `C:/dev/opago-wallet/.codex-local-evidence/website-account-20261014`,
  `codex/website-auth-contract-followup-20261015`, auf #49-Head.
- API direkt auf #578: `C:/dev/opago-api/scratch/auth-broker-20261015`,
  `codex/auth-broker-safety-20261015`.
- API zusammen mit aktuellem #576:
  `C:/dev/opago-api/scratch/auth-broker-current-stack-20261015`,
  `codex/auth-broker-current-stack-20261015`.
  Vorhandene Brokeränderungen wurden per Dreiwegeanwendung übernommen;
  die vier neueren Stackcommits bleiben erhalten. Das auf main gemergte
  #577-Dokument wurde unverändert übernommen. Geprüfter Kombinationscommit:
  `e84182f6dcee320ee05e1bf11f7cd69dfb3920c2`, Tree
  `e1a16c75f4905a89015de695b139c713088a34a2`.

API-Ausgangscommits und Quellbäume wurden über den freigegebenen Connector
übernommen und gegen ihre Git-Hashes geprüft. Die API-Prüfcheckouts verwenden
einen separaten Objektspeicher mit begrenzter Historie; der schmutzige
API-Hauptcheckout wurde nicht aktualisiert.

## Implementiert

**Wallet, `0fee137c905d5913d5987d702a526b8d81b2f613`:**
Wenn die AppState-Listenerregistrierung beim Browserstart synchron fehlschlägt,
beendet `website-browser.ts` jetzt Geräteauthentifizierung, Timer und Browser-Sperre.
Kein Browser wird geöffnet; eine bereinigte Fehlermeldung und ein ausdrücklicher
neuer Versuch sind möglich. Alte Zahlungsfreigaben bleiben ungültig.
Der neue Test prüft auch Timerbereinigung und unveränderte Wallet-Autorisierung.

**API, `489886de58fa368158723bc73b14aabbf8dc6eeb`, auf #578:**

- Zufälliger Besitzerwert pro Code-/Refresh-Lease. Redis-Lua erlaubt Commit,
  Restore und terminalen Verbrauch nur dem aktuellen Besitzer. Ein alter Request
  kann nach Leaseübernahme weder einen zweiten Nachfolger ausgeben noch neue Arbeit zurückrollen.
- Commit verweigert vorhandene Done-Marker und Kollisionen beim Speichern
  des Nachfolgers; Zustandsänderungen bleiben in einem atomaren Lua-Schritt.
- Erneute Code-/Refreshablaufprüfung nach Signierung unmittelbar vor Commit.
- Public OPTIONS muss selbst einen freigegebenen Inventareintrag haben.
  Private Broker-Preflights bleiben 404 ohne CORS, auch wenn ihr GET/POST aktiv ist.
- Redirectregistry erlaubt HTTPS oder Reverse-Domain-Privatschemata mit Single-Slash-Pfad.
  `htps:`, `mailto:`, generische Schemata und Authority-/Triple-Slash-Varianten
  scheitern bereits an der Konfiguration.
- 19 zusätzliche Fälle prüfen Überlappung nach Leaseablauf, alte Besitzer,
  langsame Verarbeitung, Preflights und Redirects an tatsächlichen Broker-/WSGI-Modulen.
  Die ersten 17 Fälle reproduzierten die Fehler vor der Korrektur.

**API, `a3e90060264de7cde9c66bbebfffdf7704e5beb6`:**
Broker-Suite und Lint-/Formatprüfungen im vorhandenen Quality-Job ergänzt.
Image-Publishing bleibt unverändert auf `push` und `refs/heads/main` beschränkt.
Der kombinierte Stand auf aktuellem #576 enthält dieselben Korrekturen und CI-Ergänzungen.

**Dashboard:** Kein Produktcode geändert. `internalLogin.ts`, `serverSession.ts`,
`sessionPolicy.ts` und `return-path.ts` sind gegenüber dem separat geprüften
Ausgangsstand unverändert; aktuelle Auth-Konfiguration weiter mit Credentials-/HPKE-Login.
Rollen aus autoritativem `/me`, Tenant-, Eigentümer-, Origin- und Sitzungsschutz
bleiben erhalten. Ohne D6-Client/Callback/Sitzungsabbildung wird kein Loginumbau geraten.

## Nicht gelöste Integrationspunkte und Fundstellen

| Offener Teil | Fundstelle und Konsequenz |
| --- | --- |
| Websiteziele / private Registrierung | #577 »Wallet AppConfig URL fields«, ab Zeile 338, und »Website signup and browser return«, ab Zeile 221. AppConfig 0.2.0 ist geschlossen; neue URL-Felder, Pfade und Übermittlung des privaten Startkontexts fehlen. Keine Felder oder Queryparameter erfunden. |
| Website-HPKE vs. API-Brokerseite | #577 A2 ab Zeile 289 ist vorgeschlagen; #578 liefert eigene Sign-in-Form mit `broker_login`-Turnstile und privatem Authenticator-Port. Endgültigen vereinbarten Einstieg bestätigen. |
| Produktiver Authenticator | #578 »Authentication adapter«: `DisabledAuthenticator` liefert bis zum privaten Compliance-Adapter 503. Kein temporärer Keycloak-Passwortgrant genehmigt oder angeschlossen. |
| Konto- vs. Wallet-Autorität | #577 D3 und offene Frage 12; Wallet `bootstrap-native.ts`, `account.ts`, `public-account-session.ts`. Broker-JWT ist nicht automatisch Public-Bearer, F3-AccountBearer oder WalletBearer. API-Akzeptanz, Subject-/Tenantabbildung und sichere Übernahme fehlen als kompatibler Vertrag. Bindung braucht weiter Besitz-/Aktionsnachweis. |
| Callback / Kaltstart / Antwortverlust | #577 offene Fragen 4/5/7; #578 »Client contract« und »State in shared Redis«. Code-Replay widerruft die Familie: verlorene erfolgreiche Austauschantwort ist nicht beliebig erneut einlösbar. Resume-, Logout-, Kontowechsel- und Altsitzungsregeln fehlen. Wallet `app.json` registriert bisher `opagowallet`; Broker nennt `com.opago.wallet:/oauth/callback`. `native-intent.ts` verwirft Auth-Links sicher. Kein Callback ohne vollständige Integration zugelassen. |
| Dashboard / D6 | #577 Zeile 334 und offene Frage 15; aktuelle Dashboard-Auth-Dateien. Registrierter Dashboard-Client/Callback, finales lokales Ziel und Abbildung auf die serverseitig erzeugte Auth.js-JWE-Cookie-Sitzung samt Tenant fehlen. |
| Fehler / nächste Schritte | #577 »Website login questions: Turnstile, wrong password, lock, and 2FA«. Im bisherigen HPKE-Vertrag falsches Passwort: 401 `Authentication rejected.`; keine separate Sperr-/2FA-Matrix. Signup, Aktivierung, E-Mail-Bestätigung, Login sind getrennt. #578s TOTP-Schritt ersetzt keinen produktiven Adapter oder vollständigen Faktorvertrag. Keine neuen Fehlercodes erfunden. |

Wallet-Websiteaktionen bleiben bei fehlendem Vertrag `unavailable`.
Kein nativer Passwort-/Signup-Fallback. Bestehende Wallets, Guthaben, Schlüssel,
sichere Sitzungsablagen, Backup und Recovery werden weder ersetzt noch gelöscht.
Browserrückkehr schafft keine Autorität und verknüpft kein Konto automatisch.

## Erforderliche Oberfläche / Betreiberbestätigung

| Endpunkte | Zweck |
| --- | --- |
| `GET /api/v2/app/config` | Bestätigte Version, Register-/Loginziele, Umgebung, Client-/Rückwegkonfiguration, Gültigkeit und Verfügbarkeit noch festzulegen. #578s `oidc.issuer` ist keine Website-URL-Felddefinition. |
| `GET /api/v2/auth/login/hpke-key`, `POST /api/v2/auth/token` plus OPTIONS | Website-HPKE; Exposure abhängig von #572, genaue CORS-Allowlist von #576, Access/Ingress getrennt bestätigen. |
| `POST /api/v2/user/signup`, `POST /api/v2/auth/email-verification/confirm` | Registrierung und ausdrücklich ausgelöste E-Mail-Bestätigung; Signup schafft keine Sitzung. |
| `GET /.well-known/openid-configuration`, `GET /api/v2/auth/oauth/jwks` | #578-Discovery und öffentliche ES256-Schlüssel. |
| `GET/POST /api/v2/auth/authorize`, `POST /api/v2/auth/oauth/token` | #578-Browserformular, Code/PKCE und Refresh; form-encoded Tokenaustausch ohne Clientsecret. Broker-HEAD/OPTIONS bleiben privat. |
| `GET /api/v2/auth/me`, `POST /api/v2/auth/logout`, Account-/Wallet-Routen | Keine automatische Broker-Akzeptanz, Verifikation, Revokation oder öffentliche Freigabe ableiten. |

#578 benennt die Konfiguration: `WALLET_AUTH_BROKER_ENABLED` (exakt `true`,
standardmäßig geschlossen), Issuer, Clientregistry, Access-Audience, montierten
P-256-Keyring, Laufzeiten, vertrauenswürdige Client-IP-Konfiguration und
Turnstile-Sitekey/-Secret. #576 verwendet `PUBLIC_WEB_CORS_ORIGINS` ohne
Cookie-Credentials. Kein pauschaler Auth-Prefixbypass.
`/api/v2/auth/hpke-key` bleibt der getrennte signierte Wallet-Schlüsselvertrag.

Website, POS-App, Compliance, Keycloak und Kubernetes wurden nicht geändert.
Kein Rolloutschalter und keine Turnstile-Pflicht wurden aktiviert oder verschärft.

## Tests und Grenzen

| Prüfung | Ergebnis |
| --- | --- |
| Wallet-Kontoansicht / Browser / Config | 50 bestanden auf `0fee137`; echte Module, synthetische Plattform-/Browser-/Configantworten. Abbruch, Walletwechsel, Sperre, verspätete Antworten, ungültige Config und keine Sessionübernahme aus Rückkehr. |
| Wallet `phase5:verify` | Konfigurations-/Patchprüfungen, Typecheck und Lint bestanden. Anwendungstests: 965 bestanden, vier fehlgeschlagen, einer übersprungen, 970 insgesamt. **Gesamt-Gate nicht grün.** |
| Wallet `contract:test` separat | Solidity 0.8.28 und neun lokale Test-EVM-Tests bestanden; keine Chainaktion. |
| API auf #578 plus Korrekturen | 1.555 relevante Tests bestanden, ein optionaler JS-HPKE-Interop-Test mangels Beispielabhängigkeiten übersprungen; darunter 147 Brokerfälle, Route Boundary, CORS, Turnstile, Public Identity, HPKE, Kundensitzung, Signup und Walletregressionen. |
| API mit aktuellem #576 + vorhandenem Broker + Korrekturen | 1.557 bestanden, ein optionaler JS-HPKE-Skip auf `e84182f`. Neuere Stackänderungen und Brokerkorrekturen zusammen geprüft. |
| API Lint / Format / Inventar | Vorhandene Ruff-Selektoren und Formatprüfung bestanden; 383 Method-/Pfad-Klassifizierungen bestanden. Vulture lokal nicht installiert. |
| Dashboard | Aktuelles main gelesen, kein Produktcode geändert. Frühere Diagnose auf `4596cad`: Typecheck bestanden, Tests an Node/esbuild-`spawn EPERM` blockiert, 323 Lintfehler; Build wegen Junction außerhalb der Turbopack-Wurzel gescheitert. **Kein** aktueller Build-/Testnachweis für `f1dfd0d`. |

Node lokal 24.18.1, Wallet-CI 22.23.1; Python 3.11.7, Ruff lokal 0.16.9,
CI 0.15.6. Vorhandene Abhängigkeiten wiederverwendet; kein frischer Audit behauptet.
API-Brokerprüfungen verwenden **fakeredis mit Lua sowie simulierte Authenticator-/
Turnstile-Antworten**. Mehrere Testrequests teilen diesen Store; das beweist keinen
Mehrinstanzbetrieb mit produktivem Redis. CORS prüft echte WSGI-Erfolgs-/Fehlerantworten
und Preflights. Gemeinsame HTTPS-Consumer-Pins bleiben bei älteren Clients;
kein neuer Wallet-/Dashboard-Broker-End-to-End-Erfolg behauptet.

Drei Wallet-Fehler sind auch auf unverändertem `c604211` reproduzierte
Unterprozessprobleme: `hedera-balance-policy`, `ios-safe-http-gate`,
`ios-safe-http-scheme`. Zusätzlich scheiterte der unveränderte
`pos-contract.test.cjs:64` im Gesamtlauf, bestand aber im einmaligen
Baselinevergleich. Möglicher, nicht abschließend bewiesener Flake: feste Mutation
des letzten Invoicezeichens auf `x` kann unverändert bleiben. Keine Checks
übersprungen oder abgeschwächt. Zusätzliche API-Dependency-Collection war wegen
fehlendem `pypdf` blockiert; kein grüner Security-Audit.

## Konkrete Fragen an Michael / Andi

1. **Michael:** Endgültiger Einstieg Website-HPKE oder API-Brokerseite aus #578?
   Bitte D1–D6 mit den dort als genehmigt genannten Werten eindeutig abgleichen.
2. **Michael:** Exakte AppConfig-Version/Feldnamen für Login-/Registerziele,
   Umgebung, Client/Rückweg/Verfügbarkeit und sichere Zuordnung des privaten
   Registrierungskontexts zum Wallet-Browserversuch?
3. **Andi:** Welche private Compliance-Operation und getestete Backendrevision
   implementieren Authenticator, Aktivierung/E-Mail-Zustand/Sperre, weitere
   Faktoren und `account_roles`?
4. **Andi/Michael:** Welche API-Routen akzeptieren Broker-Sitzungen und wie werden
   Subject/Tenant und vorhandenes AccountBearer-Modell abgebildet? Bindung und
   WalletBearer bleiben getrennte Besitz-/Aktionsnachweise.
5. **Michael/Andi:** Verbindliche Regeln nach verlorenem erfolgreichem Austausch,
   Replay, App-Neustart, Logout/Kontowechsel und für alte gespeicherte Sitzungen?
6. **Michael/Andi:** Dashboard-Clientkennung, Callback, finales lokales Ziel und
   Sitzungs-/Tenantabbildung für D6?
7. **Michael:** Welche Testendpunkte, Origins und genauen öffentlichen Methoden/
   Pfade samt Access-/Ingress-Ausnahmen sind tatsächlich bereitgestellt?

## Gemeinsamer Live-Test nach diesen Voraussetzungen

Fabian protokolliert Gerät/Build, Umgebung und exakte Wallet-/API-/Backend-/
Dashboardrevisionen. Michael bestätigt Config/öffentliche Erreichbarkeit,
Andi Konto-/Sitzungs-/Tenantautorität.

1. Auf echtem Android-Gerät aus bestehender Wallet Registrierung starten:
   bestätigtes Websiteziel, privater Kontext und Browser-/Turnstile-Pfad.
2. Berechtigter Tester bestätigt die **echte E-Mail** ausdrücklich. Das darf
   allein weder anmelden noch eine Wallet verknüpfen.
3. Login im vereinbarten Browserpfad; Client, exakten Redirect, State, Issuer
   und ursprünglichen PKCE-Verifier zusammenhalten. Nur Einmalcode und
   vereinbarte Korrelationswerte im Rückweg, keine langlebigen Tokens.
4. Austausch, vorgesehene API-Sitzungsprüfung und bestehender sicherer Speicher;
   Neustart nach bestätigtem Resume-Vertrag. Bindung nur mit passender Identität
   und getrenntem Besitznachweis, niemals automatisch an anderes Konto.
5. Dashboard über registrierten D6-Callback: serverseitiger Austausch, hostgebundene
   Secure-/HttpOnly-Sitzung, sichere lokale Zielroute, Rollen/Tenant/Eigentümer.
6. Negativfälle: Abbruch/doppelte Klicks, falscher Verifier, ungültiger/abgelaufener
   Code, Wiederholung/parallele Einlösung über zwei API-Instanzen, fremder
   Redirect/State/Client, verlorene Antwort, Kaltstart, Sperre/Entsperren, Logout,
   Kontowechsel/verspätete Antwort, ungültige/fehlende AppConfig, geschlossenes
   Feature/fehlender Adapter und vereinbarte E-Mail-/Konto-/weitere Auth-Schritte.
7. Erfolg **und** Fehler über echte CORS-/Ingresskette prüfen; iOS ebenso.
   Bestehende Wallets, Guthabenansicht, Schlüssel/Backup/Recovery und bisherige
   Dashboardzugriffe getrennt als Regression prüfen. Keine Codes, Verifier,
   Tokens, Passwörter oder vollständigen Rückkehr-URLs loggen.

AGB und Google-Review-Zugänge sind laut Fabian vorhanden.
Der Turnstile-Schalter bleibt bis zum gemeinsamen Test und abgestimmter Aktivierung aus.

## Übergabegrenze

GitHub-Reads funktionieren. Die erste Schreibaktion `create_tree` für die
#578-Aktualisierung wurde von der Laufzeit abgelehnt:
»MCP tool call requires approval, but approval policy is never«.
Keine andere Schreibschnittstelle wurde als Umgehung benutzt.
**Remote-PRs und Remote-CI wurden nicht aktualisiert.**

Lokale Patches und PR-Beschreibungen sind vorbereitet. Wallet weiter in #49;
API-Korrekturen in #578 nach Abgleich/Rebase auf #576. Keine zweite Broker-PR,
kein vorsorglicher Dashboard-PR. #578 liefert in der geprüften REST-Antwort
kein natives Stackobjekt; die Branchabhängigkeiten müssen ausdrücklich erhalten bleiben.

Nächster Schritt: Michael/Andi klären bzw. liefern Punkte 1–6; vorbereitete
Korrekturen mit verfügbarer Schreibfreigabe in #49/#578 übernehmen und tatsächliche
CI prüfen. Dann die bestätigten Clientadapter vervollständigen und den gemeinsamen
Geräte-/E-Mail-Test ausführen.
