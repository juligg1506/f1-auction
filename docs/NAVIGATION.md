Die Navigation zeigt eigene Ansichten über URL-Fragmente: #dashboard, #rennergebnisse, #teams und #administration. Alte Anker für Ergebnisse, Teams und Administration bleiben gültig. Die Live-Auktion ist eine eigene Ansicht unter `#auktionen`, erreichbar über das Menü und den Dashboard-Zugang. Der alte Anker `#auction-section` führt ebenfalls dorthin. Dialoge sind außerhalb der ausgeblendeten Ansichten angeordnet.

Die Ergebnisansicht enthält Rennen, Fahrerwertung und Teamwertung. Dashboard zeigt Team-/Kontoinformationen, den Auktionszugang und letzte Transfers. Teams und Administration liegen in ihren eigenen Ansichten. Nicht-Admins erhalten keinen Admin-Menüpunkt; die API-Berechtigungen bleiben bestehen.

Neuladen und Browser-Zurück/Vorwärts erhalten die Ansicht. Ein gewähltes Ziel wird für den Discord-Login in sessionStorage festgehalten und nach dem OAuth-Callback wiederhergestellt. Öffentliche Seiten müssen weiterhin zunächst über Discord angemeldet werden, wie bisher.

Prüfung: python3 tests/navigation.browser.py (Python Playwright/Chromium, CHROMIUM_PATH optional). Die Rückkehr vom OAuth-Provider wird im Test simuliert; ein echter Discord-Login wird nicht automatisch ausgeführt. Die bestehenden Auktions- und Race-Browsertests wurden auf die neue Navigation angepasst.


Der Gebotsbereich bietet 250.000er-Schritte, Mindestgebot und einen zusätzlichen 1-Mio.-Schritt. Er zeigt den gewählten Betrag und das verbleibende Budget vor der unveränderten Bestätigung. Führt das eigene Team, ist kein weiteres Gebot möglich. Zuschauer sehen keine Gebotsregler. Der Fokus auf einem Regler und die Scrollposition im Gebotsverlauf bleiben bei Live-Aktualisierungen erhalten.
