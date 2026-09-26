**Design- und Usability-Audit · Opago Wallet · 24. September 2026**

**Historischer Stand – inzwischen erneut geprüft:** Die untenstehenden Befunde beziehen sich auf den früheren Arbeitsstand. Der [aktuelle Abgleich aller 40 Befunde vom 24. September, 22:37 Uhr MESZ](<C:/dev/opago-wallet/docs/design-usability-recheck-2026-09-24.md>) unterscheidet behobene, teilweise behobene, offene und durch den deaktivierten Kaufablauf nicht mehr anwendbare Punkte und enthält einen neuen Statusfehler. Für die aktuelle Bewertung diesen Abgleich verwenden.

**Urteil:** Die App besitzt eine gute technische Grundlage für eine einfache Bitcoin-Wallet. Der aktuelle Nutzerfluss erreicht das gewünschte Niveau jedoch noch nicht: Kaufen endet nicht zuverlässig in einem verständlichen verfügbaren Guthaben, Zahlungszustände sind teilweise irreführend, und mehrere Bedienhandlungen verwerfen bereits eingegebene Daten. Ein visueller Feinschliff allein würde diese Probleme nicht lösen.

Das angestrebte Produkt ist eine Bitcoin-Wallet mit der visuellen Ruhe einer Fintech-App und sehr wenigen Entscheidungen pro Vorgang. Die wichtigste Designaufgabe ist deshalb, technische Zustände in verständliche nächste Schritte zu übersetzen.

**Umfang und Evidenz.** Geprüft wurden alle App-Routen, die zugehörigen Oberflächen und die relevanten Zahlungs-, Guthaben-, Kurs-, Authentifizierungs-, Backup-, Wiederherstellungs-, Theme- und Übersetzungsabläufe. Das Inventar umfasst 13 Routendateien, 40 Komponenten, 12 Hooks sowie Styles und Konstanten. Zahlungs- und Infrastrukturcode wurde insbesondere auf seine sichtbaren Auswirkungen untersucht. Dies ist kein vollständiges Sicherheits- oder Smart-Contract-Audit. Grundlage ist der aktuelle Arbeitsstand einschließlich der bereits vorhandenen uncommitteten Änderungen.

Die Prüfung kombiniert Codeanalyse, kleine reproduzierbare Logik- und Kontrastprüfungen sowie 69 bestehende, erfolgreich ausgeführte Tests. Es wurde kein aktueller nativer Build auf einem Gerät visuell abgenommen und kein echter Kauf oder Geldtransfer ausgelöst. Vorhandene ältere Screenshots weichen vom aktuellen Code ab und wurden deshalb nicht als Beleg für das aktuelle Erscheinungsbild verwendet. Die Liste enthält sämtliche dabei identifizierten relevanten Probleme; sie kann weitere Probleme aus echten Nutzertests nicht ausschließen.

**Priorität und Lesart.** P1 bedeutet: vor einer breiten Freigabe an unerfahrene Nutzer beheben. P2 bedeutet: für die angestrebte einfache Bedienung wesentlich. P3 bedeutet: nach den Kernabläufen verbessern. „Code“ bezeichnet nachvollziehbares implementiertes Verhalten; „Probe“ einen zusätzlich lokal reproduzierten Befund; „Design“ eine begründete Bewertung gegen das Produktziel. Native Prüfpunkte am Ende sind ausdrücklich noch keine nachgewiesenen Layoutfehler.

**Die sechs wichtigsten Befunde**

| ID | Priorität | Problem | Auswirkung |
|---|---|---|---|
| 01 | P1 | Wallet-Verbindung kann nach einem Startfehler nicht gezielt neu aufgebaut werden | Kaufen, Senden oder Empfangen bleiben ohne wirksamen nächsten Schritt hängen |
| 02 | P1 | Zusätzliche Freigabe und Gebühr nach dem Kauf werden im Kaufablauf nicht ausreichend erklärt | Bezahlter Kauf wird mit verfügbarem Guthaben verwechselt |
| 03 | P1 | Erforderliche Einzahlungsfreigabe ist hinter einem allgemeinen Hinweis und mehreren Ansichten versteckt | Geld scheint angekommen, kann aber nicht verwendet werden |
| 04 | P1 | Bereits übertragene Bitcoin-Zahlungen heißen in der Historie „Status unbekannt“ | Normaler Bestätigungsprozess wirkt wie ein Fehler |
| 05 | P1 | iOS-Entsperrung und Autorisierung akzeptieren unterschiedliche Geräteschutzverfahren | Erfolgreich entsperrte Nutzer können an Kernaktionen scheitern |
| 06 | P1 | Heller Modus enthält konkret unleserliche Farbkombinationen | Auswahlzustände und Teile der Marke verschwinden |

**Was erhalten bleiben sollte.** Die automatische Erkennung von Lightning- und Bitcoin-Zielen, die Trennung zwischen verfügbarem und noch eingehendem Guthaben, die Gebührenprüfung vor dem Senden, die Überwachung unklarer Zahlungen und die Sicherungen gegen doppelte Ausführung sind gute Grundlagen. Auch Geräteautorisierung, geschützte Anzeige der Wiederherstellungswörter, vorhandene Screenreader-Beschriftungen und reduzierte Animationen im Zahlungsfortschritt sind sinnvoll. Vereinfachungen müssen auf diesen Schutzmechanismen aufbauen.

**01 · P1 · Nach Verbindungsfehlern fehlt eine wirksame Wiederaufnahme. — Code**

Der lokale Wallet-Zustand wird bereits auf `walletReady=true` gesetzt, bevor Spark verbunden ist. Nach drei fehlgeschlagenen Verbindungsversuchen bleiben `sparkWallet=null` und ein Fehler zurück. `loadOrGenerateWallet()` kehrt bei `walletReady` sofort zurück. Die Guthabenaktualisierung stellt diese Verbindung nicht neu her. Ein wieder verfügbares Netz allein bietet damit keinen klaren Weg aus dem Fehler; Kaufen oder Empfangen können weiter auf die Wallet warten.

**Änderung:** Eigenen Verbindungszustand und „Erneut verbinden“ anbieten. Die Aktion muss tatsächlich den Dienst erneut initialisieren, ohne neue Schlüssel oder eine neue Wallet zu erzeugen. In allen vier Kernabläufen dieselbe verständliche Störung anzeigen.

**Abnahme:** App ohne Netz öffnen, Verbindungsversuche scheitern lassen, Netz wiederherstellen, einmal erneut verbinden; Guthaben und Kernaktionen funktionieren ohne App-Neustart. Belege: [Wallet-Initialisierung](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:245>), [Fehlerpfad und früher Rücksprung](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:268>), [Kaufziel](<C:/dev/opago-wallet/app/buy.tsx:61>).

**02 · P1 · Der Kauf erklärt den Weg zum verfügbaren Bitcoin-Guthaben nicht vollständig. — Code**

MoonPay zahlt auf eine Bitcoin-Einzahlungsadresse. Diese Einzahlung benötigt anschließend eine Bestätigung und eine separate Freigabe mit zusätzlicher, von der Einzahlung abgezogener Gebühr. Die Kaufseite erklärt den Drittanbieter und dessen Preisprüfung, aber nicht diesen zusätzlichen Wallet-Schritt. Der Rückkehrhinweis verspricht eine Guthabenaktualisierung nach Bestätigung der Einzahlung. Die ausführliche Erklärung zu Freigabe, Gebühr und möglicherweise unwirtschaftlichen Kleinstbeträgen steht erst in einer tieferen Einzahlungsansicht.

**Änderung:** Vor dem Öffnen des Anbieters kurz erklären, was gekauft wird, wann es verfügbar ist und welche zusätzliche Wallet-Gebühr anfallen kann. Wenn die genaue Gebühr vorab technisch nicht bestimmbar ist, diese Grenze ausdrücklich benennen. Nach Rückkehr einen zusammenhängenden Kauf- und Einzahlungsfortschritt anzeigen. Eine automatische Freigabe wäre eine gesonderte technische und Autorisierungsentscheidung, kein bloßes UI-Refactoring.

