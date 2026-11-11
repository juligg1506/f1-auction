# Virtual Tier Racing

Eine Liga, zunächst ausschließlich Tier 1. Es wird keine Saison vorausgesetzt. Die Startseite zeigt „Noch offen“, solange die Ligaleitung keine Saisonbezeichnung hinterlegt hat.

## Navigation und Zugriff

- Öffentlich: `#start`, `#kalender`, `#rennergebnisse`, `#teams`, `#liga`.
- Discord-Anmeldung: `#fahrerbereich`, `#fahrerstatistiken`, `#auktionen`; eigene Statistiken werden anhand der Discord-ID zugeordnet.
- Ligaleitung: `#administration`, nur mit der bestehenden Admin-Berechtigung.
- Bisherige Links auf `#dashboard` öffnen die öffentliche Startseite.

Ein Gast braucht keine Anmeldung und erhält keine Schreibrechte. Fahrerprofile, Fahrerstatistiken, Fahrerlisten, Auktionen und Transfers verlangen auch serverseitig eine gültige Sitzung. Öffentliche Teamdaten enthalten keine Budgets. Öffentliche Ergebnisse und Wertungen bleiben sichtbar. Abgelaufene Sitzungen öffnen bei geschützten Seiten die Anmeldung; die gewünschte Seite wird nach dem Discord-Login wiederhergestellt.

## Liga-Inhalte

Migration `004_league_portal.sql` legt nur zwei neue Tabellen und Indizes an; vorhandene Renn-, Fahrer- und Auktionsdaten werden nicht geändert. Vorher einen D1-Time-Travel-Bookmark anlegen. Danach den Worker und gemeinsam `index.html`/`app.js` veröffentlichen. Bindings, Secrets und Cron-Zeitpläne beibehalten.

Die Ligaleitung kann die Saisonbezeichnung speichern (leer = noch offen), Neuigkeiten anlegen und ein Regelwerk pflegen. Ein Inhalt wird als Entwurf oder veröffentlicht gespeichert. Entwürfe sind öffentlich nicht abrufbar. Zum Zurückziehen den veröffentlichten Inhalt wieder als Entwurf speichern. Änderungen prüfen die Revision und lehnen veraltete Speicherstände mit HTTP 409 ab. Alle Inhalte werden als Text dargestellt, HTML wird nicht ausgeführt. Es gibt keine erfundenen Termine, Meldungen oder Liga-Regeln.

Öffentlich: `GET /api/league` liefert Name, Tier, Saison sowie veröffentlichte Neuigkeiten und Regelwerk. Admin: `GET /api/admin/league`, `POST /api/admin/league/season`, `POST /api/admin/league/content`, `POST /api/admin/league/content/:id`.

## Prüfung

Benötigt Node.js, Python 3, Playwright und Chromium (`/usr/bin/chromium`, alternativ Browser-Tests entsprechend konfigurieren).

```
node --check app.js
node --check worker.js
node tests/worker.test.mjs
node tests/integration-server.mjs
# In einem zweiten Terminal, mit jeweils frisch gestartetem Integration-Server:
python3 tests/portal.browser.py
python3 tests/races.browser.py
python3 tests/bidding.browser.py
```

Der Integration-Server verwendet eine isolierte SQLite-Datenbank und simulierte Discord-Nachrichten. Es werden keine echten Gebote, Ergebnisse oder Nachrichten angelegt. `portal.browser.py` ersetzt die früheren Tests für Anmeldung als Einstieg, Gastmodus und Dashboard-Navigation: Diese Regeln wurden durch die öffentliche Startseite und den geschützten Fahrerbereich abgelöst. Auktions- und Ergebnisprüfungen bleiben erhalten. Die API-Prüfungen decken außerdem Budgets, parallele Gebote, Rennkorrekturen, Punkte, unveröffentlichte Daten und Inhaltsrevisionen ab.
