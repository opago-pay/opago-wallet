# Datenschutzerklärung für die OPAGO Wallet

**Stand: 4. Oktober 2026.** Diese Erklärung beschreibt die Datenverarbeitung in der mobilen OPAGO Wallet. Ergänzend gilt für OPAGO-Webseiten die [Datenschutzerklärung für die Website](https://www.opago.com/de/privacy/).

## 1. Verantwortlicher und Kontakt

Verantwortlich für die Datenverarbeitungen, über deren Zwecke und Mittel OPAGO entscheidet, ist die OPAGO GmbH, Moosstraße 4, 83404 Ainring, Deutschland. Fragen zum Datenschutz und Anfragen zu Ihren Rechten senden Sie an **contact@opago.com**. Bei eigenständig betriebenen Zahlungsnetzwerken oder Zahlungszielen können weitere Stellen für ihre jeweilige Verarbeitung verantwortlich sein.


## 2. Was die Wallet auf Ihrem Gerät verarbeitet

Wenn Sie eine Wallet erstellen oder wiederherstellen, verarbeitet die App Wiederherstellungswörter und die daraus abgeleiteten Schlüssel. Die Wiederherstellungswörter werden im geschützten Speicher des Geräts abgelegt; Schlüssel werden für Wallet-Funktionen und zum Signieren von Zahlungen verwendet. Die App speichert außerdem öffentliche Wallet- und Kontokennungen, Einstellungen, Guthaben-Zwischenspeicher, Empfangsanfragen, Zahlungsstatus und einen lokalen Aktivitätenverlauf. Nicht alle lokalen Zahlungsdaten liegen im geschützten Schlüsselspeicher.

Die App lädt Wiederherstellungswörter nicht automatisch zu OPAGO hoch. Geben Sie diese Wörter niemals an den Support oder andere Personen weiter. Ihre Geräteeinstellungen und Sicherungsfunktionen des Betriebssystems können beeinflussen, welche lokalen Daten in Backups gelangen.

Die Verbindungen der Wallet hängen von den in Ihrer App-Version verfügbaren Funktionen ab. Neben externen Netzwerkdiensten können dazu OPAGO-Dienste gehören: Falls Ihre Version eine Hedera-Kontoaktivierung über OPAGO anbietet und Sie diese starten oder deren Status abfragen, werden der öffentliche Aktivierungsschlüssel, das Netzwerk sowie eine Challenge-Kennung und eine Signatur zum Nachweis der Schlüsselkontrolle an den Aktivierungsdienst übermittelt. Wiederherstellungswörter und private Schlüssel gehören nicht zu dieser Anfrage. Technisch fallen dabei Verbindungsdaten wie die IP-Adresse an. Öffentliche Blockchain-Daten, von Ihnen geöffnete OPAGO-Webseiten und Supportanfragen sind davon getrennte Verarbeitungen.

## 3. Zahlungen und Netzwerkabfragen

Für Bitcoin- und Lightning-Funktionen stellt die App Verbindungen zu Spark-Diensten und, je nach Zahlung, zum Bitcoin- oder Lightning-Netzwerk her. Dazu können öffentliche Walletkennungen, Zahlungsanforderungen, Beträge, Transaktionskennungen und Statusdaten übermittelt werden. Bei einer Bitcoin-Onchain-Zahlung können Transaktionsdaten im öffentlichen Netzwerk sichtbar und dauerhaft abrufbar sein.

Für HBAR-Funktionen fragt die App Hedera-Nodes und Mirror-Nodes nach Konto, Guthaben und Transaktionen ab. HBAR-Sendungen aus der App werden über den konfigurierten OPAGO-Checkout-Smart-Contract eingereicht. Dabei werden insbesondere Konto- und Transaktionskennungen, Beträge und die zur Vertragsausführung nötigen Zahlungsdaten verarbeitet. Hedera-Transaktionen und Vertragsaufrufe sind grundsätzlich öffentlich nachvollziehbar und können nach einer lokalen Löschung der Wallet nicht aus dem Netzwerk entfernt werden.

Wenn Sie eine Lightning Address, LNURL- oder eine andere unterstützte Zahlungsanforderung verwenden, verbindet sich die App mit der von Ihnen gewählten Gegenstelle. Diese kann die Anfrage, den Betrag beim Abruf einer Rechnung und technische Verbindungsdaten erhalten. Die jeweilige Gegenstelle wird nicht immer von OPAGO betrieben. Netzwerkanbieter können bei Verbindungen auch Ihre IP-Adresse sehen und nach ihren eigenen Regeln verarbeiten.

Für Bitcoin-Transaktionsinformationen kann die App `mempool.space` mit einer Transaktionskennung abfragen. Beim Öffnen eines Blockchain-Explorers in Ihrem Browser gelten die Datenschutzinformationen des jeweiligen Website-Betreibers.

## 4. Euro-Anzeigen und historische Kurse

Die App fragt öffentliche Kurse bei CoinGecko ab. Wenn ein Kurs dort nicht verfügbar ist, nutzt sie Kraken als Ersatz. Für historische Euro-Anzeigen zu Transaktionen kann sie Kursdaten bei Binance Vision und den Bestätigungszeitpunkt einer Bitcoin-Transaktion bei `mempool.space` abrufen. Die Kursabfragen enthalten keine Wallet-Kennung oder Guthabenhöhe; die angefragten Transaktionskennungen bei `mempool.space` und die technisch anfallende IP-Adresse können dennoch bei den jeweiligen Diensten sichtbar sein. Euro-Anzeigen sind Schätzwerte.

## 5. Kamera, Zwischenablage und externe Links

Mit Ihrer Freigabe nutzt die App die Kamera, um Zahlungs-QR-Codes auf dem Gerät zu lesen. Die App sendet das Kamerabild nicht an OPAGO. Der erkannte Zahlungsinhalt kann anschließend für eine Netzwerkabfrage oder eine von Ihnen bestätigte Zahlung verwendet werden. Ein aus der Zwischenablage eingefügter Zahlungsinhalt wird entsprechend verarbeitet.

Wenn Sie Kontakt-, Hilfe- oder Rechtslinks öffnen, verlassen Sie die Wallet und rufen die jeweilige Website auf. Die Wallet hängt diesen Links keine Wallet-Kennung an. Für OPAGO-Webseiten und das von OPAGO verlinkte Supportangebot verweist OPAGO auf seine [Datenschutzerklärung für die Website](https://www.opago.com/de/privacy/) und die veröffentlichten [OPAGO-AGB](https://www.opago.com/de/terms/). Diese App-Datenschutzerklärung beschreibt ergänzend die Datenverarbeitung durch die Wallet selbst.

## 6. Fehlerdiagnose mit Sentry

Fehlerberichte sind freiwillig und zunächst ausgeschaltet. Erst nachdem Sie sie unter „Einstellungen → Fehlerberichte“ erlaubt haben, kann die Wallet gefilterte JavaScript-Fehler und auf iOS auch native Abstürze an Sentry über eine deutsche Empfangsadresse übermitteln. Sie können die Auswahl dort jederzeit widerrufen; dann endet die künftige Erfassung. Bereits übermittelte Berichte können nicht zurückgerufen werden. Die Wallet funktioniert auch ohne diese Diagnose. Für die von OPAGO verwendete Sentry-Organisation ist als Datenspeicherregion die EU eingestellt. OPAGO nutzt den Developer-Tarif; [Sentry speichert Fehlerereignisse in diesem Tarif nach eigener Angabe 30 Tage](https://www.sentry.help/en/articles/13964323-how-long-are-errors-events-stored-in-sentry). Die Berichte können Fehlerkategorien, Codepositionen, Build- und Betriebssystemdaten sowie eine grobe Bildschirmkategorie enthalten. Die Diagnosefilter entfernen Walletadressen, Recovery-Wörter, Schlüssel und Zahlungsinhalte vor der Übermittlung. Sentry erhält beim Verbindungsaufbau technisch auch Verbindungsdaten wie die IP-Adresse.

## 7. Supportanfragen

Wenn Sie das in der App verlinkte OPAGO-Supportangebot öffnen oder OPAGO eine Supportanfrage senden, findet die weitere Verarbeitung außerhalb der Wallet statt. OPAGO bearbeitet E-Mails an `support@opago.com` über Microsoft Outlook / Microsoft 365. Für den Umgang mit Kontakt- und Supportanfragen verweist OPAGO auf seine [Website-Datenschutzerklärung](https://www.opago.com/de/privacy/). Diese nennt für Kontaktanfragen Art. 6 Abs. 1 Buchst. f DSGVO als Rechtsgrundlage; falls eine Anfrage auf einen Vertrag abzielt, nennt sie Art. 6 Abs. 1 Buchst. b DSGVO. Die veröffentlichten [OPAGO-AGB](https://www.opago.com/de/terms/) sind dort ebenfalls abrufbar. Bitte übermitteln Sie keine Wiederherstellungswörter oder privaten Schlüssel.

## 8. Speicherung, Löschung und öffentliche Netzwerke

Wenn Sie die Wallet in der App löschen, werden die zugehörigen lokalen Schlüssel und App-Daten entfernt. Das löscht keine bereits veröffentlichten Bitcoin- oder Hedera-Transaktionen und keine Daten, die andere Netzwerkbetreiber oder Zahlungsgegenstellen unabhängig gespeichert haben. Falls Sie die Wallet später wiederherstellen möchten, benötigen Sie Ihre Wiederherstellungswörter.

OPAGO löscht abgeschlossene E-Mail-Supportanfragen 36 Monate nach Abschluss, sofern keine rechtliche Pflicht oder ein konkreter Rechtsstreit eine längere Aufbewahrung erfordert. Für sonstige Kontakte nennt die [Website-Datenschutzerklärung](https://www.opago.com/de/privacy/) Speicher- und Löschkriterien. Für Daten bei externen Netzwerk- und Informationsdiensten gelten je nach Anbieter und Zweck unterschiedliche Fristen oder Kriterien.

## 9. Erforderlichkeit und Rechtsgrundlagen

Die Verarbeitung der Wiederherstellungswörter und Schlüssel auf Ihrem Gerät sowie die Übermittlung der für eine ausgewählte Zahlung erforderlichen Angaben an Netzwerkdienste sind für die betreffenden Wallet-Funktionen technisch notwendig. Ohne Netzwerkverbindung können Guthaben und Zahlungsstatus nicht zuverlässig abgerufen oder Zahlungen ausgeführt werden. Kamera und Kontaktaufnahme mit dem Support nutzen Sie freiwillig. Die App zeigt Euro-Näherungswerte nur an, wenn die dafür benötigten öffentlichen Kursdaten abgerufen werden können.

Soweit OPAGO über Zwecke und Mittel der Verarbeitung entscheidet, stützt OPAGO die für Wallet- und Zahlungsfunktionen nötigen Netzwerk- und Statusanfragen sowie Kursabfragen auf Art. 6 Abs. 1 Buchst. f DSGVO. Das berechtigte Interesse besteht darin, die vom Nutzer ausgewählten Wallet-Funktionen auszuführen, Zahlungsstände anzuzeigen und unverbindliche Euro-Werte bereitzustellen. OPAGO stützt die in Abschnitt 6 beschriebene, auf Fehler- und Absturzinformationen begrenzte Sentry-Diagnose ebenfalls auf Art. 6 Abs. 1 Buchst. f DSGVO. Das berechtigte Interesse besteht darin, Fehler zu erkennen, die Stabilität und Sicherheit der Wallet zu verbessern und Fehlfunktionen bei Zahlungsabläufen zu untersuchen. Der Zugriff auf Geräteinformationen für diese freiwillige Diagnose erfolgt erst nach Ihrer Zustimmung gemäß § 25 Abs. 1 TDDDG. Ein Widerruf der Zustimmung beendet die künftige Sentry-Erfassung unabhängig von einem Widerspruch gegen eine Verarbeitung nach Art. 6 Abs. 1 Buchst. f DSGVO. Nutzer können der auf berechtigtes Interesse gestützten Verarbeitung unter den gesetzlichen Voraussetzungen widersprechen.

Die Grundlage für freiwillige Supportkontakte steht in Abschnitt 7.

## 10. Empfänger und Verarbeitung außerhalb der EU

Je nach genutzter Funktion können Spark-Dienste, Hedera-Nodes und Mirror-Nodes, gewählte Zahlungsgegenstellen, CoinGecko, Kraken, Binance Vision, `mempool.space` und Sentry Daten erhalten, wie oben beschrieben. Öffentliche Bitcoin- und Hedera-Transaktionen können von Teilnehmern weltweit eingesehen werden. Eigenständig betriebene Zahlungsziele und Netzwerkdienste verarbeiten Verbindungs- und Zahlungsdaten nach ihren jeweiligen Datenschutzinformationen.

[Spark Protocol, LLC/Lightspark](https://www.spark.money/privacy) erklärt, dass seine Dienste in den USA betrieben werden und dort personenbezogene Daten verarbeitet werden können. Lightspark nennt für bestimmte Übermittlungen Standarddatenschutzklauseln und erteilt unter `privacy@lightspark.com` weitere Informationen zu seinen Garantien. Für OPAGOs Sentry-Organisation ist die Datenspeicherregion EU eingestellt; [Sentry weist darauf hin, dass bestimmte Konto- und Organisationsdaten außerhalb der EU verarbeitet werden können](https://www.sentry.help/en/articles/13964378-sentry-s-eu-region-faq). Die EU-Datenspeicherregion bedeutet nicht, dass sämtliche Zugriffe ausschließlich aus der EU erfolgen.

## 11. Ihre Rechte

Soweit die Datenschutz-Grundverordnung anwendbar ist, können Sie unter den gesetzlichen Voraussetzungen Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit verlangen sowie Widerspruch einlegen. Eine erteilte Einwilligung können Sie mit Wirkung für die Zukunft widerrufen. Sie können sich bei einer zuständigen Datenschutzaufsichtsbehörde beschweren. Schreiben Sie für Anfragen an **contact@opago.com**. Die Bearbeitung hängt davon ab, ob OPAGO die betroffenen Daten selbst verarbeitet oder ob eine andere Stelle verantwortlich ist. Ein Recht auf Löschung kann technisch oder rechtlich nicht dazu führen, dass öffentliche Blockchain-Einträge rückgängig gemacht werden.
