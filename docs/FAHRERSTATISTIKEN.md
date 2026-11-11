> Aktualisierung: Die Zugriffsregeln und Navigation wurden durch das [VTR-Ligaportal](LIGAPORTAL.md) ersetzt. Öffentlich sind Startseite, Kalender, Ergebnisse, Teams und Liga; individuelle Statistiken, Profile und Auktionen verlangen jetzt Discord-Anmeldung. Die folgenden Details zu Berechnung und bestehender Datenstruktur gelten weiter.

# Einstieg, Gastansichten und Fahrerstatistiken

## Zugang

Ohne aktive Discord-Session oder gewählten Gastmodus erscheint ausschließlich die Anmeldeauswahl (`#anmeldung`). Dashboard und Datenbereiche bleiben verborgen und werden erst nach Auswahl geladen. Die Gastwahl bleibt für den aktuellen Browser-Tab erhalten. Beim Umstieg auf diesen neuen Einstieg wird die frühere Dashboard-Gastmarkierung einmalig verworfen, damit die neue Auswahl sichtbar wird. Gültige Discord-Sessions bleiben erhalten.

„Als Gast fortfahren“ öffnet Dashboard, Live-Auktionen, Teams, veröffentlichte Rennergebnisse, Transfers und Fahrerstatistiken. Gäste erhalten keine Session-Tokens und keine Schreibrechte. „Zur Anmeldung“ beendet den lokalen Gastmodus und führt zur Auswahl zurück. Verwaltungsansichten und Entwurfsergebnisse sind weiterhin privat. Für einen Gast gibt es keine Gebots- oder Bearbeitungsregler. Die API verlangt für jeden bestehenden Schreibzugriff weiterhin eine gültige Discord-Session sowie Teamchef- oder Adminrechte.

Die bisherigen GET-Anmeldesperren für öffentliche Mitgliederdaten sind entsprechend dieser neuen Gastregel entfernt. `/api/me` und alle `/api/admin/*`-Routen bleiben geschützt. Die Eingangsauswahl ist eine Navigation, keine geheime Datensperre: öffentliche GET-Routen sind auch direkt lesbar.

## Fahrerstatistiken

Die Übersicht unter `#fahrerstatistiken` zeigt Fahrer mit ihrem aktuellen Team sowie Starts, Punkten, Siegen, Podien und bester Platzierung für die gewählte Saison/Meisterschaft. Im anklickbaren Fahrerprofil erscheinen zusätzlich Meisterschaftsrang, Top-10-Ergebnisse, Ausfälle, DNS, Disqualifikationen, durchschnittliche klassifizierte Platzierung, die letzten 50 veröffentlichten Rennergebnisse und die vorhandene Transferhistorie.

- Es zählen ausschließlich veröffentlichte Rennergebnisse der ausgewählten Saison. Entwürfe und reine Kalenderfreigaben zählen nicht.
- Rennstarts entsprechen eingetragenen Ergebnissen außer DNS. DNF und DSQ zählen als Start, erhalten aber nach den vorhandenen Ligaregeln keine Punkte/klassifizierte Platzierung.
- Podien, Top 10, Bestplatzierung und Durchschnitt werden ausschließlich aus klassifizierten Plätzen berechnet.
- Die Kennzahlen zählen alle veröffentlichten Saisonergebnisse; nur die angezeigte Rennhistorie ist auf die letzten 50 begrenzt.
- Ohne Resultate sind Mengen null, Platzierungen/Durchschnitt und Rang dagegen leer (`–`). Es werden keine Spieltelemetrie, Rundenzeiten oder echten F1-Fahrerdaten erfunden.
- Die Meisterschaftsränge verwenden die bestehende Wertung mit Platzierungsvergleich bei Punktegleichstand.
- Historische Ergebnisse behalten ihr damaliges Team; das aktuell angezeigte Fahrerteam darf davon abweichen.

Nach Discord-Anmeldung liefert `/api/me` das über `drivers.discord_id` zugeordnete Fahrerprofil. „Deine Statistiken“ und „Mein Fahrerprofil öffnen“ verwenden ausschließlich diese serverseitige Zuordnung. Namen oder vom Browser übergebene Fahrer-IDs entscheiden keine Identität. Konten ohne Fahrerzuordnung sehen die allgemeine Übersicht und einen Hinweis, aber kein erfundenes eigenes Profil. Die übrigen veröffentlichten Fahrerstatistiken sind auch für Gäste sichtbar.

## API und Deployment

Neu: `GET /api/driver-stats?season=2026`. `GET /api/drivers/:id?season=2026` ergänzt `statistics`, `season`, `seasons` und `raceResults` neben den bisherigen Fahrer- und Transferdaten. `GET /api/me` ergänzt `driver`, ohne fremde Discord-IDs zu veröffentlichen. `/api/features` meldet `guestReadOnly: true` und `driverStatistics: true`.

Keine neue Datenbankmigration erforderlich: Migrationen 001–003 bleiben Voraussetzung. Worker-Code und Frontend gemeinsam aktualisieren. Vorhandene Bindings, Secrets, Discord-Einstellungen und Cron-Trigger erhalten. Für einen Rückweg die vorherige Worker-Version und den zugehörigen Frontend-Commit verwenden; es wurden keine Statistiktabellen oder Ergebnisdaten verändert.

## Tests

`node tests/worker.test.mjs` umfasst alle bisherigen Geld-/Auktions-/Ergebnisfälle sowie öffentliche Gast-Lesezugriffe, verweigerte Gast-Schreib-/Adminzugriffe, geschützte Entwürfe, Statistikwerte, DNS/DNF/DSQ, Nullzustände, Saisonfilter und eigene Fahrerzuordnung über Discord-ID.

Für integrierte Browserprüfungen zuerst `node tests/integration-server.mjs` starten. Dieser führt die isolierten Tests aus und fügt ausschließlich in seiner temporären SQLite-Datenbank eine aktive Testauktion ein. Danach `python3 tests/guest-statistics.browser.py` ausführen. Die Browserprüfung deckt den reinen Einstieg, lesende Gastansichten, fehlende Schreibregler, Fahrerprofile, eigene Statistiken, Saisonwechsel und nicht zugeordnete Konten bei 1440/820/390/320 Pixeln ab. Keine echten Discord-Nachrichten, Gebote oder Rennen werden angelegt.
