# 0.2.0 — Plan V7, 28. September 2026

- Ersetzt 0.1.0 für die gemeinsame V7-Integration; das alte Paket bleibt unverändert nachvollziehbar.
- Ergänzt umschaltbare non-custodial TME: `shadow` und `enforcing`, explizite Konfiguration, versionierte Betriebsänderungen, Freigabe vor Auftrag und Rechnungsausgabe.
- `Registration`: neue Pflichtfelder `tme_mode`, `tme_policy_version`, `tme_policy_epoch`, `tme_blocked`, `reject_reason`; `pre_check_status` ergänzt `rejected` und `pending`. JSON-Schema verhindert mehrere widersprüchliche Rechnungsausgaben.
- Neue Fehler `tme_pending` und `tme_unavailable`; `tme_rejected` gilt bei Durchsetzung auch für non-custodial API-Rechnungen. Vorübergehender Ausfall erzeugt keine endgültige Ablehnung.
- Read-only `custodial` in Wallet-/Konto-Wallet-Ausgaben. Serverseitiger Wallet-Typ ist unveränderlich; keine Übernahme eines vom Client gewählten Typs.
- Wiederholungen und gespeicherte Antworten passieren die aktuelle Rechnungsfreigabe. Moduswechsel haben eine dokumentierte atomare Freigabegrenze; bereits ausgelieferte BOLT11 sind nicht rückrufbar.
- Kundenzahlungen und bestätigte rollierende Werte konkretisiert, inklusive Ausschluss interner Buchungen, Deduplizierung, späterer Belege und getrenntem Nachweis der Senderzuordnung.
- Zusätzliche Schema-Fixtures und zwölf Implementierungs-/Integrationsszenarien. Die Szenarien sind noch nicht ausgeführt.

Keine neuen HTTP-Routen, keine Änderung an HPKE, Signaturbytes, Event-Hashing oder Helper-Anfragen. Die Antwortänderungen sind für streng validierende 0.1.0-Clients inkompatibel: gemeinsame Versionsübernahme vor Integration erforderlich. Der Ordner `v2` bezeichnet dieses Vertragspaket; HTTP-Pfade bleiben `/api/v2/...`.

Normative Reihenfolge innerhalb des Pakets: `tme-v7.md` für TME, ansonsten `protocol.md` zusammen mit OpenAPI und Schemas. Verkürzte Word-Beispiele werden dadurch konkretisiert; historische Kurzbeispiele sind kein alternatives Drahtformat. Bei weiteren Widersprüchen Vertrag versionieren, keinen stillen Fork bauen.
