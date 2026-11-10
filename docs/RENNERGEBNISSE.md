# Rennergebnisse und Meisterschaftswertungen

## Umfang

Admins können Rennen als Entwurf anlegen, Fahrer und ihre Rennteams eintragen, veröffentlichen, korrigieren und wieder als Entwurf speichern. Gäste und angemeldete Zuschauer sehen veröffentlichte Ergebnisse und Fahrer-/Teamwertungen. Bestehende Auktionen, Budgets, Discord-Ankündigungen und Teamzuordnungen bleiben erhalten.

Punkte für klassifizierte Plätze 1–10: **25, 18, 15, 12, 10, 8, 6, 4, 2, 1**. Keine Zusatzpunkte und kein separates Sprint-Punktesystem. DNF, DNS und DSQ sind ohne Platz und erhalten null Punkte. Soll ein ausgeschiedener Fahrer dennoch klassifiziert werden, wird er mit „Klassifiziert“ und seiner offiziellen Platzierung eingetragen.

Saison/Meisterschaft ist ein frei wählbares Label (z. B. `2026` oder `2026 T1`). Nur Rennen desselben Labels werden gemeinsam gewertet. Teams werden pro Ergebnis ausdrücklich gewählt und mit ihrem Namen gespeichert; die aktuelle Teamzuordnung dient nur als Vorauswahl bei neuen Zeilen. Bei historischen Rennen muss der Admin das damalige Team prüfen. Spätere Auktionen und Umbenennungen verschieben alte Ergebnisse nicht.

Punktgleichheit wird durch die Anzahl erster, zweiter und weiterer klassifizierter Plätze aufgelöst. Bei vollständig gleichen Ergebnissen wird der Rang geteilt (z. B. 1, 1, 3); alphabetische Anzeige innerhalb des geteilten Rangs entscheidet keine Meisterschaft.

## Cloudflare-Aktivierung

1. In D1 `f1-auction-db` in der Konsole `/bookmark` ausführen und den aktuellen Wiederherstellungspunkt notieren. Die aktive Worker-Version ebenfalls erhalten.
2. `migrations/002_race_results.sql` in derselben Datenbank ausführen. Voraussetzung: Die bestehenden Tabellen `drivers` und `teams` sind vorhanden; für die bereits gelieferten Auktionsfunktionen muss Migration 001 angewandt sein. Migration 002 ergänzt nur `races`, `race_results` und Indizes. Sie verändert weder Budgets noch bisherige Auktionsdaten.
3. Den aktualisierten `worker.js` in `f1-auction-api` einfügen und deployen. Alle vorhandenen Bindings, Secrets, Kanal-ID und Cron beibehalten. Keine zusätzlichen Cloudflare-Secrets erforderlich. Für den aktuellen Worker außerdem Migration 003 anwenden; siehe `OEFFENTLICHES_DASHBOARD.md`.
4. `GET /api/features` muss `raceResults: true` liefern. Frontend neu laden, mit Discord anmelden. Der Ergebnisbereich erscheint bei allen angemeldeten Nutzern; die Eingabe befindet sich im Adminbereich unter „Rennen anlegen“.
5. Ein neu angelegtes Rennen ist ein Entwurf und zählt noch nicht. Nach der Eingabe „Ergebnisse veröffentlichen“ wählen. Fehler oder Sanktionen über „Ergebnisse bearbeiten“ korrigieren. „Veröffentlichung zurücknehmen“ nimmt das Rennen aus der Wertung, erhält aber die Eingaben als Entwurf.

Keine Live-Testdaten wurden durch die Entwicklung eingetragen. Die Race-API wurde ausschließlich mit isolierten Testdaten geprüft. Ob der neue Worker in Cloudflare läuft, ist gesondert über die öffentliche API zu prüfen.

## Datenintegrität

- Schreibzugriffe prüfen die Admin-Session auf dem Server. Teamchefs ohne Adminrecht und Zuschauer dürfen nicht schreiben.
- Punktwerte kommen ausschließlich vom Server. Übermittelte Punkte werden ignoriert.
- Pro Rennen sind höchstens 60 Fahrer erlaubt. Jeder Fahrer und jeder klassifizierte Platz darf nur einmal vorkommen. Team- und Fahrer-IDs sowie Status, Datum und Saison werden geprüft.
- Ein Rennen mit gleichem Saisonlabel, Namen (ASCII-Groß-/Kleinschreibung ignoriert) und Datum kann nur einmal angelegt werden.
- Speichern ersetzt die Ergebnisliste atomar. Die Tabellen werden bei einer Korrektur neu aus den veröffentlichten Ergebnissen berechnet; es wird nichts auf bestehende Punktestände addiert.
- Jede Änderung erhöht eine Revisionsnummer. Ein veralteter Editor erhält einen Konflikt; seine Eingaben bleiben sichtbar, statt neuere Daten zu überschreiben. Das Rennen anschließend schließen und neu öffnen, um den aktuellen Stand zu laden.
- Die Ergebnisliste kann auf kleinen Displays seitlich gescrollt werden. Nicht gespeicherte Änderungen werden beim Schließen verworfen.

## Neue Routen

Öffentlich lesbar für den Gastzugang: `GET /api/races?season=2026`, `GET /api/races/:id`. Für das Dashboard: `GET /api/standings?season=2026` und `GET /api/calendar?season=2026`. Entwurfsergebnisse bleiben privat; Kalenderdaten eines Entwurfs können separat freigegeben werden. Siehe [OEFFENTLICHES_DASHBOARD.md](OEFFENTLICHES_DASHBOARD.md).

Nur Admin: `GET /api/admin/races/options`, `GET /api/admin/races?season=2026`, `GET /api/admin/races/:id`, `POST /api/admin/races` (Entwurf anlegen), `POST /api/admin/races/:id` (vollständige Ergebnisliste mit Header, Status und Revision speichern).

## Tests

`node tests/worker.test.mjs` prüft die bisherigen Auktionsfälle sowie Race-Berechtigungen, Entwürfe, Veröffentlichungen, ungültige/doppelte Eingaben, exakte Punkte, historische Teamnamen, Teamwechsel, Saisonfilter, Gleichstände, Korrekturen, Zurücknehmen und konkurrierende Speicherungen.

Für den integrierten Browsertest im ersten Terminal `node tests/integration-server.mjs` starten und auf `INTEGRATION SERVER READY` warten. Im zweiten Terminal `python3 tests/races.browser.py` ausführen. Voraussetzungen wie in `ERWEITERUNGEN.md`; `CHROMIUM_PATH` kann den Chromium-Pfad ändern. Der Server bindet nur an 127.0.0.1:8128 und verwendet eine isolierte SQLite-Datenbank und Test-Sessions. Die Browseraufrufe der Worker-API werden vollständig dorthin umgeleitet. Es werden keine echten Gebote oder Discord-Nachrichten versendet.

## Rückweg

Bei Problemen die vorherige Cloudflare-Worker-Version wieder aktivieren. Neue Tabellen zunächst belassen. Das Frontend erkennt den bisherigen Worker ohne Ergebnisfunktion und blendet die Eingabe aus; Auktionen funktionieren weiter. Ein kompletter Datenbank-Restore würde auch andere seit dem Bookmark erfolgte Änderungen zurücksetzen und ist kein regulärer Schritt dieser Erweiterung.