**Abnahme:** Ein Erstnutzer kann vor dem Kauf erklären, warum Kaufbetrag und verfügbares Guthaben abweichen können und ob er später noch etwas bestätigen muss. Belege: [Kaufaufklärung](<C:/dev/opago-wallet/app/buy.tsx:146>), [Rückkehrhinweis](<C:/dev/opago-wallet/app/(tabs)/index.tsx:567>), [Einzahlungsgebühr](<C:/dev/opago-wallet/components/bitcoin/deposit-screen.tsx:73>), [Gutschrift nach Freigabe](<C:/dev/opago-wallet/lib/bitcoin/deposits.ts:128>).

**03 · P1 · Notwendige Einzahlungsaktionen werden nicht direkt erreichbar gemacht. — Code**

Home fasst alle nicht abgeschlossenen Bitcoin-Vorgänge als „Bitcoin is on its way“ zusammen, auch ausgehende Zahlungen und Einzahlungen mit `action_required`. Der Hinweis öffnet lediglich Empfangen. Dort ist zunächst Lightning ausgewählt; die Einzahlungsübersicht ist erst über die Bitcoin-Auswahl und „Incoming Bitcoin“ erreichbar. Der Hinweis benennt weder den konkreten Handlungsbedarf noch führt er unmittelbar zur nötigen Freigabe.

**Änderung:** Pro Vorgang eine passende Aktionskarte: etwa „Einzahlung bereit – Gebühr prüfen“ oder „Bitcoin gesendet – wartet auf Bestätigung“. Direkt den betroffenen Vorgang öffnen. Die technische Bezeichnung „Claim“ durch eine verständliche Handlung mit klarer Kostenanzeige ersetzen.

**Abnahme:** Von Home zur Freigabeprüfung maximal ein Tap; eine ausgehende Zahlung führt zu ihren Zahlungsdetails. Belege: [Home-Hinweis](<C:/dev/opago-wallet/app/(tabs)/index.tsx:604>), [Empfangsauswahl](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:734>), [Einstieg in Einzahlungen](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:861>).

**04 · P1 · Zahlungszustände werden sachlich falsch zusammengefasst. — Probe**

`paymentHistoryStatus()` bildet ausgehende SAT-Vorgänge mit `checking`, `pending` und `broadcast` gleichermaßen auf „Status unknown“ ab. Ein bereits ins Bitcoin-Netz übertragener Vorgang hat aber einen bekannten Zwischenstand. Die lokale Probe bestätigt diese Zuordnung. Gleichzeitig verwenden Ergebnisansicht, Home und Einzahlungsansicht unterschiedliche Begriffe für verwandte Zustände.

**Änderung:** Gemeinsame, beweisbasierte Statusübersetzung: „Wird geprüft“, „Gesendet – wartet auf Bestätigung“, „Abgeschlossen“, „Aktion erforderlich“ und ausschließlich bei tatsächlich unklarem Ergebnis „Ergebnis noch unklar“. Nicht verfügbare Verbindungsdaten als zusätzliche Information behandeln.

**Abnahme:** Derselbe Vorgang trägt überall denselben Status; `broadcast` erscheint nie allein als unbekannt. Belege: [Statusübersetzung](<C:/dev/opago-wallet/lib/wallet-display.ts:51>), [Historienzeile](<C:/dev/opago-wallet/app/(tabs)/index.tsx:658>), [Prüfergebnisse](<C:/dev/opago-wallet/.codex-local-evidence/design-usability-audit/checks.json>).

**05 · P1 · Geräteschutz-Anforderungen sind auf iOS nicht konsistent. — Code**

Zum Entsperren ist der Gerätecode zugelassen; `authorizeWalletAction()` erlaubt diesen Fallback dagegen nur auf Android. Auf iOS verlangen Erstellen, Wiederherstellen, Backup- und Zahlungsaktionen starke Biometrie. Nutzer ohne eingerichtete oder nutzbare Biometrie können daher an diesen Aktionen scheitern, obwohl eine Entsperrung per Gerätecode möglich ist. Teilweise erfahren sie das erst nach längerer Eingabe.

**Änderung:** Die unterstützte Gerätepolitik ausdrücklich festlegen, früh prüfen und konsistent erklären. Falls ein Gerätecode für sensible Aktionen zugelassen werden soll, muss der Autorisierungs- und Hintergrundschutz dafür vollständig unterstützt und geprüft sein. Andernfalls früh einen verständlichen Einrichtungsschritt anbieten.

**Abnahme:** iOS mit Gerätecode ohne Biometrie, Biometrie-Sperre sowie Android mit unterstütztem und nicht unterstütztem PIN-Fallback liefern vor längeren Abläufen klare, zutreffende Handlungsmöglichkeiten. Belege: [Entsperrung](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:169>), [Aktionsautorisierung](<C:/dev/opago-wallet/lib/device-authentication.ts:79>), [Voraussetzungen und Fallback](<C:/dev/opago-wallet/lib/device-authentication.ts:35>).

**06 · P1 · Der helle Modus ist in Teilen unleserlich. — Probe**

Die automatische Farbumrechnung verändert Styles, aber nicht alle Inline-Farben und SVG-Füllungen. Daraus entstehen konkrete Kombinationen: weißes Welcome-Wordmark auf weißem Hintergrund (1:1), gelber Text „Show all coins“ auf hellem Hintergrund (1,67:1) und gelbe ausgewählte SAT-Beschriftung auf hellem Gelb (1,69:1). Die Kontrastwerte wurden aus den aktuellen Farben und der tatsächlichen Umrechnung berechnet. Das Logo ist von WCAG-Textkontrastvorgaben ausgenommen, bleibt hier aber visuell unsichtbar.

**Änderung:** Explizite semantische Farben für beide Modi definieren; Text, Icons, Auswahlzustände und Markenassets gemeinsam umstellen. Keine heuristische Umfärbung beliebiger Hexwerte als Grundlage des Themes.

**Abnahme:** Sämtliche aktiven Screens in beiden Modi prüfen; normaler Text mindestens 4,5:1 als Designmaßstab, große Schrift mindestens 3:1. Belege: [Farbumrechnung](<C:/dev/opago-wallet/lib/theme-styles.ts:1>), [Wordmark](<C:/dev/opago-wallet/app/(auth)/login.tsx:92>), [gelber Empfangstext](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:770>), [Auswahltext](<C:/dev/opago-wallet/components/bitcoin/amount-sheet.tsx:41>). Maßstab: [W3C-Kontrastdefinition](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum).

**07 · P2 · Zwischengespeicherte Guthaben und alte Kurse sind nicht durchgehend erkennbar. — Code**

Home kann bereits einen gespeicherten Guthabenstand zeigen, während die Live-Abfrage noch läuft, ohne diesen immer als gespeicherten Stand zu kennzeichnen. Der Kurshook behält nach einem Fehler den bisherigen Kurs; Home prüft dessen Alter nicht so wie `BitcoinMoney` und die Zahlungsprüfung. Dadurch kann ein alter Eurogegenwert weiterhin aktuell wirken.

**Änderung:** Aktualität als gemeinsame Eigenschaft aller Geldanzeigen behandeln. „Wird aktualisiert“, „Stand …“ und „Euro-Schätzung nicht verfügbar“ unterscheiden. Der bestätigte SAT-Betrag bleibt die Grundlage; ein ausgefallener Kursdienst sollte die Wallet-Bedienung nicht blockieren. Belege: [Home-Geldanzeige](<C:/dev/opago-wallet/app/(tabs)/index.tsx:136>), [Hinweislogik](<C:/dev/opago-wallet/app/(tabs)/index.tsx:458>), [Kursfehler](<C:/dev/opago-wallet/hooks/useExchangeRates.ts:64>), [abweichende Frischeprüfung](<C:/dev/opago-wallet/components/bitcoin/payment-ui.tsx:14>).

