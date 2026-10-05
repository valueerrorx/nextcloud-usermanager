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
