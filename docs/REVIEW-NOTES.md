# Review-Notes

Wiederkehrende Fehlerquellen in diesem Projekt.
**Coder:** vor dem Implementieren lesen, diese Fehler nicht machen.
**Senior-Reviewer:** den Diff explizit gegen jeden Punkt prüfen.
**Lead:** nach jedem `RECURRING`-Befund hier ergänzen.

Die Startpunkte 1-10 sind nicht aus Reviews, sondern aus dem Research belegt
(`docs/RESEARCH-OCS.md`, `docs/RESEARCH-UPN.md`). Sie sind trotzdem bindend.

## Nextcloud-API
1. **`OCS-APIRequest: true` fehlt.** Der Header ist auf *jedem* Request Pflicht, sonst antwortet Nextcloud mit einem Redirect/HTML statt mit OCS. Nie vergessen, auch nicht beim Verbindungstest.
2. **HTTP 200 ist kein Erfolg.** Der echte Status steht in `ocs.meta.statuscode`. Immer beide prüfen: HTTP-Status *und* `meta.statuscode`.
3. **Statuscodes sind endpunkt-spezifisch.** `101` bedeutet beim Anlegen etwas anderes als beim Bearbeiten, `102` bei Gruppe-anlegen etwas anderes als bei User-anlegen. **Keine globale Lookup-Tabelle** für Code-zu-Meldung. Pro Endpunkt mappen.
4. **Quota-Werte sind inkonsistent.** Unbegrenzt kommt als `"none"` *oder* `-3`. Bei Usern ohne ersten Login können `free`/`total` `null` oder abwesend sein. Nie naiv `parseInt` oder arithmetisch summieren, ohne diese Fälle vorher abzufangen.
5. **`429 Too Many Requests` ist ein eigener Fehlerfall**, kein User-Fehler. Gehört in einen Backoff, darf im Batch-Ergebnisbericht nicht als "User fehlgeschlagen" gezählt werden.
6. **User-IDs case-insensitiv vergleichen.** Nextcloud behandelt Groß-/Kleinschreibung selbst inkonsistent. Jede Kollisions- und Existenzprüfung normalisiert vorher.

## Secrets und Electron
7. **`safeStorage` kann still auf Klartext zurückfallen.** Auf Linux ohne laufenden Keyring liefert `getSelectedStorageBackend()` `basic_text`, und die Daten sind praktisch unverschlüsselt. Vor dem Speichern `isEncryptionAvailable()` prüfen und den Nutzer bei `basic_text` im UI warnen. Niemals stillschweigend speichern.
8. **Das App-Passwort darf den Main-Prozess nie verlassen.** Nicht in IPC-Rückgaben, nicht in Logs, nicht in Fehlermeldungen, nicht in Exceptions, nicht in exportierten CSVs. Auch nicht teilmaskiert.
9. **Initialpasswörter nicht loggen.** Sie dürfen ausschließlich in den Ergebnis-CSV-Export des Imports, sonst nirgends.
10. **Electron-Security-Flags nicht abschalten.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` sind Defaults aktueller Electron-Versionen — sie müssen so bleiben. Preload exponiert eine schmale, explizit aufgelistete API, keinen generischen `invoke(channel, ...)`-Durchgriff.

## Username-Generator
11. **Nur die JS-Variante aus `src/utils/upn.js` ist autoritativ.** Die PowerShell-Variante im Referenzprojekt weicht ab und ist nicht die Vorlage.
12. **Die Split-Heuristik an `/[-\s]/` aus den Remove-Views gehört nicht in die Erzeugung.** Sie ist Fuzzy-Matching für das Löschen. Bindestriche und Leerzeichen werden bei der Erzeugung ersatzlos gelöscht.

## Reviews
<!-- Ab hier: Befunde aus echten Reviews. Format: - [S<nn>] <Datei> - <Muster> -->
