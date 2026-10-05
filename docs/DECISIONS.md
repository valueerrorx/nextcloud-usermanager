# Entscheidungen

Eine Zeile pro Entscheidung. Quelle der Wahrheit für Architekt, Coder und Tester.

| Datum | Frage | Antwort |
|---|---|---|
| 2026-10-05 | Pfad des Referenzprojekts "Microsoft 365 Users" | `/home/valueerror/Nextcloud/WebDEV/Microsoft365-Manager` (read-only), UPN-Logik in `src/utils/upn.js` + Kopie in `index.js` |
| 2026-10-05 | Wofür wird das Geburtsdatum aus der CSV verwendet? | Zwei Zwecke: (a) Bildung des Initialpassworts, (b) Auflösung von Username-Kollisionen |
| 2026-10-05 | Wie wird das Initialpasswort gebildet? | `<Prefix><ddmmyyyy><Sonderzeichen>`, Prefix im Import-Dialog eingebbar (z. B. `Schule01012010!`). Erfüllt Nextcloud-Default (min. 10 Zeichen) |
| 2026-10-05 | Wie wird das Initialpasswort verteilt? | Nur über den CSV-Ergebnis-Export (Username + Initialpasswort) an den Admin. Keine Mail, kein Logging |
| 2026-10-05 | Wird beim CSV-Import eine E-Mail gesetzt? | Nein. E-Mail-Feld bleibt leer |
| 2026-10-05 | Username-Format des Generators | Ohne Domain. Reihenfolge im Import-Dialog umschaltbar: `vorname.nachname` oder `nachname.vorname` (wie `upnOrder` im Referenzprojekt) |
| 2026-10-05 | Auflösung von Username-Kollisionen | Volles Geburtsdatum anhängen: `vorname.nachname.ddmmyyyy`. Eindeutigkeit gegen bestehende Nextcloud-User UND innerhalb der Importdatei |
| 2026-10-05 | Erwartetes Geburtsdatums-Format in der CSV | Beide akzeptiert: `dd.mm.yyyy` und `yyyy-mm-dd`. Alles andere ist ein Zeilenfehler |
| 2026-10-05 | Platzhalter `__M365_PATH__` in CLAUDE.md | Darf durch den echten Pfad ersetzt werden |
| 2026-10-05 | Anzeigename-Format importierter User | `Vorname Nachname` in Originalschreibweise aus der CSV (inkl. Umlaute) |
| 2026-10-05 | Platzhalter `__M365_PATH__` in `.claude/settings.json` | Durch echten Pfad ersetzt — Referenzprojekt ist jetzt lesbar und per deny-Regel schreibgeschützt |
| 2026-10-05 | Abruf der Userliste | `GET /cloud/users/details` (Bulk) mit automatischem Fallback auf Einzelabfragen, da Pfad/Shape nicht offiziell belegt sind |
| 2026-10-05 | Vergleich bei Username-Kollisionen | Case-insensitiv, weil Nextcloud Groß-/Kleinschreibung bei User-IDs inkonsistent behandelt (Issues #10814, #20011) |
| 2026-10-05 | Abnahme gegen echte Nextcloud | Nutzer testet manuell. Entwicklung gegen dokumentierte OCS-API + gemockte HTTP-Tests. Keine Integrationsumgebung im Plan |
| 2026-10-05 | safeStorage-Backend `basic_text` (kein Keyring aktiv) | Warnen + speichern erlauben: beim Speichern `isEncryptionAvailable()` + `getSelectedStorageBackend()` prüfen, bei `basic_text` swal2-Warnung mit expliziter Bestätigung, dann persistieren |
| 2026-10-05 | Generierter Username länger als Nextcloud-Limit (64) | Auf 64 Zeichen kürzen. Kollisionsprüfung läuft auf dem gekürzten Wert. Vorschau markiert die Zeile als "gekürzt" |
| 2026-10-05 | Fehlerhafte Zeilen beim CSV-Import | Gute Zeilen importieren. Fehlerzeilen rot markiert, übersprungen, mit Grund im Ergebnis-Export |
| 2026-10-05 | Lebensdauer der Batch-Job-Historie | JSON-Datei in Electron `userData`, letzte 20 Jobs, nur Metadaten (Typ, Zeit, Anzahl ok/Fehler). Keine Passwörter |
| 2026-10-05 | Parallelität bei Batch-Jobs | Fix 5 gleichzeitige Requests als Konstante im Code (Tech-Lead-Default, kein Nextcloud-Limit). Nicht konfigurierbar, kein UI-Setting |
| 2026-10-05 | Kollision auch mit Geburtsdatum nicht auflösbar (gleicher Name UND gleiches Geburtsdatum) | Zeile wird als Fehler abgelehnt und übersprungen, Status `Benutzer existiert bereits`. Kein Zählersuffix. Ein versehentlicher Re-Import meldet dadurch sauber statt Dubletten anzulegen |
| 2026-10-05 | Username überschreitet das Nextcloud-Längenlimit (defensiv 64) | **Nachnamen-Komponente kürzen**, bis der Gesamtusername passt, danach Eindeutigkeit erneut prüfen. Kann der Username auch bei vollständig gekürztem Nachnamen nicht passen, wird die Zeile ein Fehler |
| 2026-10-05 | Initialpasswort: abgeleitet oder zufällig? | Bleibt bei der abgeleiteten Regel `<Prefix><ddmmyyyy>!`. Keine Zufallsoption. Hinweis: Passwort bleibt dauerhaft gültig, die API bietet kein Erzwingen einer Änderung |
| 2026-10-05 | `<Sonderzeichen>` im Initialpasswort | Fest `!` |
| 2026-10-05 | Prefix-Validierung Initialpasswort | Pflichtfeld, 3-20 Zeichen, nur `[A-Za-z0-9]`, muss mit Großbuchstabe beginnen. Live-Beispiel im Dialog. Ergebnis lokal auf >= 10 Zeichen prüfen. OCS `107` (Passwort-Policy) als lesbare deutsche Zeilenmeldung im Bericht |
| 2026-10-05 | Verhalten wenn `safeStorage` `basic_text` meldet | **Nicht persistieren.** Passwort nur im Speicher für die laufende Sitzung, deutsche Warnung im UI. Hält die CLAUDE.md-Zusage wörtlich ein |
| 2026-10-05 | Dashboard-Kachel Speicher | Kennzahl aufgeteilt in vier Werte: Gesamtnutzung, Summe der begrenzten Kontingente, Anzahl unbegrenzt, Anzahl unbekannt. Keine einzelne Summe |
| 2026-10-05 | Dashboard Batch-Job-Historie | Nur die laufende Sitzung, letzte 5 Jobs, im Speicher. Nach Neustart leer. **Keine Persistenzschicht** |
| 2026-10-05 | Größenordnung der Zielinstanz | Unter 5000 User. Userliste wird einmal komplett geladen und clientseitig gefiltert/sortiert. Keine Paginierung. Der N+1-Fallback braucht eine Fortschrittsanzeige und eine Warnung |
| 2026-10-05 | TLS / Serverzertifikat | https Pflicht. Selbstsigniert bzw. interne CA nach **einmaliger ausdrücklicher Bestätigung mit angezeigtem Fingerprint**, danach sichtbares Banner solange die Ausnahme aktiv ist. Kein http |
| 2026-10-05 | Batch-Aktion "Einstellungen ändern" (E-Mail-Domain, Anzeigename-Format) | **Gestrichen**, nach "Später". Nicht spezifizierbar, und Anzeigename-Umformatierung müsste Freitext in Vor-/Nachname zurückparsen — genau bei Doppelnamen falsch |
| 2026-10-05 | Batch-Input "CSV-Liste von Usernamen" | **Bleibt im Scope.** Ein Username pro Zeile, optionaler Header `Username`. Unbekannte Usernamen erscheinen in der Vorschau als `nicht gefunden` und werden ausgeschlossen |
| 2026-10-05 | Kontingent-Eingabe | Nur feste Presets: 1/2/5/10/20 GB und unbegrenzt. Kein Freitext. GiB-Basis 1073741824, unbegrenzt als `none` |
| 2026-10-05 | Kollisionssuffix und Reihenfolge-Schalter (Klarstellung zu Zeile 13) | Suffix hängt an der **gewählten** Reihenfolge: `vorname.nachname.ddmmyyyy` bzw. `nachname.vorname.ddmmyyyy`. Nicht zwei verschiedene Formate |
| 2026-10-05 | Geburtsdatum-Normalform | Beide Eingabeformate werden intern auf `ddmmyyyy` normalisiert — identisch für Initialpasswort und Kollisionssuffix |
| 2026-10-05 | Parallelität im Batch | Fest 4. Nicht als Einstellung exponieren und im UI nie als "Nextcloud-Limit" bezeichnen |
| 2026-10-05 | Abbruch-Semantik im Batch | Stoppt nur das Dispatchen. Laufende Requests laufen fertig, kein Rollback. Drei Ergebniszustände pro User: `ok`, `fehler`, `nicht ausgeführt`. CSV-Export auch nach Abbruch |
| 2026-10-05 | Selbstschutz | Der Admin-Account, mit dem die App verbunden ist, kann weder gelöscht noch deaktiviert werden — einzeln und im Batch. Mit sichtbarer Begründung aus der Auswahl ausgeschlossen |
| 2026-10-05 | Löschbestätigung | Eingabe der Dezimalzahl aus dem **Dry-Run** (nicht der Rohauswahl). Getrimmt, exakter Vergleich, Button bis zur Übereinstimmung deaktiviert, kein Versuchslimit. Gilt auch bei n=1 |
| 2026-10-05 | RFC4180-Quoting in der Import-CSV | **Nicht unterstützt** ("simple CSV" laut GOAL). Bei unbalancierter Quote ein Zeilenfehler, kein stilles Verstümmeln |
| 2026-10-05 | Zeilenobergrenze Import-CSV | Harte Grenze 2000 Zeilen mit klarer Meldung |
| 2026-10-05 | Zielgruppen beim Import | Nur vom Server gelesene Gruppen wählbar, plus ausdrückliche Aktion "Gruppe neu anlegen". So kann OCS `104` nicht mitten im Import auftreten |
| 2026-10-05 | Ergebnis-CSV Spalten | `userid;aktion;status;grund;httpStatus;ocsCode` — identisch für Batch-Bericht und Import-Export |
| 2026-10-05 | Passwort-Export auf Platte | swal2-Warnung vor dem Speicherdialog, nur nutzergewählter Pfad, kein Default im App-Verzeichnis, kein Auto-Open. Passwortliste beim Verlassen der Importansicht aus dem Speicher werfen |
| 2026-10-05 | Logging | Kein Datei-Logging. Konsole nur im Dev-Modus. Niemals Passwörter, App-Passwort oder Export-Inhalte |
| 2026-10-05 | Einzel-User-Aktionen | Laufen über dieselbe Action-Pipeline wie Batch, mit einer Auswahl von genau einem. Kein zweiter Codepfad |
