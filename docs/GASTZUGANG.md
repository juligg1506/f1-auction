# Wiederhergestellter Gastzugang

Auf der Einstiegsseite gibt es wieder „Mit Discord anmelden“ und „Als Gast fortfahren“. Die Gastwahl wird nur für den Browser-Tab im Session Storage gespeichert. Gäste können Startseite, Kalender, veröffentlichte Ergebnisse und Wertungen, Teams, Liga-Inhalte und Livestream ansehen. Sie müssen dazu nicht Mitglied des Discord-Servers sein.

Persönliche Fahrerbereiche, weiterführende Fahrerstatistiken, Auktionen und die Verwaltung bleiben an die Anmeldung gebunden. Gebote und Verwaltungsänderungen sind niemals über den Gastmodus möglich. Für angemeldete Funktionen bleibt die bestehende Prüfung der Discord-Mitgliedschaft bestehen. Es gibt keinen allein durch eine Browservariable gewährten API-Schreibzugriff.

Der Worker lässt ausschließlich anonyme GET-Anfragen auf `/api/teams`, `/api/league`, `/api/calendar`, `/api/standings`, `/api/races`, `/api/races/:id` und `/api/features` öffentlich zu. Rennen-Entwürfe bleiben verborgen. Team-Budgets werden anonym nicht geliefert. Sobald ein Authorization-Header mitgesendet wird, wird auch für diese Routen die Sitzung geprüft, damit ungültige oder ausgeschiedene Konten keine privaten Budgetangaben erhalten. Andere API-Routen und alle Schreiboperationen bleiben geschützt.

Cookie-Auswahl, Twitch-Einwilligung, Impressumsseite und bestehende Inhalte bleiben erhalten. Twitch kann auch als Gast angesehen werden, lädt aber erst nach Zustimmung. Ohne Gastwahl oder Anmeldung zeigt die Anwendung nur den Einstieg und ruft keine Liga-APIs ab.

Keine Datenbankmigration. Alle bestehenden Worker-Bindings und Cron-Zeitpläne bleiben erhalten. SERVERZUGANG.md beschreibt weiterhin die Sitzungsprüfung für angemeldete Funktionen; seine frühere Aussage, dass alle Liga-Ansichten und APIs ausschließlich für Servermitglieder zugänglich seien, ist durch diese Änderung aufgehoben.

Prüfung: `node tests/worker.test.mjs`, `node tests/members.test.mjs`; anschließend `node tests/integration-server.mjs` und in einem zweiten Terminal `python3 tests/guests.browser.py`.
