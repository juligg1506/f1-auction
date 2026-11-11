# Startnummern über Discord

Im Kanal `1570008456981905460` auf dem Liga-Server `1542175377961648128` können Fahrer mit `!nummer 44` eine freie Startnummer von 1 bis 99 wählen. Die Nummer kann jederzeit geändert werden. Führende Nullen, Zusatzargumente und andere Zahlen sind ungültig. Eine erfolgreiche Änderung gibt die vorherige Nummer frei; eine abgelehnte Änderung verändert sie nicht. Ein erneuter Befehl mit derselben eigenen Nummer ist erlaubt.

Der Bot ordnet ausschließlich die Discord-ID des Nachrichtenautors zu. Das Konto muss als aktiver Fahrer vorliegen und aktuell die Fahrerrolle `1569398144998051890` besitzen. Es gibt keine Zuordnung anhand von Namen und keine Möglichkeit, mit einem Befehl die Nummer eines anderen Fahrers zu ändern. Bots, Webhooks, andere Kanäle und andere Nachrichtentypen werden ignoriert. Auch eine direkte Erwähnung des Bots vor dem Befehl ist möglich.

## Einrichtung

1. Vor der Migration einen D1-Time-Travel-Bookmark anlegen.
2. Migration `005_driver_numbers.sql` genau einmal auf die bestehende D1-Datenbank anwenden. Sie ergänzt das optionale Nummernfeld mit Werteprüfung und eindeutigem Index sowie Synchronisierungsstatus und Antwortwarteschlange. Bestehende Fahrer-, Team-, Ergebnis- und Budgetdaten werden erhalten.
3. Den Worker mit dem zusätzlichen Klartext-Binding `DISCORD_NUMBER_CHANNEL_ID=1570008456981905460` veröffentlichen. Alle vorhandenen Bindings, Secrets und Cron-Zeitpläne bleiben bestehen.
4. Beim Bot „Message Content Intent“ aktivieren. Er benötigt im Kanal „Kanal ansehen“, „Nachrichtenverlauf lesen“ und „Nachrichten senden“. Der Worker prüft diese Einstellungen, die Serverzugehörigkeit und den Kanaltyp vor dem Abruf.
5. `app.js` und `index.html` gemeinsam veröffentlichen.

Die vorhandene Minuten-Synchronisierung liest den Kanal über die Discord-REST-API. Kein zusätzlicher Gateway-Prozess ist nötig. Änderungen sind gewöhnlich nach etwa einer Minute auf dem Server verfügbar. Team- und Statistikansichten aktualisieren sich auf geöffneten, sichtbaren Seiten zusätzlich im Minutenabstand; ein Neuladen zeigt die Nummer sofort nach der Übernahme. Unter „Fahrerbereich“ gibt es eine Anleitung und einen Link zum Kanal. Nummern sind bei Teams, im geschützten Fahrerprofil und in den Fahrerstatistiken sichtbar. Der Admin-Bereich zeigt den letzten Abruf, Fehler und ausstehende Antworten.

## Verarbeitung und Fehlerfälle

Es werden nur Nachrichten ab Aktivierung der Migration übernommen. Alte Posts vergeben keine Nummern. Bereits verarbeitete Nachrichten werden bei späteren Änderungen am Text nicht erneut ausgewertet; Fahrer senden einen neuen Befehl.

Neue Nachrichten werden über bis zu zehn rückwärts geladene Seiten vollständig eingesammelt und anschließend nach Nachrichten-ID chronologisch verarbeitet. Bei mehr als 1.000 neuen Nachrichten bleibt der Cursor unverändert und die Verwaltung zeigt einen Fehler, damit keine Befehle stillschweigend verloren gehen. Eine Datenbank-Lease schützt gegen überlappende Cron-Aufrufe. Nummernvergabe, Ergebnisprotokoll und Cursorfortschritt werden in einem D1-Batch atomar gespeichert; abgelaufene oder überholte Bearbeiter dürfen nicht schreiben. Die Datenbank verhindert doppelte Nummern zusätzlich durch einen eindeutigen Index.

Der Bot antwortet im Kanal auf den Originalbefehl, ohne Nutzer- oder Rollen-Pings. Antworten werden dauerhaft vorgemerkt und bei HTTP-Fehlern erneut versucht. Discord-429-Wartezeiten werden berücksichtigt. Dieselbe Nonce verhindert doppelte Antworten innerhalb des Discord-Deduplizierungsfensters. Nach einem Absturz zwischen erfolgreichem Senden und Speichern kann außerhalb dieses Fensters eine Antwort nochmals erscheinen; die Nummer wird dadurch nicht erneut vergeben.

Fehler beim Abruf (fehlende Kanalrechte, fehlender Intent, API-Ausfälle und Rate Limits) verwerfen keine noch nicht verarbeiteten Befehle. Scheitert nur die Antwort auf einen bereits erfolgreich gespeicherten Befehl, bleibt die gewählte Nummer erhalten und die Antwort wird erneut versucht. Der Zustand wird über `GET /api/admin/number-sync` ausschließlich der Ligaleitung angezeigt. Der Kanal wird nur für den vorgesehenen Zweck gelesen; Nachrichteninhalte und Bot-Token werden nicht in Logs ausgegeben.

## Tests

```
node --check worker.js
node --check app.js
node tests/numbers.test.mjs
node tests/integration-server.mjs
# In einem weiteren Terminal:
python3 tests/numbers.browser.py
```

Die Worker-Tests verwenden SQLite und simulieren ausschließlich Discord-Antworten. Sie prüfen Änderung/Freigabe, belegte Nummern, Werteprüfung, Rollenprüfung, parallele Cron-Aufrufe, überholte Leases, Rate Limits, ausstehende Antworten, Seitennavigation und geschützte API-Zugriffe. Die Browser-Prüfung verwendet isolierte Nummern-Fixtures für vier Bildschirmbreiten. Sie sendet keine Discord-Nachrichten und verändert keine Produktivdaten.