**08 · P2 · Kaufen führt bei Nichtverfügbarkeit und Ladefehlern in Sackgassen. — Code**

Home bietet Kaufen unabhängig vom Dienstzustand an und hebt es bei leerer Wallet besonders hervor. Die Kaufseite lädt Konfiguration und Zieladresse, bietet nach Fehlern aber keinen gezielten Wiederholungsbutton. Ein Text mit „try again“ ersetzt keine ausführbare Wiederholung. Bei nicht bereiter Wallet kann die Zielermittlung weiter im Ladezustand bleiben.

**Änderung:** Laden, vorübergehende Störung, nicht unterstützte Umgebung und fehlende Einrichtung unterscheiden. Wiederholen muss jeweils die fehlgeschlagene Abfrage auslösen. Falls Kaufen tatsächlich nicht angeboten werden kann, bereits am Einstieg verständlich damit umgehen. Die Verfügbarkeit des produktiven MoonPay-Backends wurde hier nicht getestet. Belege: [Kaufkonfiguration](<C:/dev/opago-wallet/app/buy.tsx:51>), [Zielermittlung](<C:/dev/opago-wallet/app/buy.tsx:61>), [Fehlerdarstellung](<C:/dev/opago-wallet/app/buy.tsx:161>).

**09 · P2 · Nach dem Kauf fehlt eine dauerhafte, nachvollziehbare Fortsetzung. — Code**

Die App speichert für die Browserrückkehr einen zeitlich begrenzten Marker. Dieser ist ausdrücklich kein Kaufnachweis und enthält keinen aufrufbaren Bestellstatus. Nach Rückkehr erscheint ein allgemeiner, schließbarer Hinweis; Abbruch, laufender Kauf und abgeschlossene Anbieterzahlung sind daraus nicht unterscheidbar.

**Änderung:** Soweit der Anbieter belastbare Daten liefert, Bestellung und Einzahlung zusammenführen. Mindestens einen wieder erreichbaren „Kauf beim Anbieter prüfen“-Einstieg mit Erklärung anbieten. Aus der Browserrückkehr niemals einen Zahlungserfolg ableiten. Belege: [Rückkehrmarker](<C:/dev/opago-wallet/lib/moonpay-return-native.ts:3>), [Checkout-Rückkehr](<C:/dev/opago-wallet/components/buy/moonpay-checkout.tsx:59>), [Home-Banner](<C:/dev/opago-wallet/app/(tabs)/index.tsx:567>).

**10 · P2 · Der Kauf wirkt wie ein Kryptoformular statt wie „Bitcoin kaufen“. — Design / Code**

„Buy crypto“, Asset-Auswahl, optionale HBAR-Auswahl, technische Zieladresse und Netzwerkbezeichnung verlangen zusätzliche Einordnung. Die Betragseingabe akzeptiert nur positive ganze Eurobeträge, bietet aber keine sichtbaren, vom Anbieter bestätigten Grenzen. Sehr kleine oder sehr große Werte können erst im nächsten System zurückgewiesen werden.

**Änderung:** Bitcoin vorauswählen und den Bildschirm „Bitcoin kaufen“ nennen. Betrag, Anbieter und verständliche Kosten-/Verfügbarkeitsinformation bilden die Hauptansicht. Die eigene Empfangsadresse gehört in Details. Anbietergrenzen vor dem Übergang prüfen, sobald belastbar verfügbar; keine Grenzen erfinden. HBAR nur nach bewusster Aktivierung des Zusatzbereichs zeigen. Belege: [Kaufformular](<C:/dev/opago-wallet/app/buy.tsx:111>), [Betragsvalidierung](<C:/dev/opago-wallet/lib/moonpay.ts:71>).

**11 · P2 · Beim Sendebetrag fehlen verfügbare Mittel und Empfängergrenzen. — Code**

Der Bitcoin-Betragsbildschirm erhält weder verfügbares Guthaben noch minimale/maximale LNURL-Beträge. Die entsprechende Grenzanzeige liegt im darunterliegenden Formularpfad, der durch den frühen Rücksprung in das Amount-Sheet umgangen wird. Nutzer müssen einen zulässigen Betrag erraten und erfahren Probleme erst beim Fortfahren. Eine verwendbare „Alles senden“-Funktion fehlt ebenfalls.

**Änderung:** Verfügbaren Betrag und relevante Empfängergrenzen direkt bei der Eingabe anzeigen. „Max“ nur anbieten, wenn Gebühren und Reservierungen korrekt berücksichtigt werden können. Fehler direkt am Betrag statt ausschließlich im Alert erklären. Belege: [früher Formularrücksprung](<C:/dev/opago-wallet/components/send/payment-form.tsx:100>), [umgangene Grenzanzeige](<C:/dev/opago-wallet/components/send/payment-form.tsx:138>), [Amount-Sheet-Props](<C:/dev/opago-wallet/components/bitcoin/amount-sheet.tsx:13>).

**12 · P2 · Die Einheit wechselt zwischen Abläufen; Antippen kann Beträge löschen. — Code**

Home stellt Euro in den Vordergrund, Senden beginnt mit SAT, Empfangen mit EUR und manche Ergebnisansichten zeigen EUR, BTC und SAT gleichzeitig. Gebühren und Maximalgesamtbetrag in der Zahlungsprüfung erscheinen nur in SAT. Sowohl Senden als auch Empfangen löschen die Eingabe beim Tippen auf eine Einheit – sogar wenn diese schon ausgewählt ist.

**Änderung:** Eine konsistente, gemerkte Darstellung mit einer primären und höchstens einer sekundären Einheit verwenden. Auf die bereits ausgewählte Einheit zu tippen muss wirkungslos sein. Beim tatsächlichen Wechsel den wirtschaftlichen Betrag kontrolliert erhalten oder den Wechsel ausdrücklich bestätigen lassen; Umrechnung und Rundung transparent machen. Gebühren und Gesamtbetrag in derselben Darstellungslogik zeigen. Belege: [Sendewährung](<C:/dev/opago-wallet/app/(tabs)/send.tsx:140>), [Löschen im Sendeflow](<C:/dev/opago-wallet/components/bitcoin/amount-sheet.tsx:37>), [Löschen beim Empfangen](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:779>), [Mehrfachdarstellung](<C:/dev/opago-wallet/components/bitcoin/payment-ui.tsx:14>).

**13 · P2 · Zurück und Abbrechen verwerfen zu viel. — Code**

Aus der Zahlungsprüfung führt Abbrechen zum vollständigen Reset einschließlich Empfänger und Betrag. Auch aus der Betragseingabe führt der Rückweg über den Scanner-Reset. Eine kleine Korrektur wird dadurch zum Neustart des Vorgangs. Beim Abbruch der Geräteautorisierung verhält sich Bitcoin zudem anders als Lightning: Der vorbereitete Bitcoin-Vorgang wird verworfen.

**Änderung:** Schritt zurück, Betrag bearbeiten, Empfänger ändern und gesamten Vorgang abbrechen getrennt modellieren. Sichere Eingaben innerhalb desselben Vorgangs erhalten; veraltete Gebührenangebote bei Änderungen gezielt ungültig machen. Abgelehnte Geräteautorisierung soll grundsätzlich zur passenden Prüfung zurückführen, sofern der Vorgang sicher noch nicht ausgeführt wurde. Belege: [Reset](<C:/dev/opago-wallet/app/(tabs)/send.tsx:572>), [Bitcoin-Prüfung](<C:/dev/opago-wallet/app/(tabs)/send.tsx:656>), [Autorisierungsfehler](<C:/dev/opago-wallet/app/(tabs)/send.tsx:436>), [Betragsrückweg](<C:/dev/opago-wallet/components/send/payment-form.tsx:105>).

**14 · P2 · Gebührenvorbereitung, zweite Autorisierung und Ablaufzeit sind schwer verständlich. — Code / Design**

