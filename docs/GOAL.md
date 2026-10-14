# Ziel: Nextcloud User Manager (Electron)

Desktop-App für Admins, um Nextcloud-User und -Gruppen effizient zu verwalten, vor allem in großen Mengen (Schulbetrieb: Schuljahreswechsel, neue Klassen, Abgänger).

## Anbindung
- Nextcloud OCS Provisioning API (Users, Groups, Quota) mit Admin-Account + App-Passwort.
- Verbindungsdialog: Server-URL, Admin-User, App-Passwort, Verbindung testen. Zugangsdaten verschlüsselt speichern.
- Mehrere gespeicherte Server-Profile: NEIN (später).

## Funktionen

### 1. Dashboard (Startseite)
- Kennzahlen: Anzahl User, aktive/deaktivierte User, Anzahl Gruppen, Gesamt-Speichernutzung vs. Summe der Kontingente.
- Systeminfos des Servers (Host, OS, CPU, RAM, Uptime, Disk, externe IP), falls lesbar (DECISIONS 2026-10-14).
- Liste "fast voll" (User über 90 % ihres Kontingents).
- Zuletzt durchgeführte Batch-Jobs mit Ergebnis.

### 2. Userverwaltung
- Tabelle aller User: Suche, Filter (Gruppe, aktiv/deaktiviert, Kontingentauslastung), Sortierung, Mehrfachauswahl.
- Einzel-User: anlegen, bearbeiten (Anzeigename, E-Mail, Kontingent, Gruppen), aktivieren/deaktivieren, löschen, Passwort setzen.

### 3. Gruppenverwaltung
- Gruppen anlegen, löschen, Mitglieder anzeigen, User hinzufügen/entfernen.

### 4. Kontingente
- Kontingent pro User setzen (z. B. 1 GB, 5 GB, unbegrenzt), Auslastung anzeigen.

### 5. Batch-Verarbeitung (Kernfunktion)
Auf eine Auswahl von Usern (aus Tabelle, Filter oder CSV-Liste von Usernamen):
- löschen
- aktivieren/deaktivieren
- zu Gruppe hinzufügen / aus Gruppe entfernen
- Kontingent setzen
- Einstellungen ändern (E-Mail-Domain, Anzeigename-Format etc. nur falls API es hergibt)

Für jeden Batch-Job:
- Vorschau (Dry-Run) mit Liste aller geplanten Änderungen, dann Bestätigung (swal2).
- Bei Löschen: zusätzliche explizite Bestätigung mit Eingabe der Anzahl.
- Fortschrittsanzeige, begrenzte Parallelität, Abbruch möglich.
- Ergebnisbericht pro User (ok/fehler + Grund), als CSV exportierbar.

### 6. CSV-Import neuer User
- Input: simple CSV mit `Vorname`, `Nachname`, `Passwort` (Trennzeichen `;` oder `,`, UTF-8, mit Header). Passwort wird 1:1 übernommen (DECISIONS 2026-10-14).
- Aus jeder Zeile wird ein eindeutiger Nextcloud-Username erzeugt.
- **Username-Regeln exakt wie die UPN-Erzeugung im Referenzprojekt "Microsoft 365 Users"** (Pfad in CLAUDE.md): Sonderzeichen-Ersetzung, Umlaute, Doppelnamen, Leerzeichen, Bindestriche, Eindeutigkeit bei Kollisionen. Die Logik wird 1:1 portiert und mit Tests belegt, deren Beispiele aus dem Referenzprojekt abgeleitet sind.
- Eindeutigkeit gegen bestehende Nextcloud-User UND innerhalb der Importdatei.
- Vorschau-Tabelle vor dem Anlegen: Zeile, Name, erzeugter Username, Status (neu / Kollision aufgelöst / Fehler).
- Optional beim Import: Zielgruppe(n) und Kontingent für alle importierten User.
- Ergebnis-Export (CSV) mit Username und Initialpasswort.

## Nicht-Ziele (vorerst)
- Kein LDAP/AD-Sync, keine Dateiverwaltung, keine Nextcloud-App-Verwaltung, keine Mehrsprachigkeit, kein Light Theme.

## Offene Fragen (vom Team zu klären, bevor gebaut wird)
- Wofür wird das Geburtsdatum verwendet (Initialpasswort? Unterscheidung bei Namensgleichheit? Nur Validierung)?
- Wie wird das Initialpasswort gebildet und wie wird es verteilt?
- Wird eine E-Mail gesetzt (CSV hat keine)?
- Anzeigename-Format (z. B. "Vorname Nachname")?

## Abnahme
- Alle Funktionen oben gegen eine echte Test-Nextcloud manuell durchgespielt.
- Username-Generator: Unit-Tests mit allen Regeln und Beispielen aus dem Referenzprojekt, 100 % grün.
- Batch-Jobs: getestet mit gemockter API inkl. Teilfehlern (einzelne User schlagen fehl, Rest läuft durch).
- `npm test` und `npm run lint` grün, `npm run build` erzeugt lauffähige App unter Linux.
