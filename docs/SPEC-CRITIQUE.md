# Spec-Kritik (Gate vor der Architektur)

Stand 2026-10-05. Verdikt: **NEEDS_USER**. Schritte 1-3 des Plans brauchen keine der offenen Antworten.

## Zu streichen / zu verschieben (Scope)
- **GOAL §5 "Einstellungen ändern (E-Mail-Domain, Anzeigename-Format etc. nur falls API es hergibt)"** — nicht spezifizierbar. "nur falls API es hergibt" ist kein Abnahmekriterium. Außerdem setzen importierte User laut DECISIONS gar keine E-Mail, ein Batch-Domain-Rewrite hat also kein Subjekt. **Ganz streichen, nicht verfeinern.**
- **GOAL §1 "Zuletzt durchgeführte Batch-Jobs mit Ergebnis"** — die einzige Anforderung im gesamten Ziel, die eine Persistenzschicht erzwingt (Dateispeicher, Schema, Retention, Sortierung). Der Ergebnisbericht pro Job plus CSV-Export deckt "was habe ich gerade getan" schon ab. **Verschieben.**
- **GOAL §5 Auswahlquelle "CSV-Liste von Usernamen"** — dritter Eingabepfad mit eigenem undefinierten Format und unklarer Behandlung unbekannter Usernamen. Tabelle + Filter deckt den Schuljahreswechsel. **Verschieben.**
- **GOAL §1 "Summe der Kontingente"** als eine Zahl — mathematisch undefiniert, solange "unbegrenzt" existiert. Siehe Frage 1.
- **GOAL §2 Filter "Kontingentauslastung"** als abgestufter Filter — wird eine numerische Filter-UI über ein unzuverlässiges Feld. Reduzieren auf eine Checkbox "nur fast voll (>90 %)", gleiches Prädikat wie die Dashboard-Liste.
- **GOAL "Offene Fragen" (Zeilen 53-57)** — alle vier sind in DECISIONS beantwortet. Aus GOAL.md löschen, sonst hält ein Coder das Projekt für unentschieden.
- `PUT /cloud/groups/{groupid}` Anzeigename-Editierung — in GOAL nicht gefordert. Nicht bauen.

## Zu vereinfachen
- **Einzel-User-Aktionen über dieselbe Action-Pipeline wie Batch**, mit einer Auswahl von genau einem. Zwei Codepfade für die gleichen sechs API-Calls sind das größte Duplikationsrisiko im Entwurf.
- **"Abbruch" ist keine State Machine:** ein Flag, das das Dispatchen stoppt, laufende Requests fertig laufen lässt und den Rest als "nicht ausgeführt" markiert. Kein AbortController-Geflecht, kein Rollback.
- **"Begrenzte Parallelität" = fest 4**, eine kleine Async-Pool-Funktion. Laut Research ist jede Zahl unsere Erfindung — nicht als Einstellung exponieren.
- CSV-Parsing als **eigenes pures Modul** (~40 Zeilen, von CLAUDE.md ohnehin gefordert), kein papaparse.
- Credentials als **ein Datensatz in einer JSON-Datei** unter `app.getPath('userData')`. Kein electron-store, keine Profilliste (Profile sind in GOAL Zeile 8 schon ausgeschlossen).
- HTTP über **Node-eigenes `fetch`** im Main-Prozess, kein axios.
- Renderer-State: **ein reaktives Modul**, kein Pinia. vue-router für 5 Views ist ok, ein `ref` mit der aktiven View genügt auch.
- Statuscode-Übersetzung **pro Endpunkt**, keine globale Fehlertabelle.