On-chain erfordert zunächst „Prepare fee offer“ mit Gerätefreigabe und später eine zweite Autorisierung zum Senden. Diese erste Freigabe hat einen realen Grund: Das verwendete SDK kann bereits beim Erstellen des Angebots intern signieren. Gleichzeitig steht die Ablaufzeit nur in aufklappbaren Details; ein abgelaufenes Angebot bleibt im UI zunächst mit einem Sendebutton sichtbar und wird erst später zurückgewiesen.

**Änderung:** Die beiden Schritte knapp und eindeutig erklären, oder die technische Vorbereitung so ändern, dass eine sichere einzige Autorisierung möglich wird. Die Schutzprüfung nicht einfach entfernen. Ablauf sichtbar behandeln und „Angebot erneuern“ anbieten, bevor der Nutzer erneut autorisiert. Belege: [erste Autorisierung](<C:/dev/opago-wallet/app/(tabs)/send.tsx:374>), [SDK-Anforderung](<C:/dev/opago-wallet/lib/bitcoin/onchain.ts:63>), [versteckte Ablaufzeit und Sendebutton](<C:/dev/opago-wallet/components/bitcoin/payment-ui.tsx:35>), [Ablaufprüfung bei Ausführung](<C:/dev/opago-wallet/lib/bitcoin/onchain.ts:107>).

**15 · P2 · Unklare Zahlungen benötigen eine eigene Ergebnisansicht. — Code**

Ein noch nicht aufgelöstes Lightning-Ergebnis wird über einen Fehlerpfad mit Alert und Fehlerhaptik behandelt. Danach wird die Prüfungsansicht geschlossen; der Nutzer sieht wieder den Eingabefluss. Die eigentliche Nachverfolgung liegt auf Home. Bei Bitcoin blockiert ein noch nicht finaler ausgehender Vorgang weitere Vorbereitungen mit einem allgemeinen Hinweis. Diese Schutzmechanismen sind sinnvoll, aber die Oberfläche erklärt nicht ausreichend, welcher Vorgang blockiert und was als Nächstes geschieht.

**Änderung:** Dauerhafte Ergebnisansicht „Ergebnis wird geprüft“ mit Betrag, Empfänger, letztem Prüfzeitpunkt und Zugang zur Überwachung. Bereits eingereichte Zahlungen nicht als gewöhnlichen wiederholbaren Formularfehler darstellen. Sperren an den konkreten offenen Vorgang binden und sichtbar erklären; Wiederholung nur bei eindeutig nachgewiesener Nichtausführung erlauben. Belege: [Lightning-Fehlerpfad](<C:/dev/opago-wallet/app/(tabs)/send.tsx:496>), [Bitcoin-Sperre](<C:/dev/opago-wallet/lib/bitcoin/onchain.ts:72>), [Home-Nachverfolgung](<C:/dev/opago-wallet/app/(tabs)/index.tsx:596>).

**16 · P2 · Die Empfängerprüfung hilft Anfängern zu wenig. — Design / Code**

Bei Bitcoin steht eine gekürzte Adresse im Vordergrund; bei Lightning oft nur „Lightning payment request“ oder ein vom Absender gelieferter Text. Der Hinweis, dass diese Bezeichnung keine bestätigte Identität ist, erscheint erst in den aufgeklappten Details. Eine vollständige Invoice ist zwar prüfbar, aber für Menschen kaum lesbar.

**Änderung:** Erkannte Lightning-Adresse beziehungsweise Domain, soweit tatsächlich verfügbar, Beschreibung und technische Zielinformation klar unterscheiden. Herkunft und Verlässlichkeit einer Bezeichnung direkt am Empfänger kenntlich machen. Vollständige Adresse und Anfrage zugänglich halten. Der Abschlussbutton sollte den zu sendenden Betrag wiederholen. Beleg: [Empfänger- und Detaildarstellung](<C:/dev/opago-wallet/components/bitcoin/payment-ui.tsx:35>).

**17 · P2 · Das eigene Zahlenfeld verzichtet auf wichtige Eingabefunktionen. — Code / Design**

Der Sendebetrag wird als `Text` mit selbst gebauten Zahlentasten dargestellt. Die Tasten sind bereits beschriftet, aber es gibt kein normales editierbares Feld für Cursorbewegung, Auswahl, Zahleneinfügen oder Hardwaretastatur. Lange Eingaben werden automatisch verkleinert. Damit wird eine einfache Geldangabe für manche Eingabemethoden unnötig umständlich.

**Änderung:** Entweder ein geeignetes natives Zahlenfeld verwenden oder die vollständige Bearbeitungs- und Accessibility-Semantik des eigenen Felds ergänzen. Nicht nur die Touch-Ziffern testen, sondern auch VoiceOver, TalkBack und Hardwaretastatur. Beleg: [Zahlenanzeige und Keypad](<C:/dev/opago-wallet/components/bitcoin/amount-sheet.tsx:29>).

**18 · P2 · Externe Bitcoin- und Lightning-Zahlungslinks führen nicht in den Zahlungsablauf. — Probe**

Der Native-Intent-Filter akzeptiert nur den eigenen Hedera-Checkout-Link. `bitcoin:`, `lightning:` und ein eigener Sendelink fallen auf `/` zurück. Zusätzlich registriert die App-Konfiguration nur das eigene Schema. Intern können entsprechende Zahlungsanfragen erkannt werden, aus anderen Apps heraus fehlt aber der direkte Einstieg.

**Änderung:** Unterstützte Zahlungsschemata und gegebenenfalls verifizierte App-Links gezielt registrieren und über dieselbe validierte Erkennung in eine Vorschau führen. Externe Links dürfen weiterhin niemals selbst autorisieren oder senden. Belege: [Native-Intent-Filter](<C:/dev/opago-wallet/lib/native-intent.ts:5>), [App-Konfiguration](<C:/dev/opago-wallet/app.json>), [Probe](<C:/dev/opago-wallet/.codex-local-evidence/design-usability-audit/checks.json>).

**19 · P2 · Geteilte Lightning-Anfragen laufen ohne sichtbare Erklärung ab. — Code**

Die standardmäßig erzeugte Lightning-Invoice ist zehn Minuten gültig. Nach Ablauf kann die App eine neue erzeugen, während eine bereits kopierte oder geteilte Anfrage beim Empfänger unverändert bleibt. Die Hauptansicht und der geteilte Text erklären die Gültigkeit nicht ausreichend. Eine wiederverwendbare Lightning-Adresse beziehungsweise LNURL ist im aktuellen Empfangsablauf nicht vorhanden.

**Änderung:** Bei zeitlich begrenzten Anfragen eine klare Gültigkeitsanzeige, „Neue Anfrage erstellen“ und einen Hinweis beim Teilen anbieten. Eine dauerhafte Empfangsadresse nur dann als Standard einführen, wenn die Architektur sie tatsächlich unterstützt. Das ist ein Produkt-/Backendthema, keine bloße QR-Code-Änderung. Belege: [Invoice-Laufzeit](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:397>), [Ablauf und Neuerstellung](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:510>), [Teilen](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:855>).

**20 · P2 · Eine Empfangsanfrage verändert sich zu beiläufig. — Code / Design**

Nach Betragseingaben wird nach 500 ms automatisch eine neue Anfrage erzeugt. Bei Eurobeträgen kann auch ein aktualisierter Kurs die zugehörige SAT-Menge und damit den QR-Code verändern. Der Betragseditor besitzt keinen klaren Abschluss „Übernehmen“. Empfangseingabe und gerundete Euroanzeige erlauben zudem unterschiedliche Genauigkeit; eine präzisere Eingabe kann in der späteren Anzeige auf zwei Nachkommastellen verkürzt werden.

**Änderung:** Betrag bearbeiten und Anfrage veröffentlichen als klaren Schritt behandeln. SAT-Betrag und angezeigten Eurogegenwert beim Erstellen festhalten. Bestehende, bereits geteilte Anfragen nicht aufgrund einer reinen Kursaktualisierung austauschen. Für Euro dieselbe Präzision bei Eingabe und Anzeige verwenden. Belege: [automatische Neuerstellung](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:546>), [Betragseditor](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:775>), [Betragsanzeige](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:697>).

