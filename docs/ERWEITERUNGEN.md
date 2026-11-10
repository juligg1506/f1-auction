# F1 Auction – Erweiterungen

**Aktueller Hinweis:** Das öffentliche Dashboard und die Kalenderfreigabe sind in [OEFFENTLICHES_DASHBOARD.md](OEFFENTLICHES_DASHBOARD.md) dokumentiert. `worker.js` enthält inzwischen auch Rennergebnisse. Vor dessen Veröffentlichung zusätzlich Migrationen `002_race_results.sql` und `003_public_calendar.sql` anwenden; Ablauf und Regeln stehen in [RENNERGEBNISSE.md](RENNERGEBNISSE.md).

## Stand

Frontend und Worker-Code sind implementiert und lokal getestet. Die Worker-Veröffentlichung und die D1-Migration müssen im Cloudflare-Konto erfolgen. Bis dahin funktioniert das Frontend mit der bisherigen API; noch nicht angebotene Historien werden als nicht verfügbar angezeigt. Es gibt keine simulierten Transfers oder Gebote.

Enthalten: letzte 50 erfolgreiche Transfers, letzte 100 Gebote der aktiven Auktion, Überboten-Hinweis in der geöffneten Website, 15-Sekunden-Verlängerung, Fahrerprofile mit Team und Transfers, Admin-Auktionsplanung, Discord-Meldungen für Start/Ende. Überboten-Hinweise werden beim nächsten Polling erkannt (ungefähr drei Sekunden); sie sind keine Push-Nachrichten bei geschlossener Website.

## Reihenfolge für die Veröffentlichung

1. In Cloudflare D1 die Datenbank `f1-auction-db` öffnen und `preflight.sql` in der Konsole ausführen. Die tatsächlichen Tabellen, Indizes und Trigger gegen die unten beschriebene Struktur prüfen. Bei Abweichungen erst den Code anpassen. Mit dieser Abfrage werden keine Daten verändert.
2. Vor der Migration einen D1-Export/Backup anlegen und die aktive Worker-Version sichern. Den ursprünglichen Worker separat sichern; die produktive Cloudflare-Version enthält den maßgeblichen bisherigen Stand. Aktive Bindings und Secrets unverändert lassen.
3. `migrations/001_auction_features.sql` auf derselben Datenbank ausführen. Das Skript ergänzt nur `auction_queue`, `auction_notifications` und deren Indizes. Es löscht keine Daten und setzt keine Budgets zurück. Es kann wiederholt ausgeführt werden.
4. Im Worker `f1-auction-api` den Code durch `worker.js` ersetzen und deployen. Bestehende D1-Bindung `DB`, KV-Bindung `SESSIONS`, OAuth-Secrets, `ADMIN_DISCORD_ID`, `DISCORD_BOT_TOKEN` und den Cron `* * * * *` erhalten. Bestehende OAuth-Redirect-URL nicht verändern.
5. Für Discord zusätzlich die Variable `DISCORD_AUCTION_CHANNEL_ID` auf die ID des gewünschten Server-Kanals setzen. Den bestehenden Bot in diesem Kanal zum Anzeigen und Senden von Nachrichten berechtigen. Der Bot-Token bleibt ein Cloudflare-Secret; kein Token und keine Webhook-URL gehören in GitHub oder den Browser. Ohne Kanal-ID laufen die übrigen Funktionen weiter, Nachrichten bleiben zunächst unversendet in der Datenbank.
6. `GET /api/features` muss `version: 2` und `antiSnipeSeconds: 15` liefern. `discordConfigured` prüft nur, ob Token und Kanal-ID eingetragen sind, nicht die Discord-Berechtigungen. `GET /api/transfers` muss ein JSON-Array liefern. Nach Anmeldung die Website neu laden; Admin-Planung und die neuen Anzeigen werden automatisch aktiviert.

Keine Live-Testgebote für die Verifikation nötig: Geldbewegungen und konkurrierende Gebote wurden mit einer isolierten SQLite-Datenbank getestet. Im Produktivsystem zunächst bestehende Daten nur ansehen. Teamchef-Namen erscheinen nach der nächsten Anmeldung des jeweiligen Teamchefs, sofern der Profilcache vorhanden ist.

## Voraussetzungen aus dem bestehenden Worker

- `teams`: id, name, budget, owner_discord_id
- `drivers`: id, name, team_id, discord_id (UNIQUE), discord_active
- `auctions`: id, driver_id, starting_price, ends_at, status (`active` / `ended`), leading_bid_id
- `bids`: id (monoton steigender ganzzahliger Primärschlüssel), auction_id, team_id, amount, created_at
- Datumswerte wie im bisherigen Worker als ISO-UTC; Abschlussvergleiche laufen mit SQLite-Datumsfunktionen.
- Bestehende Tabellen dürfen weitere Spalten haben, sofern zusätzliche Pflichtfelder beim bisherigen INSERT bereits einen Default haben. Trigger auf Geldbewegungen müssen vorab geprüft werden.

## Verhalten