## Vom Lead zu entscheiden (muss vor dem Coden in ARCHITECTURE landen)
- **"Verbindung testen"** definieren: Erfolg = HTTP 200 **und** `ocs.meta.statuscode === 100` auf `GET /cloud/users?limit=1&format=json`. Eigene Meldungen für: Nicht-Admin (403/997), HTML statt OCS (falscher Basis-Pfad), 429 (Brute-Force-Verzögerung nach Tippfehler — **nicht** als "Server nicht erreichbar" melden). URL-Normalisierung: Trailing Slash entfernen, Schema verlangen.
- Auto-Connect beim Start vs. explizites Verbinden; Verhalten, wenn das gespeicherte Passwort abgelehnt wird.
- **Formulierungsfehler in DECISIONS Zeile 13:** Kollisionssuffix steht als `vorname.nachname.ddmmyyyy`, aber Zeile 12 macht die Reihenfolge umschaltbar. Muss lauten "gewählte Reihenfolge + `.ddmmyyyy`", sonst erzeugt ein `surnameFirst`-Import zwei verschiedene Formate.
- Geburtsdatum-Konversion `yyyy-mm-dd` -> `ddmmyyyy` für Passwort **und** Suffix (DECISIONS 9/13/14 verbinden die Formate nicht).
- **Username-Länge: nicht kürzen.** Über-Länge wird ein Zeilenfehler. Truncation würde die Eindeutigkeitsgarantie still brechen, für die die Kollisionsregel überhaupt existiert. Realistischer Worst Case (`annamaria.muellerluedenscheidt.01012010` = 39 Zeichen) liegt klar unter 64.
- Reservierte Namen und Zeichensatz gegen RESEARCH-OCS §7 prüfen -> Zeilenfehler.
- **Vollständige Enumeration der CSV-Zeilenfehler** (GOAL §6 nennt nur "Fehler"): fehlender/umbenannter Header, falsche Spaltenzahl, leerer Vor- oder Nachname, Name normalisiert zu `''` (CJK), unparsbares Datum, kalendarisch ungültiges Datum (31.02.2010), Datum in der Zukunft, identische Doppelzeile in der Datei, Username zu lang, reservierter Name, unauflösbare Kollision. Dateiebene: leere Datei, nur Header, BOM (Excel erzeugt einen), CRLF, gequotete Felder mit Trennzeichen darin, Trennzeichen-Autoerkennung inkl. Gleichstandsregel.
- **Löschbestätigung exakt:** Eingabe muss der Dezimalzahl der ausgewählten User entsprechen; bei Abweichung bleibt der Dialog offen mit Inline-Fehler, unbegrenzte Versuche; gilt auch bei n=1 oder explizit nicht.
- **Retry/Backoff** (in GOAL gar nicht vorhanden): 429 -> warten und einmal wiederholen, nie als User-Fehler zählen. Netzwerk/5xx -> ein Retry. Einzelfehler brechen den Batch nie ab (von GOAL Zeile 62 gefordert).
- **Dry-Run-Semantik:** lokal aus der geladenen Liste berechnet, kein Re-Fetch. No-Ops (schon in Gruppe, Kontingent schon gleich) als "keine Änderung" anzeigen und überspringen.
- **"Alles auswählen" gilt für das aktuelle Filterergebnis**, nicht für die ganze Instanz. Diese Zeile ist für Batch-Löschen tragend.
- **Kontingent-Presets und Einheitenbasis:** feste Preset-Liste, als rohe Bytes senden mit GiB = 1073741824, unbegrenzt als `none`. Keine Freitexteingabe.
- **Defensiver Quota-Reader als eigenes pures, getestetes Modul** für: Skalar `0`, Objekt `{free,used,total,relative,quota}`, `"none"`, `-3`, `null`, abwesend. Dashboard, Tabelle und Filter konsumieren ausschließlich dessen Output.
- **`users/details`-Fallback-Trigger:** DECISIONS 18 sagt "automatisch", aber nicht woran. Fallback bei HTTP 404 oder fehlendem `enabled`/`quota` in der ersten Antwort, Entscheidung für die Session merken.
- **Gruppen:** doppelte Gruppe (102), Gruppe existiert nicht beim Import (104), Schutz gegen Löschen der `admin`-Gruppe, Gruppen-ID vs. Anzeigename. Zielgruppen beim Import nur aus bestehenden Gruppen wählbar, kein Auto-Create.
- **Ergebnis-CSV:** Encoding, Trennzeichen, ob Fehlzeilen enthalten sind, Ablageort. Muss zwischen Batch-Bericht und Import-Export identisch sein.
- **Loading-, Empty- und Error-States** für Usertabelle, Gruppenliste und Dashboard — in GOAL nirgends erwähnt.
- **Prefix-Validierung Initialpasswort:** DECISIONS 9 behauptet "Erfüllt Nextcloud-Default (min. 10 Zeichen)", aber `<prefix>` + 8 Ziffern + 1 Sonderzeichen erreicht 10 Zeichen nur bei Prefix >= 1, und ein durchgehend kleingeschriebener Prefix erzeugt ein Passwort ohne Großbuchstaben. Mindestfix: Prefix verpflichtend, min. 3 Zeichen, `[A-Za-z0-9]`, muss mit Großbuchstabe beginnen, Live-Beispiel im Dialog, und `107` (Passwort-Policy) auf eine lesbare deutsche Zeilenmeldung mappen.
- **`<Sonderzeichen>` in DECISIONS 9 ist unaufgelöst** — fest `!` (wie das Beispiel `Schule01012010!` impliziert).