**21 · P2 · Beim Empfangen sind Netzwerk und Adresse zu versteckt. — Code / Design**

Der erste Empfangsbildschirm zeigt Lightning. Die Bitcoin-Auswahl liegt hinter „Via“, wo zusätzlich der Einstieg zu weiteren Coins erscheint. In der Hauptansicht der Bitcoin-Auswahl stehen QR-Code und Kopieren/Teilen, aber nicht die lesbare Zieladresse. Die vollständige Adresse ist erst in einer weiteren Einzahlungsansicht sichtbar.

**Änderung:** Lightning und Bitcoin als zwei klar benannte Empfangswege mit einem kurzen Hinweis zur Auswahl in der sendenden App zeigen. Die aktive Bitcoin-Adresse direkt unter dem QR-Code lesbar und kopierbar machen. Zusatzcoins aus dem normalen Bitcoin-Empfangsablauf heraushalten. Belege: [Netzwerkauswahl](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:734>), [QR und Aktionen](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:808>), [separate Adressansicht](<C:/dev/opago-wallet/components/bitcoin/deposit-screen.tsx:83>).

**22 · P2 · Der Empfangserfolg verschwindet nach drei Sekunden. — Code**

Eine erkannte Lightning-Zahlung führt nach drei Sekunden automatisch zurück zu Home. Die Erfolgsansicht hat eigene Aktionen, aber zum Lesen, Vorzeigen oder weiteren Bedienen bleibt kaum Zeit. Der Sendeflow wartet dagegen auf ein ausdrückliches „Fertig“.

**Änderung:** Erfolg stehen lassen, bis der Nutzer „Fertig“ oder „Weitere Zahlung empfangen“ auswählt. Betrag und Status für Screenreader ankündigen. Beleg: [automatische Rückkehr](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:500>).

**23 · P2 · Der Empfangs-QR kann beim bloßen Warten von der Wallet-Sperre verdrängt werden. — Code**

Die Wallet sperrt nach zwei Minuten ohne registrierte Bedienung. Das Vorzeigen eines QR-Codes erzeugt keine Touch-Aktivität, obwohl der Bildschirm gerade aktiv verwendet wird. Die Invoice kann noch gültig sein, während die App bereits die Sperransicht zeigt. Eine besondere Behandlung dieses öffentlichen Empfangsbildschirms ist nicht erkennbar.

**Änderung:** Bewusst entscheiden, ob ein bereits erzeugter öffentlicher Empfangscode auch im gesperrten Zustand sichtbar bleiben darf oder die App beim aktiven Vorzeigen anders behandelt wird. Private Daten und Zahlungsautorisierung bleiben geschützt. Dieses Verhalten zusammen mit dem Betriebssystem-Bildschirmtimeout auf Geräten prüfen. Belege: [Inaktivitätslimit](<C:/dev/opago-wallet/lib/wallet-session.ts:1>), [Sperransicht](<C:/dev/opago-wallet/components/security/wallet-gate.tsx:33>), [Empfangs-QR](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:808>).

**24 · P2 · Statusprüfungen und Fehler geben zu wenig verwertbare Rückmeldung. — Code**

„Check status“ zeigt in den Bitcoin-Ansichten keinen klaren eigenen Fortschritt. Home nutzt die Vorgänge aus `useBitcoinOperations`, stellt dessen Fehler aber nicht entsprechend dar. Die Einzahlungsansicht fasst verschiedene Fehler – beispielsweise veränderte Gebühr oder fehlgeschlagene Autorisierung – in derselben allgemeinen Fehlermeldung zusammen. Kopieren erzeugt an einer Stelle einen blockierenden Alert, an einer anderen keine sichtbare Bestätigung.

**Änderung:** Einheitliche Rückmeldungen für Aktualisieren, Offlinezustand, Gebührenänderung, Abbruch und tatsächlichen Fehler. Letzten erfolgreichen Prüfzeitpunkt nennen. Für Kopieren eine kurze, auch assistiv wahrnehmbare Bestätigung verwenden. Belege: [Vorgangshook](<C:/dev/opago-wallet/hooks/useBitcoinOperations.ts:47>), [Home-Verwendung](<C:/dev/opago-wallet/app/(tabs)/index.tsx:336>), [pauschaler Einzahlungsfehler](<C:/dev/opago-wallet/components/bitcoin/deposit-screen.tsx:33>), [Statusbutton](<C:/dev/opago-wallet/components/bitcoin/deposit-screen.tsx:103>).

**25 · P2 · Die Hauptaktionen wechseln ihre Position. — Code**

Bei leerer Wallet steht Senden links und Kaufen in der Mitte. Mit Guthaben wird die Reihenfolge umgedreht. Schon ein eingehender Betrag oder die Aktualisierung eines zuvor gespeicherten Stands kann deshalb die vertrauten Positionen verändern.

**Änderung:** Kaufen, Senden und Empfangen behalten immer dieselbe Reihenfolge. Bei leerer Wallet darf Kaufen stärker betont werden, ohne die übrigen Aktionen zu verschieben. Beleg: [bedingte Aktionsreihenfolge](<C:/dev/opago-wallet/app/(tabs)/index.tsx:552>).

**26 · P2 · Der Start wartet auf Daten, die die Bedienung nicht vollständig blockieren müssten. — Code**

Obwohl die Authentifizierung die Wallet-Oberfläche früh freigibt, wartet Home auf Guthaben und Kursstatus beziehungsweise auf einen Fünf-Sekunden-Timeout. Das kann nach Entsperrungen erneut relevant werden. Ein fehlender Wechselkurs wirkt dadurch auf den gesamten Start, obwohl er nur eine Schätzung ergänzt.

**Änderung:** Die stabile Home-Struktur sofort zeigen und einzelne Datenbereiche gezielt laden. Empfang, Einstellungen und das Erfassen einer Zahlungsanfrage können ihren jeweiligen Voraussetzungen entsprechend verfügbar sein; tatsächliches Senden bleibt an die nötigen Prüfungen gebunden. Belege: [Startvoraussetzungen und Timeout](<C:/dev/opago-wallet/app/(tabs)/index.tsx:435>), [frühe Freigabe im Wallet-Hook](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:245>).

**27 · P2 · Die letzte Aktivität auf Home ist nicht verlässlich vollständig. — Code**

Home lädt zunächst lokale Aktivitäten. Die zusammengeführte Historie mit weiteren Quellen wird erst beim Öffnen der Aktivitätsansicht abgefragt. Ohne lokalen Eintrag kann die gesamte Rubrik „Latest activity“ fehlen, obwohl wiederherstellbare Provider-Aktivität existiert. Das kann nach Wiederherstellung oder bei außerhalb des aktuellen Bildschirms eingegangenen Vorgängen wie eine leere Historie wirken.

**Änderung:** Eine kleine aktuelle Seite im Hintergrund laden oder den noch nicht synchronisierten Zustand ehrlich anzeigen. „Keine Zahlungen“ von „Noch nicht geladen“ unterscheiden. Dafür keine unbeschränkte vollständige Historie beim Start abfragen. Belege: [lokales Laden und History-Gate](<C:/dev/opago-wallet/app/(tabs)/index.tsx:161>), [bedingte Aktivitätsrubrik](<C:/dev/opago-wallet/app/(tabs)/index.tsx:576>).

**28 · P2 · Es fehlt ein brauchbarer Zahlungsbeleg. — Code / Design**

Ein Bitcoin-/Lightning-Historieneintrag öffnet im Wesentlichen einen nativen Alert mit Betrag, Status, Route und Kennung. Zeitpunkt, Empfänger, tatsächliche beziehungsweise maximale Gebühren und sinnvoller Prüfzugang werden dort nicht zu einem verständlichen Beleg zusammengeführt. HBAR öffnet dagegen einen Explorer. Für Nutzer sind diese unterschiedlichen Detailmodelle schwer vorhersehbar.

