Die Navigation zeigt eigene Ansichten über URL-Fragmente: #dashboard, #rennergebnisse, #teams und #administration. Alte Anker für Ergebnisse, Teams und Administration bleiben gültig. Die Live-Auktion bleibt ein Dialog, der aus jeder Ansicht geöffnet werden kann. Dialoge sind außerhalb der ausgeblendeten Ansichten angeordnet.

Die Ergebnisansicht enthält Rennen, Fahrerwertung und Teamwertung. Dashboard zeigt Team-/Kontoinformationen, den Auktionszugang und letzte Transfers. Teams und Administration liegen in ihren eigenen Ansichten. Nicht-Admins erhalten keinen Admin-Menüpunkt; die API-Berechtigungen bleiben bestehen.

Neuladen und Browser-Zurück/Vorwärts erhalten die Ansicht. Ein gewähltes Ziel wird für den Discord-Login in sessionStorage festgehalten und nach dem OAuth-Callback wiederhergestellt. Öffentliche Seiten müssen weiterhin zunächst über Discord angemeldet werden, wie bisher.

Prüfung: python3 tests/navigation.browser.py (Python Playwright/Chromium, CHROMIUM_PATH optional). Die Rückkehr vom OAuth-Provider wird im Test simuliert; ein echter Discord-Login wird nicht automatisch ausgeführt. Die bestehenden Auktions- und Race-Browsertests wurden auf die neue Navigation angepasst.