## Schrittvorschlag (Reihenfolge ist Absicht)
1. **Lauffähiges Skelett** — Electron main + preload + Vue3/Vite, dunkle Shell mit 5 leeren Views, npm-Scripts wie in CLAUDE.md. AC: `npm run dev` öffnet ein dunkles Fenster, alle 5 Views navigierbar; `npm test` und `npm run lint` grün; `contextIsolation`/`sandbox` an, `nodeIntegration` aus.
2. **Username-Generator** — pures Modul, Regex-Kette in der exakten Reihenfolge von RESEARCH-UPN §1, Reihenfolge-Schalter, plus Längen-/Zeichensatz-/Reservierte-Namen-Validierung. AC: alle 14 Zeilen aus RESEARCH-UPN §11 und alle 5 Fixtures aus §10 grün, inkl. der zwei `''`-Fehlerfälle; Modul importiert nichts mit I/O.
3. **Verbindung + OCS-Client** — Dialog, Envelope-Unwrap, `OCS-APIRequest` auf jedem Request, Verbindungstest, safeStorage. AC: gemockte Tests für 100/401/403/429/HTML-Antwort; falsches Passwort gibt eine spezifische deutsche Meldung; Passwort gelangt nie in den Renderer oder ein Log.
4. **User-Leseweg** — Fetch mit `users/details`-Probe und N+1-Fallback, defensives Quota-Modul, Tabelle mit Suche/Sortierung und Loading/Empty/Error. AC: Fallback-Test erzwingt 404 auf `details` und erzeugt identische Zeilen; Quota-Modul gegen alle sechs Shapes getestet.
5. **Einzel-User-Aktionen über die Action-Pipeline** — aktivieren/deaktivieren, Kontingent, Anzeigename/E-Mail, Gruppe zu/ab, Löschen mit Zahleneingabe. AC: jede Aktion gemockt getestet mit ihren endpunktspezifischen Fehlercodes auf deutsche Meldungen gemappt.
6. **Batch-Engine** + Fortschritt + Dry-Run + Ergebnis-CSV. AC: gemockter Lauf über 50 Items mit 7 Fehlern, einem 429 und Abbruch bei Item 20 verbucht jedes der 50 genau einmal, und das 429-Item zählt nicht als User-Fehler.
7. **CSV-Parsing + Importvorschau** — Trennzeichenerkennung, BOM, vollständige Fehlerenumeration, Kollisionsauflösung gegen Instanz-User und innerhalb der Datei. AC: je eine Fixture-Datei pro Fehlerfall, jede landet im erwarteten Status.
8. **Importierte User anlegen** — ein `POST /cloud/users` mit `groups[]`, `quota`, `password`; Ergebnis-Export mit Username und Initialpasswort. AC: Teilfehler (Zeile 3 trifft 107) lässt Zeilen 1,2,4..n angelegt und listet den Fehler mit Grund im Export.
9. **Gruppenverwaltung**. AC: anlegen, löschen mit Bestätigung, Mitgliederliste über den defensiven Parser, `admin`-Gruppe geschützt.
10. **Dashboard** zuletzt, weil es das Quota-Modul und die Antwort auf Frage 1 konsumiert. AC: alle Kacheln rendern aus einer bereits geladenen Userliste ohne Zusatz-Requests; die >90-%-Liste hat einen definierten Empty-State.

