# Zugang nur für Discord-Servermitglieder

Die Liga-Inhalte erfordern eine Anmeldung mit einem Konto, das zum Discord-Server `1542175377961648128` gehört. Eine zusätzliche Fahrer- oder Teamchefrolle ist für den allgemeinen Zugang nicht erforderlich. Besondere Schreibrechte für Teamchefs und Ligaleitung bleiben unverändert.

## Serverprüfung

Beim OAuth-Callback wird über `users/@me/guilds/:guild/member` ausdrücklich zwischen fehlender Mitgliedschaft und einer Mitgliedschaft ohne Teamrolle unterschieden. Nur nach erfolgreicher Mitgliedschaftsprüfung wird eine Sitzung angelegt. Abgewiesene Nichtmitglieder erhalten keine Sitzung. Gespeichert werden eine Zugriffspolicy-Version, die bestätigte Server-ID, der Prüfzeitpunkt und das absolute Sitzungsende.

Alle `/api/`-Routen mit Liga-Inhalten prüfen die Sitzung zentral vor der Routenlogik. Nur das Abmelden bleibt ohne Mitgliedschaft möglich. `OPTIONS` enthält keine Ligadaten und bleibt für CORS verfügbar. Vor der Umstellung erstellte Sitzungen ohne neue Mitgliedschaftsbestätigung werden zurückgewiesen; jeder muss sich einmal neu anmelden.

Nach Ablauf einer maximal 15 Sekunden alten positiven Bestätigung prüft der Worker die aktuelle Mitgliedschaft über den bestehenden Bot. Der positive KV-Cache besitzt technisch 60 Sekunden TTL, wird aber nur akzeptiert, solange sein Prüfzeitpunkt weniger als 15 Sekunden zurückliegt. Er verlängert die eine Stunde gültige Sitzung nicht. Bei Serveraustritt oder Ausschluss wird der Zugriff verweigert und die verwendete Sitzung gelöscht. Fehler oder Rate Limits bei einer erforderlichen Prüfung führen zu HTTP 503 statt zu einer Freigabe.

Im sichtbaren Browser wird `/api/me` alle 15 Sekunden und bei Rückkehr zum Tab geprüft. Bei Verlust der Bestätigung wird die Anwendung gesperrt und ein geöffneter Twitch-Player entfernt. Browser können Hintergrund-Timer drosseln; der verbindliche Schutz liegt deshalb immer bei den API-Prüfungen. Bereits zuvor empfangene Inhalte können technisch nicht rückwirkend ungesehen gemacht werden.

## Oberfläche und Grenzen

Ohne Sitzung erscheint nur die Discord-Anmeldeseite; Gastzugang und anonyme Liga-API-Aufrufe entfallen. Alle Mitglieder können Startseite, Kalender, Ergebnisse, Liga, Teams und Livestream verwenden. Nach der Anmeldung wird das angefragte Ziel wiederhergestellt. Twitch benötigt weiterhin eine separate Zustimmung.

GitHub Pages liefert weiterhin die öffentliche statische Anmeldeseite, Anwendungsdateien und Bilder. Das öffentliche GitHub-Repository wird durch diese Änderung nicht privat. Die Zugangskontrolle schützt dynamische Liga-Daten und Funktionen; sie ist keine Geheimhaltung der bereits veröffentlichten Quelldateien. Wenn auch die statische Auslieferung nur nach Authentifizierung erfolgen soll, ist eine zusätzliche geschützte Hosting-Lösung nötig.

Impressum und Datenschutzhinweise müssen nach Ergänzung der tatsächlichen Betreiberangaben über eigenständige öffentlich erreichbare Seiten verlinkt werden. Eine Mitgliederbeschränkung ersetzt diese Angaben nicht. Bislang vorbereitete Entwürfe werden nicht als fertige Rechtstexte ausgegeben.

## Betrieb und Prüfung

Keine Datenbankmigration. Vor Upload Worker sichern; alle vorhandenen Bindings, Secrets und Cron-Zeitpläne beibehalten. `worker.js`, `app.js` und `index.html` zusammen veröffentlichen. Ohne funktionierenden Bot und dessen Servermitgliedschaft kann nach Ablauf der kurzen Bestätigung kein weiterer Zugriff bestätigt werden.

```
node --check worker.js
node --check app.js
node tests/members.test.mjs
node tests/numbers.test.mjs
node tests/integration-server.mjs
# In einem zweiten Terminal:
python3 tests/members.browser.py
```

Die Tests simulieren OAuth und Discord, prüfen Rollenfreiheit des allgemeinen Zugangs, Nichtmitglieder, Austritte, alte Sitzungen, API-Ausfälle, den kurzen Cache und vier Bildschirmbreiten. Der frühere Test `portal.browser.py` mit anonymem Liga-Zugang wird durch `members.browser.py` ersetzt. Gebots-, Ergebnis- und Startnummernprüfungen bleiben erhalten.