- Ein Gebot verwendet den tatsächlich gewählten Betrag. Er muss mindestens das aktuelle Mindestgebot erreichen und im Raster von 250.000 Coins relativ zum Startpreis liegen. Eigene Höchstgebote können nicht erhöht werden. Admins mit zugeordnetem Team dürfen bieten, Zuschauer nicht.
- Prüfung, Abbuchung, Rückerstattung, Gebotsspeicherung und Verlängerung bilden eine D1-Batch-Transaktion. Ein veraltetes Höchstgebot führt zum Rollback. Die Frist wird innerhalb der Transaktion gegen Datenbankzeit geprüft.
- Wenn weniger als 15 Sekunden übrig sind, wird die Restzeit bei einem gültigen Gebot auf 15 Sekunden gesetzt. Bei mehr Restzeit bleibt sie unverändert. Es gibt keine Verlängerung für abgelehnte Gebote.
- Der Abschluss prüft den gelesenen Höchstgebotszeiger nochmals atomar. Eine zwischenzeitliche Verlängerung verhindert den veralteten Abschluss. Ohne Gebote bleibt die bestehende Teamzuordnung erhalten.
- Die Planung startet frühestens zum gewählten Termin, sobald keine Auktion aktiv ist. Der minütliche Cron kann den Start verzögern. Pro Cron wird höchstens eine Auktion gestartet. Bereits verpflichtete aktive Fahrer können erneut versteigert werden. Bei Überschneidungen gilt Termin, dann Eintrags-ID. Der Gerätetermin wird im Browser in UTC gespeichert; Listen zeigen Europe/Berlin an.
- Inaktive Fahrer in der Warteschlange werden übersprungen, bis sie wieder aktiv sind oder ein Admin sie entfernt. Entfernen und Start sind gegen gleichzeitige Aktionen abgesichert.
- Historische Transfers werden aus beendeten Auktionen mit Gewinner ermittelt. Sie enthalten Gewinner und Preis, keine erfundene Herkunftsmannschaft. Die angezeigte Zeit ist die gespeicherte Auktionsfrist, nicht der eventuell spätere Cron-Abschluss. Spätere Umbenennungen von Teams/Fahrern erscheinen auch in der Historie, weil die vorhandenen IDs verknüpft werden.

## Discord-Versand

Eine dauerhaft gespeicherte Ereignis-ID pro Start/Ende verhindert doppelte Erzeugung. Ein Lease schützt parallele Versandversuche. Discord-Nonces reduzieren doppelte Nachrichten bei unmittelbaren Wiederholungen. Nach API-Fehlern folgen bis zu zwölf Versuche mit Wartezeiten; Discord-429-Wartezeiten werden berücksichtigt. Absolut genau einmaliger Versand ist über die externe API nicht garantiert: Bei erfolgreicher Zustellung und anschließendem Datenbankfehler kann nach Ablauf des Discord-Deduplizierungsfensters eine Wiederholung sichtbar sein.

Fehlgeschlagene Nachrichten nach zwölf Versuchen können nach Behebung der Kanalrechte gezielt erneut freigegeben werden. Zuerst nur ansehen:

```sql
SELECT event_key, event_type, attempts, next_attempt_at, sent_at
FROM auction_notifications WHERE sent_at IS NULL;
```

Die Versandfunktion sendet keine Rollen-/Everyone-Mentions (`allowed_mentions.parse = []`). Es werden keine Discord-Nachrichten während der lokalen Tests versendet.

## Prüfung

Worker-Routen wurden über einen D1-Adapter mit echten SQLite-Transaktionen geprüft: Berechtigungen, genaue Gebotsbeträge, Rückerstattungen, konkurrierende Gebote, konsistente Geldsumme, Verlängerung, veralteter Abschluss, wiederholter Cron, Reauktion ohne Gebote, Transfer- und Profilabfragen, Warteschlange und Discord-Fehler/Wiederholungen.

Browserprüfungen mit isolierten API-Testdaten: 1440, 820, 390 und 320 Pixel, Admin/Zuschauer, bisherige API ohne neue Routen, Fahrerprofil im Auktionsdialog, Überboten-Hinweis, tatsächlicher POST-Betrag, Planung und Entfernen. Ein echter Discord-OAuth-Login und Cloudflare-D1-Deployment sind damit nicht getestet.

## Rückweg

Bei Problemen die gesicherte Worker-Version wieder aktivieren. Neue Tabellen zunächst belassen; sie beeinträchtigen den alten Worker nicht. Keine Budgets oder Gebote manuell zurücksetzen. Das kompatible Frontend funktioniert weiterhin mit dem alten Worker, zeigt aber keine nicht vorhandenen Erweiterungen.

## Tests erneut ausführen

Voraussetzungen: Node.js mit Web-APIs, Python 3 mit SQLite. Für Browserprüfungen zusätzlich Python Playwright und Chromium (nur Entwicklungswerkzeuge).

```sh
node tests/worker.test.mjs
python3 tests/frontend.test.py
```

Die Browserprüfung verwendet standardmäßig `/usr/bin/chromium`; `CHROMIUM_PATH` kann auf eine andere Chromium-Installation zeigen. Alle Schreibzugriffe und Discord-Aufrufe der Tests verwenden isolierte Daten bzw. Testantworten.