**Änderung:** Einheitliche Zahlungsdetailseite mit Status, Richtung, Betrag, Datum, Gegenstelle soweit bekannt, Gebühren und Referenz. Bei Bitcoin optional ein passender Explorerlink; bei Lightning nur tatsächlich vorhandene Nachweise. Historische Eurogegenwerte nur als solche ausweisen, wenn der damalige Kurs wirklich gespeichert wurde. Belege: [Öffnen einer Transaktion](<C:/dev/opago-wallet/app/(tabs)/index.tsx:398>), [Bitcoin-Ergebnisansicht](<C:/dev/opago-wallet/components/bitcoin/transfer-result.tsx:1>).

**29 · P2 · Bei Geldproblemen fehlt ein klarer Hilfeweg. — Code / Design**

Die verfügbaren Routen und Einstellungen bieten keinen dedizierten Hilfe- oder Supportzugang. Gerade „Status unbekannt“, nicht verfügbare Einzahlungen, Kaufprobleme und Wiederherstellung benötigen eine verständliche Eskalation. Technische Gesundheitsinformationen im erweiterten Bereich ersetzen diese nicht.

**Änderung:** „Hilfe“ in Einstellungen und kontextbezogen an ungelösten Vorgängen anbieten. Die wenigen relevanten Themen zuerst: Kauf ausstehend, Zahlung wird geprüft, Einzahlung freigeben, Backup wiederherstellen. Einen real betreuten Kontaktweg verwenden und einen sicheren, ausdrücklich ausgewählten Diagnoseauszug ermöglichen; niemals Wiederherstellungswörter abfragen. Belege: [Einstellungen](<C:/dev/opago-wallet/app/(tabs)/settings.tsx:328>), [erweiterte Informationen](<C:/dev/opago-wallet/app/(tabs)/settings.tsx:492>).

**30 · P2 · Backup-Unterbrechungen verlieren den ursprünglichen Vorgang. — Code**

Wer aus Kaufen oder Empfangen zunächst ein Backup erledigen soll, landet in den allgemeinen Sicherheitseinstellungen. Nach erfolgreicher Prüfung wird der Backupstatus aktualisiert, aber der ursprüngliche Kauf- oder Empfangsablauf nicht gezielt fortgesetzt. Der Nutzer muss seinen Weg selbst wiederfinden.

**Änderung:** Einen eigenen, abgeschlossenen Backup-Ablauf mit sicherem Rückkehrziel verwenden. Nach erfolgreicher Prüfung „Weiter zum Kaufen“ beziehungsweise „Weiter zum Empfangen“ anbieten. Bereits eingegebene unkritische Beträge erhalten; keinen Kauf und keine Zahlung automatisch auslösen. Belege: [Backup-Einstieg aus Kaufen](<C:/dev/opago-wallet/app/buy.tsx:158>), [Empfangssperre](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:608>), [Backup-Abschluss](<C:/dev/opago-wallet/app/(tabs)/settings.tsx:275>).

**31 · P2 · „Wallet wiederherstellen“ erläutert die tatsächliche Kompatibilität nicht. — Code / Design**

Die Oberfläche fragt allgemein nach Wiederherstellungswörtern und bietet mehrere BIP39-Wortlängen an. Die Implementierung leitet jedoch die von Opago verwendeten Spark-/Hedera-Schlüssel ab; eine allgemeine Wiederherstellung beliebiger Bitcoin-Wallets mit allen deren Ableitungspfaden und On-chain-Guthaben ist dadurch nicht gegeben. Ein syntaktisch gültiges Backup einer anderen Wallet kann deshalb zu falschen Erwartungen führen.

**Änderung:** Vor der Eingabe klar benennen, welche Backups unterstützt werden. Für Einsteiger „Opago-Wallet wiederherstellen“ verwenden, sofern keine weitergehende Kompatibilität geprüft ist. Andere Wallets nur mit tatsächlich unterstütztem Import-/Transferweg erklären. Nach einer Wiederherstellung sauber zwischen Synchronisierung, leerer Wallet und nicht unterstützter Herkunft unterscheiden. Belege: [Restore-Oberfläche](<C:/dev/opago-wallet/components/onboarding/recovery-form.tsx:75>), [Wiederherstellung](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:337>), [Schlüsselinitialisierung](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:235>).

**32 · P2 · Wiederherstellung ist eingabeintensiv und kann ohne Erklärung zurückgesetzt werden. — Code / Design**

Der Ablauf erfasst Wörter nacheinander. Bei 24 Wörtern sind entsprechend viele Schritte erforderlich. Zusätzlich wird die Wiederherstellungsansicht bei jedem App-Zustand ungleich `active` geschlossen; bereits eine vorübergehende Inaktivität kann dadurch die lokale Eingabe verlieren. Der Grund ist für den Nutzer nicht sichtbar.

**Änderung:** Sichere lokale Wortvorschläge, direkte Korrektur einzelner Wörter und eine klare Fortschrittsanzeige anbieten. Echte Hintergrundwechsel von kurzen Systemunterbrechungen unterscheiden, soweit der Schutz das zulässt. Wenn Wörter absichtlich gelöscht werden, vorher die Regel und danach den Grund erklären. Geheimnisse weiterhin nicht unverschlüsselt persistieren oder an externe Autovervollständigung übertragen. Belege: [App-State-Reset](<C:/dev/opago-wallet/app/(auth)/login.tsx:41>), [Worteingabe](<C:/dev/opago-wallet/components/onboarding/recovery-form.tsx:21>).

**33 · P2 · Die Backup-Anzeige setzt langsame Nutzer unter Zeitdruck. — Code / Design**

Die Wiederherstellungswörter werden nach zwei Minuten wieder verborgen. Auf kleinen Displays beziehungsweise mit großer Schrift wird die Wortliste länger. Für sorgfältiges Abschreiben kann die Zeit zu knapp sein. Außerdem verändert der Einstieg in die Backup-Prüfung den Status; wer dann abbricht, erhält keinen klar geführten Abschluss oder Wiedereinstieg im ursprünglichen Vorgang.

**Änderung:** Die verbleibende Anzeigezeit verständlich machen und einen ausdrücklich autorisierten Wiedereinstieg anbieten. Den nächsten noch offenen Backup-Schritt klar anzeigen. Schutz bei Hintergrundwechsel und Screenshots erhalten; keine geheime Phrase dauerhaft sichtbar oder ungeschützt gespeichert lassen. Belege: [Ausblenden nach zwei Minuten](<C:/dev/opago-wallet/app/(tabs)/settings.tsx:164>), [Backup-Beginn](<C:/dev/opago-wallet/app/(tabs)/settings.tsx:178>), [geschützte Wortdarstellung](<C:/dev/opago-wallet/components/security/recovery-phrase.tsx:1>).

**34 · P2 · Die Einstellungen passen nicht zu ihrer Bezeichnung und Gewichtung. — Design / Code**

Das Hamburger-Symbol auf Home öffnet einen Bildschirm namens „Security“, der zusätzlich Sprache, Erscheinungsbild, Wallet-Entfernung und technische Zusatzinformationen enthält. Die lange Backup-Fläche dominiert auch diesen allgemeinen Einstieg. Eine gefährliche Aktion steht im normalen vertikalen Verlauf vor dem erweiterten Bereich.

**Änderung:** Ein klar beschrifteter Einstieg „Einstellungen“. Kurze Zeilen für Backup-Status, Sicherheit, Darstellung, Sprache und Hilfe; Einzelheiten jeweils auf einem passenden Folgebildschirm. Wallet entfernen bewusst absetzen und die vorhandenen Schutzabfragen erhalten. Zusatzcoins und technische Diagnosen zusammen im erweiterten Bereich halten. Belege: [Home-Einstieg](<C:/dev/opago-wallet/app/(tabs)/index.tsx:514>), [Einstellungsstruktur](<C:/dev/opago-wallet/app/(tabs)/settings.tsx:328>), [untere Abschnitte](<C:/dev/opago-wallet/app/(tabs)/settings.tsx:474>).

