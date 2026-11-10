# Ansichten und Navigation

Die Anwendung verwendet `#dashboard`, `#auktionen`, `#rennergebnisse`, `#teams` und `#administration`. Alte Anker für Auktionen, Ergebnisse, Teams und Administration werden weiter unterstützt.

Gäste sehen nur das öffentliche Dashboard mit Fahrerwertung, Teamwertung und Rennkalender. Andere Menüpunkte sind ausgeblendet; direkte Links werden auf `#dashboard` umgeleitet. Nach erfolgreicher Discord-Anmeldung erscheinen die Mitgliederbereiche. Ein vorhandener gültiger Login erhält seine gewählte Ansicht beim Neuladen. Nicht-Admins sehen keine Administration.

Auktionen haben eine eigene Ansicht. Gebotsregler bieten 250.000er-Schritte, Mindestgebot und einen 1-Mio.-Schritt, Budgetvorschau und eine Bestätigung vor dem Absenden. Führt das eigene Team, sind weitere Gebote gesperrt. Fokus und Scrollposition des Gebotsverlaufs bleiben bei Live-Aktualisierungen erhalten.

Neuladen sowie Browser-Zurück/Vorwärts erhalten die Ansicht, soweit der Anmeldestatus den Zugriff erlaubt. Beim Login aus dem öffentlichen Dashboard kehrt man zum Dashboard zurück. Die API prüft den Sessionzugriff unabhängig von ausgeblendeten Menüpunkten.

Siehe [OEFFENTLICHES_DASHBOARD.md](OEFFENTLICHES_DASHBOARD.md) für den öffentlichen Kalender und seine Datenfreigabe.

Die Discord-Anmeldung steht als großer zentraler Button auf dem Dashboard. Oben rechts gibt es für Gäste keinen Login-Button. „Als Gast fortfahren“ merkt den Gastmodus für den aktuellen Browser-Tab und klappt die Anmeldeauswahl ein; „Zur Anmeldung“ öffnet sie wieder. Der Gastmodus erstellt keine Discord-Session und erweitert keine Rechte. Gäste bleiben auf dem öffentlichen Dashboard. Nach einer erfolgreichen Discord-Anmeldung wird die Gastmarkierung gelöscht; angemeldete Nutzer behalten den Abmelden-Button.

Prüfung der Auswahl: `python3 tests/login-choice.browser.py` (Python Playwright/Chromium, optional `CHROMIUM_PATH`). Die OAuth-Rückkehr wird mit isolierten Browserdaten simuliert; kein echter Discord-Login oder Produktivschreibzugriff wird ausgeführt.