Schritt 2 steht bewusst vor Schritt 3: er ist das vollständig spezifizierte, risikofreie Stück mit dem höchsten Wert und erledigt die "1:1-Port"-Pflicht — die größte Korrektheitsverpflichtung im Ziel — bevor überhaupt Netzwerkcode existiert.

---

# Zweiter, unabhängiger Kritiklauf

Zwei spec-critic-Läufe liefen unabhängig voneinander über dieselben Dokumente und kamen beide
auf **NEEDS_USER** mit deckungsgleichen Kernbefunden. Nachfolgend nur die **zusätzlichen** Punkte.

## Zusätzlich zu streichen
- **Rollback/Kompensation für teilweise angewandte Importe** (User angelegt, Gruppenzuweisung fehlgeschlagen). Nicht in GOAL, nicht verlässlich erreichbar. Teilschritt-Fehler melden, Admin lässt erneut laufen.
- **Anzeigename-Umformatierung im Batch** ist konstruktiv falsch: sie erfordert, einen Freitext-Anzeigenamen zurück in Vor- und Nachname zu parsen. Verlustbehaftet und genau bei den Doppelnamen falsch, um die es im Username-Spec geht.
- Subadmin-Endpunkte. Nicht im Ziel.

## Zusätzlich fehlend
- **"Fast voll"-Liste ist nicht testbar:** Basis undefiniert. Fix: `used/limit` aus dem Quota-Parser; `unlimited`, `unknown` und `limitBytes === 0` ausschließen; absteigend sortieren; bei 20 kappen mit "und n weitere".
- **Suche:** clientseitig, case-insensitiv, Teilstring über `userid`, `displayname`, `email`.
- **Sortierung:** `localeCompare('de')`, damit Umlaute sinnvoll sortieren.
- **Selbstschutz fehlt komplett:** Die App muss sich weigern, den Admin-Account zu löschen oder zu deaktivieren, mit dem sie gerade verbunden ist — einzeln **und** im Batch. Mit sichtbarer Begründung aus der Auswahl ausschließen.
- **Einzel-User-Löschen** hat gar keine Bestätigung spezifiziert (GOAL definiert nur die Batch-Bestätigung). Fix: swal2 Ja/Nein mit angezeigter `userid`.
- **Manuell angelegte `userid` wird nicht validiert.** Gleicher Validator wie im Generator: Zeichensatz, reservierte Namen, Maximallänge, nicht nur Punkte.
- **Gruppenlöschen:** Bestätigung mit Gruppenname und Mitgliederzahl; Mitglieder werden nicht gelöscht. Leere/Whitespace-Namen ablehnen, `admin` schützen.
- **Mitgliederliste defensiv parsen:** Shape ist unverifiziert. Sowohl `{ users: [...] }` als auch ein nacktes Array akzeptieren, sonst Fehlermeldung mit Endpunktnamen.
- **429-Politik konkret:** pro Item bis zu 2 Retries mit 2 s/6 s Backoff; ein 429 zählt erst als Fehler, wenn die Retries erschöpft sind; nach 5 kumulierten 429 pausiert der Job und fragt den Nutzer.
- **Ergebnisbericht-CSV-Spalten jetzt festlegen:** `userid;aktion;status;grund;httpStatus;ocsCode`. Identisch für Batch-Bericht und Import-Export.
- **Drei Ergebniszustände pro User**, nicht zwei: `ok`, `fehler`, `nicht ausgeführt`. CSV-Export wird nach Abbruch genauso angeboten wie nach Abschluss.
- **Dry-Run-Zahl ist die maßgebliche Zahl:** Der Nutzer tippt die Anzahl aus dem Dry-Run, nicht die der Rohauswahl. Eingabe getrimmt, exakter Stringvergleich, Bestätigen-Button bis zur Übereinstimmung deaktiviert, kein Versuchslimit.
- **Zeilenobergrenze CSV:** harte Grenze 2000 Zeilen mit klarer Meldung.
- **RFC4180-Quoting jetzt entscheiden:** "simple CSV" in GOAL legt nahe, es **nicht** zu unterstützen. Dann explizit so festschreiben und bei unbalancierter Quote einen Fehler werfen, statt die Zeile still zu verstümmeln.
- **Datenschutz-Nebenwirkung:** Ein kollisionsaufgelöster Username (`...ddmmyyyy`) kodiert öffentlich das Geburtsdatum — und das ist der Kern des Initialpassworts. Kein Blocker bei dem entschiedenen Verteilweg, aber der Architekt darf das Geburtsdatum nirgends sonst zusätzlich sichtbar machen.
- **Zielgruppen beim Import:** Dialog bietet nur vom Server gelesene Gruppen plus eine ausdrückliche Aktion "Gruppe neu anlegen", damit OCS 104 mitten im Import nicht auftreten kann.
- **Passwort-Export ist Klartext auf Platte:** swal2-Warnung vor dem Speicherdialog, nur nutzergewählter Pfad, kein Default im App-Verzeichnis, kein Auto-Open, Passwortliste beim Verlassen der Importansicht aus dem Speicher werfen.
- **Teilfehler innerhalb einer Zeile** (User angelegt, Gruppenzuweisung fehlgeschlagen): kein Rollback, Status `teilweise` mit benanntem fehlgeschlagenem Teilschritt.
- **Logging-Politik:** kein Datei-Logging. Konsole nur im Dev-Modus. Niemals Passwörter, App-Passwort oder Export-Inhalte loggen.
- **`docs/MANUAL-TEST.md`** vom Architekten anlegen: numerierte Checkliste aus den Abnahmekriterien, weil die Abnahme laut DECISIONS 20 manuell gegen eine echte Instanz läuft.
- **Startup-Verhalten:** Bei abgelehntem gespeichertem Passwort den Dialog vorbefüllt ohne Passwort zeigen. Nicht-Admin-Account explizit erkennen und benennen. 429 als "Server blockt vorübergehend, bitte warten" melden, nicht als "falsches Passwort".
- **Dashboard erst nach erfolgreichem Verbindungstest erreichbar.** Nullwerte rendern als "0", leere Listen als "Keine Einträge". Datenstand mit Zeitstempel anzeigen, Aktualisieren nur per Button, kein Polling.

## Abweichung zwischen den beiden Läufen
- **Parallelität/Abbruch:** Lauf 1 empfiehlt ein reines Stop-Dispatch-Flag ohne `AbortController`, Lauf 2 einen schlichten `AbortController` in `runBatch(items, worker, { concurrency, signal })`. Beides ist leichtgewichtig; der Architekt entscheidet und begründet es in einer Zeile. Gemeinsam ist: **kein Job-Registry, keine Queue-Klasse, keine State Machine, kein Event Bus, kein Rollback.**
- **Kontingenteingabe:** Lauf 1 will ausschließlich Presets und rohe Bytes senden, Lauf 2 erlaubt zusätzlich Freitext über ein pures `formatQuotaForApi()`. Entscheidung beim Architekten; Presets sind in jedem Fall der Standardweg.
