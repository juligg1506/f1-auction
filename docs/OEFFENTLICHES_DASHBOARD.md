# Öffentliches Dashboard und Rennkalender

**Aktuelle Zugangsregel:** Vor dem Einstieg erscheint nur die Anmeldeauswahl. Nach „Als Gast fortfahren“ sind alle öffentlichen Ansichten lesbar, auch Auktionen, Teams, Ergebnisdetails und Statistiken. Schreib-/Adminzugriffe bleiben geschützt. Die folgende Kalender- und Dashboardbeschreibung gilt unverändert; siehe [FAHRERSTATISTIKEN.md](FAHRERSTATISTIKEN.md) für den erweiterten Gastzugang.

Das Dashboard lädt Fahrer- und Teamwertungen sowie den Kalender für ein Saison-/Meisterschaftslabel. Es nutzt denselben Punktestand wie die Ergebnisansicht. Bei fehlenden veröffentlichten Ergebnissen oder Terminen erscheinen leere Zustände statt Beispieldaten. Alle Daten werden beim Öffnen des Dashboards, Saisonwechsel, Rückkehr zum Browser-Tab und ungefähr jede Minute aktualisiert. Eine teilweise nicht erreichbare API verhindert nicht die Anzeige der anderen Daten.

## Kalenderfreigabe

Veröffentlichte Rennen erscheinen automatisch im Kalender. Ein Entwurf erscheint nur, wenn ein Admin „Renntermin vor Veröffentlichung der Ergebnisse im Kalender zeigen“ ausdrücklich aktiviert hat. Im öffentlichen Kalender stehen nur Rennname, Datum, Saison, ID und Status. Ergebnisse, unfertige Platzierungen, Revisionen und Bearbeiter werden dort nicht veröffentlicht. Die Punkte eines Entwurfs zählen nie zur Wertung.

Beim Anlegen neuer Rennen ist die sichtbare Kalender-Checkbox vorausgewählt. Bereits vorhandene Entwürfe behalten ihre bisherige Privatheit: Der neue Datenbankwert ist standardmäßig 0. Die Kalenderfreigabe kann im Ergebnis-Editor geändert werden; Speichern als Entwurf genügt. Alte Clients, die das Feld beim Speichern noch nicht senden, erhalten eine bestehende Freigabe aufrecht.

## Cloudflare

Vorher einen D1-Time-Travel-Bookmark und die aktive Worker-Version sichern. Schema mit `PRAGMA table_info(races)` prüfen. Anschließend Migration `003_public_calendar.sql` **einmalig** ausführen und den aktuellen Worker deployen. Wenn die Spalte bereits existiert, nur den `CREATE INDEX IF NOT EXISTS`-Teil ausführen. Voraussetzung sind Migrationen 001 und 002. Es werden keine Budgets, Ergebnisse oder Auktionsdatensätze zurückgesetzt. Bindings, Secrets, Discord-Kanal und Cron-Trigger beibehalten.

Der neue Worker meldet `publicDashboard: true` und `raceCalendar: true` in `/api/features`. Ohne Bearer-Token müssen `/api/standings?season=2026` und `/api/calendar?season=2026` 200 liefern, `/api/me` und `/api/admin/*` dagegen 401.

## Prüfungen

- `node tests/worker.test.mjs`: bisherige Geld-/Auktions-/Race-Tests plus Gast-Sperren, öffentlicher Kalender, Kalenderzustimmung, Rücknahme, strikte Eingabeprüfung und Schutz vor Entwurfs-/Punktelecks.
- Für integrierte Browserprüfungen `node tests/integration-server.mjs` starten, danach `python3 tests/dashboard.browser.py`. Test-DB, Sessions und Discord-Antworten sind vollständig isoliert; es werden keine Live-Rennen oder Gebote angelegt.
- Browser: 1440, 820, 390 und 320 Pixel; Daten ohne Login, nur ein Menüpunkt, direkte Mitglieder-Links, leere Saison, Kalenderfreigabe und -rücknahme, angemeldete Direktlinks und Sessionablauf.

Ein Zurücksetzen auf den vorherigen Worker kann die zusätzliche Kalenderspalte belassen. Der öffentliche Kalender ist dann nicht verfügbar; die alte API-Policy gilt wieder. Ein Datenbank-Restore ist kein normaler Rollout-Schritt.

