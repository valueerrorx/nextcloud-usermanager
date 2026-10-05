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
| 2026-10-05 | Anzeigename-Format | offen – wird im nächsten Frageblock geklärt |
