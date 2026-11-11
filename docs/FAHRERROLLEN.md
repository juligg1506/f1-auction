# Fahrerrolle als aktueller Fahrerstatus

Die Minuten-Synchronisierung liest sämtliche Discord-Servermitglieder und gleicht die Rolle `1569398144998051890` ab. Nur Personen mit dieser Rolle werden als aktive Discord-Fahrer geführt. Ein Entzug der Rolle oder ein Verlassen des Servers setzt `discord_active=0`; eine spätere Rollenvergabe reaktiviert denselben Datensatz mit bisheriger Teamzuordnung und Startnummer.

Die vollständige, validierte Mitgliederliste wird vor allen Schreibzugriffen geladen. Fehler, ungültige Antworten, fehlende Seiten und eine Antwort ohne den eigenen Bot führen zu keiner Deaktivierung. Eine tatsächlich vollständige Liste mit Bot, aber ohne Fahrerrollen, darf alle Discord-Fahrer deaktivieren. Ein D1-Batch aktualisiert Rollenstatus, Rückzahlungen und Auktionsstatus gemeinsam. Manuelle Datensätze ohne Discord-ID werden nicht anhand einer unbekannten Discord-Identität gelöscht oder verändert.

Aktuelle Fahrerlisten, Teamkader, Fahrerstatistiklisten, eigene Fahrerzuordnung und direkte Fahrerprofile zeigen nur aktive Fahrer. Veröffentlichte Rennergebnisse, historische Wertungen und Transfers werden nicht gelöscht. Die Verwaltung behält notwendige historische Auswahlmöglichkeiten für Ergebniskorrekturen.

Geplante Auktionen deaktivierter Fahrer werden storniert. Noch laufende Auktionen werden abgebrochen und das aktuelle führende Gebot atomar an das führende Team zurückgebucht. Wiederholte Synchronisierungen zahlen nicht erneut zurück. Bereits abgeschlossene Auktionen werden nicht rückwirkend aufgehoben. Die bisherige Startnummer und Team-ID bleiben intern erhalten; es handelt sich nicht um eine Löschung persönlicher Daten.

Die API übernimmt Änderungen gewöhnlich nach etwa einer Minute. Geöffnete Team- und Statistikansichten aktualisieren sich zusätzlich regelmäßig. Die eigene Zuordnung wird beim Login-Heartbeat nachgeladen. Im Auktions-/Verwaltungsbereich werden Fahreroptionen im Minutenabstand erneuert. Neuladen zeigt den aktuellen Serverstand. `driver_sync_status` in Workers KV enthält nur Prüfzeitpunkt und aktive Anzahl für die technische Kontrolle, ohne Namen oder Discord-IDs.

Keine Datenbankmigration. Tests: `node tests/driver-role.test.mjs`. Die isolierten Tests prüfen Entfernen/Wiedervergeben der Rolle, ausgeblendete Profile, erhaltene Historie, Auktionsabbruch und einmalige Rückzahlung, leere/ungültige/unvollständige Discord-Antworten und mehrseitige Listen. Es werden keine echten Discord-Rollen oder Produktivgebote verändert.