**35 · P2 · App-Wechsel verlieren auch nicht geheime Arbeitskontexte. — Code**

Beim Sperren wird die eigentliche Oberfläche ausgehängt und der Wallet-Laufzeitstatus verworfen. Lokale Sendebeträge, Empfänger und Kaufbeträge können dadurch verloren gehen. Gerade um eine Adresse aus einer anderen App zu holen oder den Kaufanbieter zu benutzen, ist ein App-Wechsel jedoch ein normaler Teil des Ablaufs. Die Empfangsanfrage besitzt bereits eine gesonderte Wiederaufnahme; andere Vorgänge sind weniger konsistent.

**Änderung:** Nicht geheime Entwürfe und Rückkehrziele getrennt vom entsperrten Wallet-Laufzeitstatus behandeln. Nach Entsperrung den passenden Schritt wiederherstellen, Angebote erneut auf Gültigkeit prüfen und eingereichte Zahlungen immer zuerst abgleichen. Die Hintergrundsperre selbst bleibt bestehen. Belege: [Aushängen hinter der Sperre](<C:/dev/opago-wallet/components/security/wallet-gate.tsx:33>), [Laufzeit-Reset](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:110>), [Sendefokus-Reset](<C:/dev/opago-wallet/app/(tabs)/send.tsx:602>), [lokaler Kaufbetrag](<C:/dev/opago-wallet/app/buy.tsx:38>).

**36 · P2 · Es gibt noch kein konsistentes visuelles System für das Produkt. — Code / Design**

Welcome, Scanner, Home, Senden, Empfangen und Einstellungen verwenden viele unabhängige Stildefinitionen. Das UI-Inventar enthält 203 unterschiedliche Hex-Farbliterale, 34 Schriftgrößen und 24 Radiuswerte. Diese Zahlen umfassen auch Sonderfälle und sind für sich kein Fehlerbeweis. Zusammen mit der heuristischen Theme-Umrechnung und unterschiedlichen Seitenmustern zeigen sie aber, dass die Gestaltung nicht aus einem kleinen gemeinsamen System entsteht. Welcome wirkt durch seine grünlichen Töne und große Editorial-Typografie anders als die übrigen Geldansichten.

**Änderung:** Semantische Farbrollen, eine kleine Schrift- und Abstandsskala, einheitliche Buttons, Felder, Statuskarten, Geldanzeigen und Seitentitel definieren. Den gelben Akzent gezielt für Hauptaktionen und Auswahl einsetzen; Status zusätzlich durch Text vermitteln. Erst die wiederverwendbaren Komponenten angleichen, dann einzelne Screens. Belege: [Theme-Mechanismus](<C:/dev/opago-wallet/lib/theme-styles.ts:1>), [Welcome-Stile](<C:/dev/opago-wallet/app/(auth)/login.tsx:159>), [Zahlungskomponenten](<C:/dev/opago-wallet/components/bitcoin/payment-ui.tsx:120>), [Inventar](<C:/dev/opago-wallet/.codex-local-evidence/design-usability-audit/checks.json>).

**37 · P2 · Wichtige Metadaten sind zu klein; Accessibility ist nicht durchgängig. — Code / teilweise native Prüfung offen**

Historienstatus werden mit 9, Zeitangaben mit 11 und Beträge mit 12 Schriftgrößeneinheiten dargestellt. Die Datumsfarbe erreicht auf dem dunklen Hintergrund rechnerisch nur 4,23:1. Automatisches Verkleinern von Geldbeträgen kann die Lesbarkeit weiter reduzieren. Für Zahlungsansichten gibt es bereits gezielte Fokusführung und reduzierte Animationen, aber nicht dieselbe Umsetzung für alle Vollbildzustände; die Startanimation berücksichtigt reduzierte Bewegung nicht entsprechend.

**Änderung:** Wesentliche Finanzinformationen ausreichend groß und kontrastreich darstellen. Geldbeträge bei Platzmangel sinnvoll umbrechen oder das Layout anpassen. Fokus, Ankündigung von Statusänderungen und reduzierte Bewegung gemeinsam für alle Zustände definieren. Konkrete Überlappungen bei großer Systemschrift erst nach nativer Prüfung als Fehler bewerten. Belege: [Historienstile](<C:/dev/opago-wallet/app/(tabs)/index.tsx:961>), [Startanimation](<C:/dev/opago-wallet/app/(tabs)/index.tsx:635>), [vorhandene Zahlungsanimation](<C:/dev/opago-wallet/components/bitcoin/payment-progress.tsx:1>).

**38 · P2 · Technische Fehlermeldungen durchbrechen Sprache und Verständlichkeit. — Code / Probe**

Viele feste Oberflächentexte sind übersetzt und die Sprachtests bestehen. Dynamisch zusammengesetzte Fehler wie `Lightning wallet unavailable: ` plus Providertext passen aber nicht zu festen Übersetzungsschlüsseln. An verschiedenen Stellen wird eine beliebige Fehlermeldung durch `t(...)` gereicht. So können gerade in Stresssituationen englische oder technische Texte erscheinen. Die Zahl dynamischer Übersetzungsaufrufe allein beweist dagegen keinen Fehler.

**Änderung:** Verständliche Fehlercodes auf feste übersetzte Meldungen mit einer passenden Aktion abbilden. Technische Details nur optional als Diagnose zeigen. Begriffe wie Spark, Claim, Fee offer und TxID im normalen Ablauf durch Aufgaben und Ergebnisse erklären. Belege: [zusammengesetzter Initialisierungsfehler](<C:/dev/opago-wallet/hooks/useWalletAuth.ts:268>), [Fehlerübersetzung in der Sperransicht](<C:/dev/opago-wallet/components/security/wallet-gate.tsx:42>), [Lokalisierungsprobe](<C:/dev/opago-wallet/.codex-local-evidence/design-usability-audit/checks.json>).

**39 · P3 · Empfangsbenachrichtigungen haben keinen abgeschlossenen Nutzerfluss. — Code / Produktentscheidung**

Die Empfangserkennung kann eine lokale Benachrichtigung auslösen, wenn die Berechtigung bereits vorhanden ist. Ein erklärter Opt-in ist im App-Code nicht erkennbar. Die relevante Prüfung läuft im aktiven Empfangskontext; daraus folgt keine verlässliche Benachrichtigung bei geschlossener App.

**Änderung:** Zunächst festlegen, ob Hintergrundbenachrichtigungen zum Produkt gehören. Falls ja, einen verständlichen freiwilligen Einstieg und die nötige Zustellung implementieren. Falls nicht, keine Benachrichtigung bei geschlossener App versprechen. Eine Berechtigungsabfrage allein löst das Hintergrundproblem nicht. Beleg: [Empfangserfolg und lokale Benachrichtigung](<C:/dev/opago-wallet/app/(tabs)/receive.tsx:224>).

**40 · P3 · App-Theme und native Darstellung sind nicht vollständig abgestimmt. — Code / native Prüfung offen**

Die App bietet hell und dunkel als eigene Einstellungen, während die Expo-Konfiguration `userInterfaceStyle: dark` vorgibt. Eine Einstellung „Wie das System“ fehlt. Daraus ergeben sich zusätzliche native Zustände für Systemdialoge, Tastatur und Startbildschirm, die nicht durch die JavaScript-Farbumrechnung abgedeckt sind. Konkrete störende Übergänge wurden hier nicht auf Geräten bestätigt.

**Änderung:** Theme-Politik einschließlich Systemoberflächen ausdrücklich festlegen und auf beiden Plattformen prüfen. „Wie das System“ ist eine sinnvolle spätere Ergänzung; die unleserlichen Farben aus Befund 06 haben Vorrang. Belege: [Modusverwaltung](<C:/dev/opago-wallet/lib/color-mode.ts:1>), [Modusauswahl](<C:/dev/opago-wallet/components/settings/color-mode-picker.tsx:1>), [native App-Konfiguration](<C:/dev/opago-wallet/app.json>).

**Konkretes Zielbild für die vier Kernaufgaben**

| Aufgabe | Normaler Ablauf | Was auf der Hauptansicht steht |
|---|---|---|
| Guthaben verwahren | Öffnen → Entsperren → Home | Verfügbares Guthaben, sekundärer Gegenwert, feste Aktionen Kaufen / Senden / Empfangen, letzte Aktivitäten; offene Pflichtaktionen sichtbar |
| Bitcoin kaufen | Betrag → Anbieterprüfung → Kaufstatus → gegebenenfalls Gebühr bestätigen → verfügbar | Bitcoin ist vorausgewählt; Kosten und Schritte bis zur Verfügbarkeit sind vor dem Anbieterwechsel verständlich |
| Bitcoin senden | Scannen oder Einfügen → Betrag, falls nötig → Prüfen → Autorisieren → eindeutiges Ergebnis | Empfänger, Betrag, Gebühr, Gesamtbetrag; Netzwerk aus der Anfrage erkennen und nur relevante Unterschiede erklären |
| Bitcoin empfangen | Empfangen → QR-Code teilen oder zeigen → Zahlungseingang | Aktiver Empfangsweg, lesbares Ziel soweit sinnvoll, optionaler Betrag und Gültigkeit; bei Bitcoin erforderliche Freigabe direkt erreichbar |

Für die visuelle Richtung empfehle ich eine ruhige Fläche, starke Geldtypografie, eine einzige Hauptaktion pro Schritt und wenige konsistente Komponenten. BTC, SAT und EUR müssen nicht gleichberechtigt um Aufmerksamkeit konkurrieren. Technische Details bleiben erreichbar, stehen aber hinter der Entscheidung, für die sie gebraucht werden. Ein sichtbarer Backupstatus gehört zur Wallet; ein vollständiger Sicherheitsleitfaden nicht auf jede Geldansicht.

Als Referenz beschreibt Wallet of Satoshi in seiner offiziellen Self-Custody-Anleitung einen gemeinsamen Sendeinstieg per Scan/Einfügen mit automatischer Erkennung. Beim Empfangen verwendet es standardmäßig eine wiederverwendbare Lightning-Adresse und erzeugt eine Invoice bei einem konkreten Betrag; Bitcoin-Empfang ist ein eigener wählbarer Weg. Opago besitzt bereits die wichtige automatische Erkennung. Die Übertragbarkeit des dauerhaften Empfangsmodells muss dagegen technisch geprüft werden. Quelle: [Wallet of Satoshi – offizieller Ablauf](https://support.walletofsatoshi.com/en/support/solutions/articles/36000579025-how-to-send-and-receive-bitcoin-in-the-self-custody-wos-wallet).

**Empfohlene Umsetzungsreihenfolge**

1. **Geldzustände verständlich und wiederaufnehmbar machen:** Befunde 01–05, 07–09, 15 und 24. Einzahlungen, Käufe und ausgehende Zahlungen erhalten eindeutige Zustände, direkte Aktionen und echte Wiederholungsmöglichkeiten für reine Verbindungsfehler.
2. **Die drei Transaktionsabläufe vereinfachen:** feste Home-Aktionen, einheitliche Betragseinheiten, Bearbeiten statt Reset, klare Empfangsanfragen und fortsetzbarer Backupablauf. Vorrang für 10–14, 18–23, 25 und 30–35.
3. **Das visuelle System konsolidieren:** Befund 06 unmittelbar beheben; anschließend gemeinsame Farben, Typografie und Komponenten aus 36–38. Details, Historie, Hilfe und Eingabemethoden angleichen.
4. **Auf Geräten und mit Erstnutzern abnehmen:** die folgenden Szenarien ausführen, bevor die Gestaltung als fertig gilt. Optionale Benachrichtigungen und Systemtheme danach ergänzen.

**Noch auf aktuellen nativen Builds zu prüfen**

| Prüfung | Konkretes Risiko / erwartetes Ergebnis |
|---|---|
| Kleines iPhone und kleines Android, zusätzlich größte unterstützte Systemschrift | Kaufen mit geöffneter Tastatur, QR-Flächen, nicht scrollende Sperr-/Erfolgsansichten und feste Fußbereiche bleiben bedienbar |
| VoiceOver und TalkBack | Fokus erreicht den Titel nach einem Schrittwechsel; Betrag, Gebühren und Status werden verständlich gelesen; kein Fokus hinter modalen Ansichten |
| Android-Hardware-Zurück und iOS-Zurückgesten | Empfangs-Unteransichten und Prüfungen gehen genau einen verständlichen Schritt zurück, ohne ungewollte Datenverluste |
| Hell/Dunkel mit nativen Dialogen und Tastatur | Lesbare Zustände einschließlich Disabled, ausgewählt, Fehler, Startbildschirm und Biometrieübergängen |
| QR scannen mit anderen verbreiteten Wallets | Darstellung, Helligkeit, lange Invoices und aktuelle/abgelaufene Anfragen funktionieren nachvollziehbar |
| Schlechtes Netz und Flugmodus | Bestehendes Guthaben ist als letzter Stand erkennbar; Verbindung lässt sich gezielt wiederherstellen; fehlende Kurse verhindern kein Erfassen einer Anfrage |
| App-Wechsel während Scan, Eingabe, Gerätefreigabe und Anbieter-Checkout | Schutz bleibt aktiv; nicht geheime Entwürfe und offene Vorgänge werden korrekt fortgesetzt |
| Kauf plus Bitcoin-Einzahlung | Nutzer versteht Anbieterzahlung, Netzwerkbestätigung, zusätzliche Gebühr und endgültige Verfügbarkeit als einen Ablauf |
| Force-stop und Wiederherstellung mit offenen Zahlungen | Kein doppeltes Senden; die aktuelle Provider-Recovery wird in verständliche sichtbare Zustände übersetzt |
| Wiederherstellung mit unterstütztem Backup | Guthaben, notwendige Synchronisierung, Backupstatus und Historie sind nachvollziehbar; kein vorschnelles „leer“ |

**Ausgeführte Verifikation und Dateien**

Die folgenden bestehenden Tests wurden gemeinsam ausgeführt: `bitcoin-send-sheets`, `bitcoin-send-ui`, `lightning-send-ui`, `lightning-receive-ui`, `color-mode`, `language`, `wallet-ui` und `moonpay`. Ergebnis: **69 bestanden, 0 fehlgeschlagen**. Diese Tests prüfen Logik und teilweise Quelltext-/Komponentenverhalten; sie ersetzen keine native Sicht- oder Accessibility-Prüfung. Einige bestätigen ausdrücklich die derzeitige Löschung beim Währungswechsel, den Reset beim Abbrechen oder die automatische Rückkehr nach Empfang. Bestandene Tests sind hier daher kein Beleg für gute Bedienbarkeit.

Zusätzlich lokal geprüft: konkrete Kontrastpaare, Statusübersetzung, Native-Intent-Routing und ein dynamischer deutscher Übersetzungsfall. Das Hilfsskript arbeitet mit synthetischen Werten und löst keine Wallet- oder Netzwerkaktionen aus: [checks.cjs](<C:/dev/opago-wallet/.codex-local-evidence/design-usability-audit/checks.cjs>), [checks.json](<C:/dev/opago-wallet/.codex-local-evidence/design-usability-audit/checks.json>). Die Hilfsdateien liegen im bereits ignorierten lokalen Evidenzverzeichnis.

Die App-Implementierung wurde im Rahmen dieses Audits nicht geändert. Bereits vorhandene Änderungen im Arbeitsverzeichnis wurden erhalten. Die Maßnahmen in diesem Bericht sind noch umzusetzen.
