# Manuelle Abnahme-Checkliste

Abnahme laut `docs/GOAL.md` Abschnitt "Abnahme" und `docs/DECISIONS.md`
("Abnahme gegen echte Nextcloud"): alles hier wird gegen eine **echte Test-Nextcloud**
durchgespielt. Verweise auf Entscheidungen erfolgen über den Fragetext, nicht über
Zeilennummern.

**Vorbereitung**
- Test-Nextcloud über **https** erreichbar, Admin-Account mit App-Passwort angelegt.
- Zweiter, nicht-administrativer Account für die Negativtests.
- Mindestens 3 Gruppen, mindestens 10 User, davon einer deaktiviert, einer mit Kontingent
  1 GB und >90 % Auslastung, einer ohne jemals erfolgten Login (für den Quota-Fall `null`).
- Testdateien aus `tests/fixtures/` zur Hand (Import-CSVs, Userlisten).
- Nach jedem Block notieren: erwartet / beobachtet / OK oder Abweichung.

Legende: **Tun** = Handlung, **Erwartung** = Soll-Verhalten.
Nummern mit Buchstaben (`43a`) sind später ergänzte Fälle; die Nummern **19** und **72** sind
bewusst frei (in #99 aufgegangen bzw. gestrichen, weil Parallelität nicht manuell beobachtbar
ist — das deckt `tests/pool.test.js` ab).

---

## A. Start, Build und Grundzustand

1. **Tun:** `npm install`, dann `npm test`. **Erwartung:** alle Tests grün, insbesondere die
   Username-Generator-Tests (14 Zeilen aus RESEARCH-UPN §11 und die 5 Fixtures aus §10).
2. **Tun:** `npm run lint`. **Erwartung:** keine Fehler, keine Warnungen.
3. **Tun:** `npm run build`, dann das erzeugte Artefakt unter Linux starten.
   **Erwartung:** App startet, Fenster erscheint.
4. **Tun:** `npm run dev`. **Erwartung:** **ein** Befehl startet Vite und Electron, dunkles
   Fenster, kein weißes Aufblitzen, kein Light-Theme-Anteil; `Strg+C` beendet beide Prozesse,
   kein verwaister Vite- oder Electron-Prozess bleibt zurück.
5. **Tun:** DevTools öffnen, in der Konsole `window.require`, `window.process` und
   `window.api.invoke` prüfen. **Erwartung:** alle drei `undefined`; `window.api` enthält nur
   die benannten Methoden aus ARCHITECTURE §3, keinen generischen `invoke`. Ausdrücklich
   **nicht** vorhanden: `connection.test`, `connection.disconnect`, `connection.savedHint`,
   `groups.members`.
6. **Tun:** ohne Verbindung die Navigation zu Dashboard, Benutzer, Gruppen, Import versuchen.
   **Erwartung:** nicht erreichbar bzw. gesperrt mit Hinweis "Bitte zuerst verbinden".
7. **Tun:** Konsolenausgabe im gepackten Build beobachten. **Erwartung:** keine Logzeilen,
   keine Logdatei im `userData`-Verzeichnis.

## B. Verbindung und Zugangsdaten

8. **Tun:** korrekte URL der Test-Instanz (`https://cloud.xapient.solutions`, DECISIONS
   „Test-Instanz für die manuelle Abnahme“), Admin-User und App-Passwort eingeben, "Verbinden".
   **Erwartung:** **ein** Vorgang prüft und verbindet (kein getrennter "Testen"-Schritt),
   Erfolgsmeldung, Dashboard wird erreichbar. Es gibt keinen "Trennen"-Button; "Zugang löschen"
   entfernt nur den gespeicherten Satz.
9. **Tun:** URL mit Trailing Slash eingeben (`https://host/`), ebenso
   `https://host/index.php` und `https://host/ocs/v1.php`.
   **Erwartung:** alle drei funktionieren identisch, URL wird normalisiert.
10. **Tun:** `http://host` eingeben. **Erwartung:** Ablehnung mit Hinweis, dass https Pflicht ist.
    Kein Verbindungsversuch.
11. **Tun:** falsches App-Passwort eingeben. **Erwartung:** spezifische Meldung
    "falsche Zugangsdaten" — **nicht** "Server nicht erreichbar". Passwort erscheint nirgends
    in der Meldung.
12. **Tun:** nicht-administrativen Account verwenden. **Erwartung:** eigene Meldung
    "Konto hat keine Administratorrechte", nicht "falsches Passwort".
13. **Tun:** erfundenen Hostnamen eingeben. **Erwartung:** "Server nicht erreichbar".
14. **Tun:** URL eines Webservers eingeben, der HTML statt OCS liefert (z. B. `https://example.com`).
    **Erwartung:** Meldung "falscher Basispfad / keine Nextcloud-Antwort", kein Crash,
    kein JSON-Parse-Fehler im UI.
15. **Tun:** 5-10 mal hintereinander mit falschem Passwort testen, bis Nextcloud `429` liefert.
    **Erwartung:** Meldung "Server blockt vorübergehend, bitte warten" — ausdrücklich **nicht**
    "falsches Passwort" und nicht "nicht erreichbar". Kein automatischer Wiederholungsversuch.
16. **Tun:** mit "Zugang speichern" verbinden (Keyring aktiv, z. B. gnome-keyring läuft).
    App beenden und neu starten. **Erwartung:** URL und Admin-Name vorbefüllt, Passwortfeld leer,
    Button "Mit gespeichertem Zugang verbinden" funktioniert ohne erneute Eingabe.
17. **Tun:** Keyring stoppen (`systemctl --user stop gnome-keyring-daemon` o. ä. bzw. Session
    ohne Keyring), App starten und mit "Zugang speichern" verbinden.
    **Erwartung:** swal2-Warnung "kein Schlüsselbund verfügbar", Zugang wird **nicht**
    gespeichert, Verbinden funktioniert trotzdem, dauerhafter Hinweis
    "Zugang gilt nur für diese Sitzung". Nach Neustart ist kein gespeicherter Zugang vorhanden.
18. **Tun:** gespeicherten Zugang anlegen, dann das App-Passwort in Nextcloud widerrufen,
    App neu starten und "Mit gespeichertem Zugang verbinden".
    **Erwartung:** Meldung "gespeichertes Passwort wurde abgelehnt", Dialog bleibt offen,
    Passwortfeld leer, der gespeicherte Satz bleibt bis "Zugang löschen" erhalten.
19. *(entfallen — in #99 aufgegangen: `credentials.json` wird dort mit allen anderen Dateien in
    `~/.config/<appname>/` gegengeprüft.)*
20. **Tun:** "Zugang löschen". **Erwartung:** Datei bzw. Secret entfernt, nach Neustart leerer Dialog.

## C. Selbstsigniertes Zertifikat / interne CA

21. **Tun:** Verbindung zu einer Instanz mit selbstsigniertem Zertifikat.
    **Erwartung:** Dialog mit Host, **SHA-256-Fingerprint**, Subject, Issuer und Gültigkeit;
    keine stille Annahme.
22. **Tun:** Fingerprint gegen den auf dem Server ausgelesenen Wert vergleichen, dann ablehnen.
    **Erwartung:** Verbindung scheitert mit Zertifikatsmeldung.
23. **Tun:** erneut verbinden und akzeptieren.
    **Erwartung:** Verbindung kommt zustande, und ein **permanentes Banner** zeigt
    "Unsichere Zertifikatsausnahme aktiv für `<host>`" samt Fingerprint, solange die App läuft.
24. **Tun:** App beenden und neu starten, erneut verbinden.
    **Erwartung:** Fingerprint-Dialog erscheint wieder (Ausnahme gilt nur für die Sitzung).
25. **Tun:** mit aktiver Ausnahme zu einem **anderen** Host mit selbstsigniertem Zertifikat
    verbinden. **Erwartung:** eigener Dialog für den neuen Host, keine Übernahme der alten Ausnahme.

## D. Dashboard

26. **Tun:** Dashboard öffnen. **Erwartung:** Anzahl User, Anzahl aktiv, Anzahl deaktiviert,
    Anzahl Gruppen — Werte passen zur Nextcloud-Admin-Oberfläche.
27. **Tun:** Speicherkachel prüfen. **Erwartung:** **vier** getrennte Werte: Gesamtnutzung,
    Summe der begrenzten Kontingente, Anzahl "unbegrenzt", Anzahl "unbekannt".
    Keine einzelne Gesamtsumme.
28. **Tun:** User mit >90 % Auslastung prüfen. **Erwartung:** erscheint in der Liste "fast voll",
    absteigend sortiert; User mit unbegrenztem oder unbekanntem Kontingent erscheinen **nicht**.
    Bei mehr als 20 Treffern zeigt die Liste 20 Einträge plus "und n weitere".
29. **Tun:** den User ohne ersten Login prüfen. **Erwartung:** Kontingent als "unbekannt"
    ausgewiesen, kein `NaN`, kein `null`, kein `-3`, keine 0-%-Anzeige.
30. **Tun:** Instanz ohne fast-volle User betrachten. **Erwartung:** Empty-State
    "Keine Einträge", keine leere Tabelle ohne Text.
31. **Tun:** Datenstand und "Aktualisieren" prüfen. **Erwartung:** Zeitstempel sichtbar,
    Daten ändern sich nur nach Klick, kein automatisches Nachladen.
32. **Tun:** einen Batch-Job ausführen, dann Dashboard öffnen.
    **Erwartung:** Job erscheint im Verlauf (Typ, Zeit, Anzahl ok/Fehler), maximal 5 Einträge,
    keine Usernamen- oder Passwortdetails. Ein reiner Dry-Run erscheint **nicht** im Verlauf.
32a. **Tun:** einen Job mit mindestens einem `teilweise`-Ergebnis erzeugen (z. B. Import mit
    zwischenzeitlich gelöschter Zielgruppe, siehe #97), dann Dashboard öffnen.
    **Erwartung:** die Verlaufskachel zählt das `teilweise`-Item **in die Fehlerspalte** und
    weist es **zusätzlich separat** aus (z. B. "3 Fehler, davon 1 teilweise"). Die Summe
    ok + Fehler + nicht ausgeführt stimmt mit der Anzahl der Items im Bericht überein —
    kein Item wird doppelt und keines gar nicht gezählt.
33. **Tun:** App neu starten. **Erwartung:** Jobverlauf ist leer (nur Sitzung).
33a. **Tun:** direkt nach dem Verbinden — **ohne** vorher die Benutzer- oder Gruppenansicht
    geöffnet zu haben — auf Dashboard wechseln. **Erwartung:** kurzer Ladezustand (StateBlock
    "Lädt…"), danach echte Kennzahlen aus der nachgeladenen Liste; die Kacheln zeigen **nicht**
    lauter Nullen, als wäre die Instanz leer (REVIEW-NOTES "dieselbe Falle wie S10/S12").
33b. **Tun:** den eigenen Admin-Account (den beim Verbinden eingegebenen Loginnamen) in den
    Kacheln suchen. **Erwartung:** er zählt in der Speicherkachel unter "Unbegrenzte Konten"
    mit (sein `used`-Wert fließt in "Genutzt (gesamt)" ein, siehe RESEARCH-OCS V3) und
    erscheint **nicht** in der "Fast voll"-Liste, unabhängig davon, wie viel er tatsächlich
    nutzt — unbegrenzte Kontingente haben kein Prozent-Kriterium.

## E. Userliste lesen

34. **Tun:** Benutzeransicht öffnen. **Erwartung:** Ladezustand sichtbar, danach alle User
    mit userid, Anzeigename, E-Mail, Status, Gruppen und Kontingent.
34a. **Tun:** nach dem Laden den Zeitstempel ("Stand: ...") ansehen, dann auf "Neu laden" klicken.
    **Erwartung:** Zeitstempel ist gesetzt und ändert sich nur nach dem Klick, kein automatisches
    Nachladen; während des Klicks ist der Button kurz deaktiviert.
34b. **Tun:** gegen eine Instanz ohne User öffnen (bzw. künstlich einen leeren `users.list`-Erfolg
    provozieren). **Erwartung:** Empty-State "Keine Einträge" statt einer leeren Tabelle ohne Text.
35. **Tun:** Falls die Instanz `users/details` nicht unterstützt (bzw. künstlich provoziert):
    **Erwartung:** Warnung "Einzelabfragen, kann dauern" plus Fortschrittsanzeige.
    Die **Identitätsfelder** `userid`, `displayname`, `email`, `enabled`, `groups` sind
    identisch zum Bulk-Weg. **Kontingent darf abweichen**: der Einzeluser-Endpunkt liefert
    Quota teils nur als Skalar, betroffene User erscheinen als "unbekannt". Dann steigt
    auf dem Dashboard die Kachelzahl "unbekannt" entsprechend und die Summe der begrenzten
    Kontingente sinkt — das ist erwartetes Verhalten, kein Fehler.
36. **Tun:** Suche nach Teilstring in userid, Anzeigename und E-Mail, mit und ohne Großschreibung.
    **Erwartung:** case-insensitive Treffer in allen drei Feldern.
37. **Tun:** Nach Anzeigename sortieren, mit Umlauten (Ärger, Zoller, Öttinger).
    **Erwartung:** deutsche Sortierreihenfolge, Umlaute einsortiert statt am Ende.
38. **Tun:** Filter "Kontingentauslastung" alle **fünf** Stufen durchschalten: `<50 %`,
    `50-90 %`, `>90 %`, `unbegrenzt`, `unbekannt`. Dann mit Filter Gruppe und
    Filter aktiv/deaktiviert kombinieren. **Erwartung:** fünf Stufen, **keine Checkbox**;
    jede Stufe zeigt genau die passenden User, der User ohne ersten Login landet in
    `unbekannt`, ein User mit unbegrenztem Kontingent nur in `unbegrenzt`;
    kombinierte Filter schneiden die Mengen, Zähler aktualisiert sich; die Summe der fünf
    Stufenmengen ist die Gesamtzahl der User.
38a. **Tun:** nach Benutzername und nach Kontingent sortieren (Spaltenkopf anklicken), jeweils
    ein zweites Mal für die Gegenrichtung. **Erwartung:** die aktive Spalte ist optisch markiert
    (Pfeil zeigt Richtung); bei Kontingent landen User mit unbegrenztem oder unbekanntem
    Kontingent **immer** am Ende der Tabelle, egal in welcher Richtung sortiert wird.
38b. **Tun:** einen Filter setzen (z. B. Gruppe), einige Checkboxen einzeln anklicken, dann
    "alles auswählen" im Tabellenkopf anklicken, danach den Filter wieder ändern.
    **Erwartung:** "alles auswählen" markiert genau die aktuell sichtbaren Zeilen; die Anzahl
    neben "X von Y Benutzern" **und** die Zahl direkt neben der Kopf-Checkbox stehen **exakt**
    für die Größe der Auswahl und stimmen mit der Zahl der angehakten Checkboxen überein.
    Ändert sich danach der Filter, bleiben in der Auswahl nur noch User, die im neuen
    Filterergebnis weiterhin sichtbar sind - verschwundene User fallen aus der Auswahl, ihre
    Anzeige-Zahl sinkt entsprechend. Nochmaliges Klicken auf "alles auswählen" bei voll
    ausgewähltem Filterergebnis hebt **nur die sichtbaren** Einträge wieder auf - zuvor über
    einen anderen Filter ausgewählte, jetzt unsichtbare User (falls vorhanden) bleiben
    unberührt. Setzt man einen Filter, der **keinen** Treffer liefert, ist die Kopf-Checkbox
    **nicht** angehakt (ein leeres Filterergebnis gilt nicht als "alle ausgewählt") und die
    Tabelle zeigt statt der leeren Kopfzeile den Hinweis "Keine Treffer für diesen Filter.".
38c. **Tun:** "Filter zurücksetzen" klicken, nachdem Suche, Gruppe, Status und Kontingentstufe
    gesetzt waren. **Erwartung:** alle vier Filter werden auf ihren Ausgangswert zurückgesetzt,
    die Tabelle zeigt wieder alle User, eine zuvor getroffene Auswahl bleibt bestehen (wird
    durch das Zurücksetzen nicht gelöscht, da keiner der ausgewählten User aus dem
    - jetzt größeren - Filterergebnis herausfällt).
39. **Tun:** Netzwerk trennen und "Neu laden" klicken.
    **Erwartung:** Error-State mit Wiederholen-Button, kein leerer Bildschirm, kein Absturz.
39a. **Tun:** einige User auswählen, dann "Neu laden" klicken (erfolgreich, neue Verbindung
    bleibt bestehen). **Erwartung:** die Auswahl bleibt für dieselben Usernamen erhalten, obwohl
    die Userliste komplett neu geladen wurde (die Auswahl hält Benutzername-Strings, keine
    Objektreferenzen auf die alte Liste). Anschließend einige User auswählen, dann das Netzwerk
    trennen und "Neu laden" klicken, bis der Error-State erscheint. **Erwartung:** die Auswahl
    wird bei einem **fehlgeschlagenen** Neuladen geleert ("X von Y Benutzern, 0 ausgewählt"
    nach dem nächsten erfolgreichen Laden) - eine stehengebliebene Auswahl auf einer nicht neu
    geladenen Liste wäre sonst die Zahl, die später beim Batch-Löschen eingetippt werden muss.

## F. Einzel-User-Aktionen

40. **Tun:** neuen User manuell anlegen mit gültiger userid, Anzeigename, Kontingent, Gruppe.
    **Erwartung:** Anlage erfolgreich, User erscheint nach Aktualisieren in der Liste und in Nextcloud.
41. **Tun:** userid mit Sonderzeichen (`müller!`), nur Punkten (`...`), leer, mit
    reserviertem Namen (`.htaccess`) und mit 65 Zeichen versuchen.
    **Erwartung:** jeweils eigene deutsche Validierungsmeldung, kein Request an den Server.
    Es ist **derselbe** Validator wie im Import-Generator (Zeichensatz, reservierte Namen,
    Maximallänge, nicht nur Punkte) — die Meldungstexte stimmen mit denen der Importvorschau
    überein.
42. **Tun:** bereits existierende userid anlegen. **Erwartung:** Meldung "Benutzer existiert bereits"
    (OCS 102), kein generischer Fehler.
43. **Tun:** Passwort unterhalb der Nextcloud-Policy setzen.
    **Erwartung:** lesbare deutsche Meldung zur Passwortrichtlinie (OCS 107).
43a. **Tun:** für einen **bestehenden** User "Passwort setzen" mit einem policy-konformen
    Passwort ausführen. **Erwartung:** Erfolgsmeldung, Bericht mit Status `ok`; mit dem neuen
    Passwort gelingt die Anmeldung dieses Users in Nextcloud, mit dem alten nicht mehr.
    Das Passwort erscheint **nicht** im Bericht, nicht im Jobverlauf und in keinem Export
    (der Passwort-Export existiert nur für den CSV-Import).
44. **Tun:** Anzeigename und E-Mail eines Users ändern. **Erwartung:** Änderung in Nextcloud
    sichtbar. Hinweis: das sind intern **zwei** Requests (OCS nimmt pro `PUT` nur ein
    key/value-Paar). Schlägt genau einer fehl, ist `teilweise` mit benanntem Schritt das
    korrekte Ergebnis.
44a. **Tun:** nur den Anzeigenamen ändern. **Erwartung:** ein Schritt, Status `ok`.
45. **Tun:** User deaktivieren, dann aktivieren. **Erwartung:** Status wechselt, in Nextcloud bestätigt.
46. **Tun:** User zu Gruppe hinzufügen und wieder entfernen. **Erwartung:** Mitgliedschaft passt.
47. **Tun:** Kontingent setzen über die Presets 1/2/5/10/20 GB und "unbegrenzt".
    **Erwartung:** nur Presets wählbar, kein Freitextfeld; Nextcloud zeigt die erwarteten Werte,
    "unbegrenzt" als unbegrenzt.
48. **Tun:** Einzel-User löschen. **Erwartung:** swal2-Bestätigung, die die `userid` nennt,
    plus Eingabe der Zahl `1`; Button erst bei exakter Eingabe aktiv. Nach Bestätigung gelöscht.
49. **Tun:** im Löschdialog `1 ` mit Leerzeichen und `01` eingeben.
    **Erwartung:** `1 ` wird getrimmt akzeptiert, `01` nicht (exakter Vergleich).
50. **Tun:** den eigenen, aktuell verbundenen Admin-Account löschen oder deaktivieren wollen.
    **Erwartung:** Aktion ist nicht ausführbar; der Account ist mit sichtbarer Begründung
    "eigener Admin-Zugang" aus der Auswahl ausgeschlossen.
50a. **Tun:** neu verbinden und den Loginnamen dabei **anders geschrieben** eingeben
    (z. B. `Admin` statt `admin`), dann denselben Account löschen/deaktivieren wollen.
    **Erwartung:** der Selbstschutz greift trotzdem — der Vergleich ist case-insensitiv.
    Der Schutz hängt am eingegebenen Loginnamen, nicht an einer API-Abfrage.

## G. Gruppenverwaltung

51. **Tun:** Gruppe anlegen. **Erwartung:** erscheint in Liste und in Nextcloud.
52. **Tun:** dieselbe Gruppe nochmals anlegen. **Erwartung:** Meldung "Gruppe existiert bereits"
    (OCS 102).
53. **Tun:** Gruppe mit leerem Namen und mit nur Leerzeichen anlegen.
    **Erwartung:** Ablehnung mit deutscher Meldung, kein Request.
54. **Tun:** Mitglieder einer Gruppe anzeigen. **Erwartung:** Liste stimmt mit Nextcloud überein;
    leere Gruppe zeigt "Keine Einträge".
54a. **Tun:** in der Mitgliederansicht einen User über das Dropdown hinzufügen, danach über den
    Entfernen-Button wieder herausnehmen. **Erwartung:** beide Aktionen laufen über dieselbe
    Vorschau-/Ausführungslogik wie bei den Einzel-User-Aktionen (kein separater Bestätigungsweg);
    nach jeder Änderung aktualisieren sich **sowohl** die Mitgliederliste **als auch** die
    Mitgliederzahl in der Gruppentabelle automatisch, ohne dass "Neu laden" nötig ist.
    Der entfernte bzw. hinzugefügte User bleibt als User unverändert in Nextcloud bestehen.
55. **Tun:** Gruppe löschen. **Erwartung:** Bestätigung nennt Gruppenname **und** Mitgliederzahl;
    nach Löschen existieren die Mitglieder weiter als User.
56. **Tun:** Gruppe `admin` löschen wollen. **Erwartung:** blockiert mit Begründung, der
    Löschbutton ist für `admin` von vornherein deaktiviert mit erklärendem Tooltip.
57. **Tun:** Mitgliederzahl in der Gruppenliste gegen Nextcloud prüfen.
    **Erwartung:** Zahl stimmt, ohne dass pro Gruppe ein eigener Request nötig war
    (Ansicht lädt ohne spürbare Verzögerung bei vielen Gruppen).
57a. **Tun:** direkt nach dem Verbinden (ohne vorher die Benutzeransicht geöffnet zu haben) auf
    "Gruppen" wechseln, bei einer Instanz mit einer Gruppe mit vielen Mitgliedern (z. B. 30
    Schülern). **Erwartung:** Solange die Userliste intern nachgeladen wird, zeigt die
    Gruppenansicht einen Ladezustand (`StateBlock`) **statt** einer Tabelle mit Mitgliederzahlen;
    insbesondere erscheint **nirgends** `0` als Mitgliederzahl für diese Gruppe. Erst nach
    abgeschlossenem Laden erscheinen Gruppentabelle und die korrekten Mitgliederzahlen, der
    Löschbutton bleibt bis dahin ebenfalls ohne Wirkung/ausgeblendet.

## H. Batch-Verarbeitung

58. **Tun:** 5 User in der Tabelle auswählen, Aktion "deaktivieren", Dry-Run ansehen.
    **Erwartung:** Vorschau listet alle geplanten Änderungen; bereits deaktivierte User
    stehen unter "keine Änderung" und werden nicht angefasst.
58a. **Tun:** dieselben 5 User auswählen, Aktion **"aktivieren"** ausführen.
    **Erwartung:** Dry-Run zeigt die 5 als Änderung (die bereits aktiven als "keine
    Änderung"), nach Bestätigung sind alle in Nextcloud aktiv, Bericht 5 × `ok`,
    Statusspalte in der Tabelle nach "Aktualisieren" korrekt.
58b. **Tun:** eine Auswahl bilden, die gleichzeitig den eigenen Admin-Account, einen bereits
    deaktivierten und mindestens einen aktiven User enthält, Aktion "deaktivieren", "Vorschau"
    klicken. **Erwartung:** die Vorschau zeigt alle **drei Blöcke gleichzeitig** befüllt:
    "Wird ausgeführt" mit dem aktiven User (vorher -> nachher), "Keine Änderung" mit dem
    bereits deaktivierten User samt Begründung, "Ausgeschlossen" mit dem Admin-Account samt
    Begründung "eigener Admin-Zugang".
59. **Tun:** Filter setzen, "alles auswählen" klicken.
    **Erwartung:** Auswahl entspricht genau dem aktuellen Filterergebnis, nicht allen Usern der Instanz.
60. **Tun:** Batch "zu Gruppe hinzufügen" auf eine Auswahl, in der einige User schon Mitglied sind.
    **Erwartung:** die bereits Mitglieder stehen als "keine Änderung" in der Vorschau.
60a. **Tun:** Batch **"aus Gruppe entfernen"** auf dieselbe Auswahl, darunter ein User, der
    **nicht** Mitglied ist. **Erwartung:** der Nicht-Mitglied-User steht als "keine Änderung";
    die übrigen werden entfernt, existieren danach aber weiter als User; die Mitgliederzahl
    der Gruppe in der Gruppenansicht sinkt nach "Aktualisieren" entsprechend.
61. **Tun:** Batch "Kontingent setzen" mit einem Wert, den einige User schon haben.
    **Erwartung:** diese als "keine Änderung".
62. **Tun:** Batch-Löschen auf 3 User. **Erwartung:** zweite Bestätigung verlangt die Eingabe
    der Zahl aus dem **Dry-Run** (nicht der Rohauswahl, falls Ausschlüsse vorlagen);
    Button bis zur Übereinstimmung deaktiviert, beliebig viele Versuche erlaubt.
    Der Dialog enthält **ausdrücklich den Hinweis, dass Nextcloud die Dateien der betroffenen
    User mitlöscht**. Nach dem Löschen eines Users mit Dateien gegenprüfen, dass dessen
    Dateien in Nextcloud tatsächlich weg sind — der Hinweis beschreibt also das reale
    Verhalten. Derselbe Hinweis erscheint auch bei der Einzellöschung (#48).
62a. **Tun:** im Batch-Löschdialog zunächst eine **falsche** Zahl eingeben (abweichend von der
    Dry-Run-Zahl), danach die **richtige**. **Erwartung:** der Bestätigen-Button bleibt bei der
    falschen Zahl deaktiviert und aktiviert sich erst bei exakter, getrimmter Übereinstimmung —
    auch wenn die Dry-Run-Zahl genau **1** ist (eine Auswahl mit nur einem zu löschenden User).
63. **Tun:** Batch-Löschen mit einer Auswahl, die den eigenen Admin-Account enthält.
    **Erwartung:** Admin ist ausgeschlossen, die zu tippende Zahl ist um 1 kleiner als die Rohauswahl.
64. **Tun:** Batch über 30+ User laufen lassen und den Fortschritt beobachten.
    **Erwartung:** Fortschritt steigt monoton, Abbrechen-Button aktiv, UI bleibt bedienbar;
    nirgends im UI wird eine Parallelitätszahl als "Nextcloud-Limit" bezeichnet, und es gibt
    keine Einstellung dafür.
65. **Tun:** Mitten im Lauf "Abbrechen" klicken.
    **Erwartung:** laufende Requests werden fertig, keine weiteren gestartet; restliche User
    im Bericht als **"nicht ausgeführt"**; keine Rücknahme bereits ausgeführter Änderungen;
    jeder User der Auswahl erscheint genau einmal im Bericht.
65a. **Tun:** "Abbrechen" ein zweites Mal klicken bzw. nach Jobende erneut klicken.
    **Erwartung:** keine Fehlermeldung, kein Hängen; der vorhandene Bericht bleibt sichtbar
    (definiertes Ergebnis "bereits beendet").
66. **Tun:** Teilfehler erzeugen (z. B. in der Auswahl einen zwischenzeitlich in Nextcloud
    gelöschten User belassen). **Erwartung:** dieser User steht als "fehler" mit Grund,
    alle übrigen laufen durch; der Job bricht nicht ab.
67. **Tun:** Ergebnisbericht als CSV exportieren.
    **Erwartung:** Speicherdialog, nutzergewählter Pfad; Datei hat die Spalten
    `userid;aktion;status;grund;httpStatus;ocsCode`, UTF-8, öffnet in Excel/LibreOffice mit
    korrekten Umlauten; `fehler`- und `nicht ausgeführt`-Zeilen sind enthalten.
68. **Tun:** Export **nach einem Abbruch** versuchen. **Erwartung:** Export ist ebenfalls möglich.
69. **Tun:** Großen Batch laufen lassen, bis Nextcloud `429` liefert (ggf. Brute-Force-Schwelle
    senken oder parallel Fehl-Logins erzeugen). **Erwartung:** betroffene Items werden
    automatisch wiederholt (2 s, dann 6 s) und gelingen in der Regel; ein wiederholter und
    dann erfolgreicher `429` erscheint **nicht** als Userfehler.
70. **Tun:** die 429-Situation so lange halten, dass die Retries eines Items **erschöpft**
    werden. **Erwartung:** **kein Pausendialog und keine Rückfrage** — das Item wird ein
    normaler Item-Fehler mit der Begründung "Server blockt vorübergehend"
    (`server_blockt_vorerst`), und der **Job läuft bis zum Ende weiter**. Die restlichen User
    werden weiterhin abgearbeitet, der Bericht enthält das Item als `fehler`, nicht als
    "nicht ausgeführt".
71. **Tun:** Batch-Auswahl per CSV-Userliste (`userliste-mit-header.csv` und ohne Header),
    darin ein nicht existierender Username. **Erwartung:** unbekannter Name erscheint in der
    Vorschau als "nicht gefunden" und wird von der Ausführung ausgeschlossen.
71a. **Tun:** nach einem abgeschlossenen Batch-Job (egal ob normal beendet oder abgebrochen)
    die Usertabelle beobachten, **ohne** manuell "Neu laden" zu klicken.
    **Erwartung:** die Liste lädt sich automatisch neu (der "Stand:"-Zeitstempel aktualisiert
    sich), die soeben geänderten Werte (z. B. Status nach Aktivieren/Deaktivieren, Mitgliedschaft
    nach Gruppenänderung) sind sofort korrekt sichtbar, ohne dass der Admin selbst nachlädt.
72. *(gestrichen — gleichzeitige Requests sind von Hand nicht verlässlich zählbar. Die
    Parallelität 4 ist durch `tests/pool.test.js` und `tests/pipeline.test.js` abgedeckt.
    Manuell bleibt nur: im UI steht nirgends eine Zahl als "Nextcloud-Limit", und es gibt
    keine Einstellung dafür — das wird in #64 mitgeprüft.)*

## I. CSV-Import neuer User

73. **Tun:** `import-ok.csv` laden. **Erwartung:** Vorschautabelle mit Zeilennummer, Name,
    Geburtsdatum, erzeugtem Username und Status; alle Zeilen Status "neu".
74. **Tun:** Reihenfolge-Schalter auf `nachname.vorname` umstellen.
    **Erwartung:** alle Usernames wechseln die Reihenfolge; Anzeigename bleibt
    "Vorname Nachname" in Originalschreibweise.
75. **Tun:** Datei mit Umlauten, ß, Bindestrich, Apostroph, Doppelvornamen und Akzenten prüfen
    (`Müller-Lüdenscheidt`, `O'Brien`, `Anna Maria`, `René García`, `Ștefan Țăranu`).
    **Erwartung:** exakt die Werte aus RESEARCH-UPN §11, z. B.
    `bjoern.muellerluedenscheidt`, `obrien.smith`, `annamaria.musterfrau`, `rene.garcia`,
    `stefan.taranu`.
76. **Tun:** `import-cjk.csv` (Namen in CJK) laden. **Erwartung:** Zeile ist rot markierter
    Fehler "Aus diesem Namen lässt sich kein Username bilden", kein Teil-Username.
77. **Tun:** Dateien mit `;` und mit `,` als Trennzeichen laden.
    **Erwartung:** beide korrekt erkannt.
78. **Tun:** `import-bom-crlf.csv` (BOM + CRLF, Excel-Export) laden.
    **Erwartung:** erste Spalte heißt korrekt `Vorname`, keine Fehlmeldung zum Header.
79. **Tun:** `import-leer.csv`, `import-nur-header.csv`, `import-header-falsch.csv`.
    **Erwartung:** jeweils eine klare Dateifehlermeldung, keine Vorschau.
80. **Tun:** `import-spaltenzahl.csv` und `import-quote-unbalanciert.csv`.
    **Erwartung:** betroffene Zeilen als Fehler markiert mit dem jeweiligen Grund; gute Zeilen
    bleiben importierbar. Bei der unbalancierten Quote wird nichts still abgeschnitten.
81. **Tun:** Datumsvarianten prüfen: `01.02.2010`, `2010-02-01`, `31.02.2010`, `01/02/2010`,
    ein Datum in der Zukunft. **Erwartung:** die ersten zwei gültig und identisch normalisiert;
    die anderen drei als "existiert nicht" / "Format" / "Zukunft" markiert.
82. **Tun:** `import-doppelzeile.csv` (zwei identische Zeilen).
    **Erwartung:** zweite Zeile als "Identische Zeile kommt mehrfach vor" markiert.
83. **Tun:** `import-kollision.csv`, die einen Namen enthält, der **in Nextcloud schon
    existiert**. **Erwartung:** Zeile ist ein **Fehler** "Benutzer existiert bereits" und wird
    übersprungen. Es wird **kein** `.ddmmyyyy`-Account angelegt: das Geburtsdatum-Suffix löst
    ausschließlich Kollisionen **innerhalb der Importdatei**. Die übrigen Zeilen bleiben
    importierbar.
84. **Tun:** CSV mit zwei verschiedenen Personen gleichen Namens aber verschiedenen
    Geburtsdaten, keiner davon in Nextcloud vorhanden.
    **Erwartung:** eine Zeile "neu", die andere "Kollision aufgelöst" mit `.ddmmyyyy` in der
    **gewählten** Reihenfolge; beide Usernames eindeutig; nach dem Import existieren beide
    User in Nextcloud.
85. **Tun:** CSV mit zwei identischen Namen **und** identischem Geburtsdatum in verschiedener
    Schreibweise (z. B. `Anna Maria`/`AnnaMaria`, also nicht komplett doppelt).
    **Erwartung:** zweite Zeile als Fehler "Benutzer existiert bereits", kein Zählersuffix wie
    `...2` — das Suffix wäre für beide Zeilen identisch und kann nicht unterscheiden.
86. **Tun:** `import-lange-namen.csv` (sehr langer Nachname, sehr langer Vorname).
    **Erwartung:** gekürzt wird **nur die Nachnamen-Komponente**, der Vorname bleibt
    unangetastet; die Zeile ist mit "gekürzt" markiert und die Kollisionsprüfung lief auf dem
    gekürzten Wert. Mit Reihenfolge `nachname.vorname` wiederholen: auch dann wird der
    **Nachname** gekürzt, obwohl er links steht — nicht der Vorname am Ende. Bei einer
    Kollision bleibt das `.ddmmyyyy`-Suffix **vollständig** erhalten und nur der Nachname
    schrumpft weiter. Passt der Name auch mit einem einzelnen Nachnamen-Zeichen nicht, ist
    die Zeile der Fehler "auch nach Kürzen des Nachnamens zu lang".
86a. **Tun:** `import-kuerzung-gleich.csv` (drei lange Nachnamen mit gemeinsamem Anfang, die
    nach dem Kürzen denselben Username ergäben, gleiches Geburtsdatum).
    **Erwartung:** die betroffene Zeile zeigt die **eigene** Meldung "Zwei verschiedene Namen
    werden durch das Kürzen zum gleichen Username" — ausdrücklich **nicht** "Benutzer
    existiert bereits", denn die Namen sind verschieden. Keine stille Verschmelzung zweier
    Personen auf einen Account.
87. **Tun:** `import-2001-zeilen.csv`. **Erwartung:** klare Meldung zur Grenze von 2000 Zeilen,
    kein Teilimport.
88. **Tun:** Prefix-Feld leer lassen, `ab` (zu kurz), `schule` (klein beginnend),
    `Schule!` (Sonderzeichen), 25 Zeichen. **Erwartung:** jeweils Validierungsfehler;
    "Anlegen" bleibt gesperrt.
89. **Tun:** Prefix `Schule` setzen. **Erwartung:** Live-Beispiel im Dialog zeigt
    z. B. `Schule01012010!`.
90. **Tun:** Zielgruppen-Auswahl öffnen. **Erwartung:** nur vom Server gelesene Gruppen wählbar;
    eine neue Gruppe entsteht nur über die ausdrückliche Aktion "Gruppe neu anlegen",
    kein Freitext. Die Liste ist gefüllt, weil die Importansicht die Gruppen beim Öffnen lädt;
    ohne geladene Gruppen ist die Auswahl mit Hinweis deaktiviert statt leer.
90a. **Tun:** "Gruppe neu anlegen" mit einem noch nicht existierenden Namen (z. B. `5a-2026`)
    benutzen und den Import ausführen. **Erwartung:** die Vorschau markiert die Zielgruppe als
    "wird neu angelegt"; swal2 fragt **einmal** explizit nach, bevor etwas passiert; bei
    "Abbrechen" entsteht **keine** Gruppe. Nach Bestätigung wird die Gruppe **vor** dem
    Importlauf angelegt (sie ist danach in Nextcloud und in der Gruppenansicht sichtbar) und
    alle importierten User sind Mitglieder. Es tritt **kein** Fehler "Gruppe existiert nicht"
    (OCS 104) mitten im Import auf.
91. **Tun:** Import mit Zielgruppe und Kontingent-Preset ausführen.
    **Erwartung:** Fortschritt, dann Bericht; die User existieren in Nextcloud mit
    Anzeigename "Vorname Nachname", leerer E-Mail, gesetztem Kontingent und Gruppenmitgliedschaft.
92. **Tun:** mit einem der Initialpasswörter als der neue User in Nextcloud anmelden.
    **Erwartung:** Login funktioniert.
93. **Tun:** Import mit einer Datei ausführen, die eine Fehlerzeile enthält.
    **Erwartung:** gute Zeilen werden angelegt, Fehlerzeile übersprungen und mit Grund im
    Bericht gelistet.
94. **Tun:** Ergebnis exportieren (nach einem Import mit mindestens einer Fehlerzeile aus #93).
    **Erwartung:** swal2-Warnung vor dem Speichern ("Klartextpasswörter"), dann Speicherdialog
    **ohne** Vorbelegung im App-Verzeichnis, kein automatisches Öffnen der Datei; Datei enthält
    die Spalten `userid;aktion;status;grund;httpStatus;ocsCode;passwort`.
    Der Export enthält **alle** Eingabezeilen: die angelegten User **und** die bereits in der
    Vorschau abgewiesenen Fehlerzeilen mit ihrem Grund. Bei Zeilen, für die nie ein Username
    entstand (z. B. leerer Vorname, kaputtes Datum), steht in Spalte 1 die **Zeilennummer**
    (`Zeile 17`). Jede Zeile der Eingabedatei ist genau einmal auffindbar.
94a. **Tun:** direkt im Anschluss an #94 den Export-Button erneut klicken und in der
    swal2-Warnung diesmal **"Abbrechen"** anklicken. **Erwartung:** kein Speicherdialog öffnet
    sich, es wird keine Datei geschrieben (Verzeichnis danach gegenprüfen). Export-Button
    erneut klicken, diesmal die Warnung **bestätigen** und einen Pfad wählen.
    **Erwartung:** Datei hat genau sieben Spalten in der dokumentierten Reihenfolge
    (`userid;aktion;status;grund;httpStatus;ocsCode;passwort`); jede Zeile mit Status `ok` oder
    `teilweise` trägt in Spalte 7 das **echte**, bei diesem Import verwendete Initialpasswort
    (nicht leer, nicht maskiert); Fehlerzeilen haben Spalte 7 leer. Zum Vergleich einen
    gewöhnlichen Batch-Bericht (z. B. aus #67) exportieren: dieselbe swal2-Warnung erscheint dort
    **nicht**, und die Datei hat nur sechs Spalten ohne `passwort`.
95. **Tun:** Importansicht verlassen und zurückkehren. **Erwartung:** Passwortliste ist weg,
    kein nachträglicher Export mehr möglich (Hinweis statt alter Daten).
96. **Tun:** **dieselbe CSV erneut importieren** (nach erfolgreichem Lauf aus #91, Userliste
    vorher aktualisieren). **Erwartung — der wichtigste Test des Imports:**
    **jede einzelne Zeile** steht in der Vorschau als Fehler "Benutzer existiert bereits",
    **keine** Zeile als "neu" und **keine** als "Kollision aufgelöst". Der Button "Anlegen"
    führt zu 0 angelegten Usern (bzw. ist gesperrt, weil keine gültige Zeile übrig ist).
    In Nextcloud entsteht **kein** zusätzlicher Account, insbesondere keiner mit
    `.ddmmyyyy`-Suffix. Die Userzahl auf dem Dashboard ist unverändert.
96a. **Tun:** dieselbe CSV ein drittes Mal, diesmal mit umgeschalteter Reihenfolge
    (`nachname.vorname`) importieren. **Erwartung:** die Zeilen sind **neu**, weil andere
    Usernames entstehen. Bewusstes Verhalten: der Schalter gehört zur Namensbildung. Nicht
    anlegen, nur beobachten und notieren.
97. **Tun:** Import mit vorher in Nextcloud gelöschter Zielgruppe starten (Gruppe zwischen
    Laden und Import entfernen). **Erwartung:** betroffene Zeilen als "teilweise" —
    User angelegt, Gruppenzuweisung mit benanntem Grund fehlgeschlagen; kein Rollback,
    kein abgebrochener Job.

## J. Sicherheits- und Datenschutz-Gegenprobe

98. **Tun:** während aller Tests DevTools-Konsole und Netzwerk-Tab des Renderers beobachten.
    **Erwartung:** nirgends das App-Passwort, nirgends ein `Authorization`-Header, nirgends
    ein Initialpasswort; keine Requests vom Renderer an den Nextcloud-Host.
99. **Tun:** `~/.config/<appname>/` nach dem Import durchsuchen (`grep -ri` nach Prefix,
    Initialpasswort und App-Passwort) und `credentials.json` öffnen.
    **Erwartung:** keine Treffer, keine Logdatei, keine Jobverlauf-Datei. `credentials.json`
    enthält nur URL, Admin-Name und einen Base64-Blob — kein Klartextpasswort und kein
    teilmaskiertes Passwort. Ohne "Zugang speichern" existiert die Datei gar nicht.
100. **Tun:** einen exportierten Bericht (nicht den Import-Export) öffnen.
     **Erwartung:** keine Passwortspalte, keine Geburtsdaten.
101. **Tun:** einen Link in der App anklicken bzw. `window.open` provozieren.
     **Erwartung:** kein neues Electron-Fenster, keine Navigation weg von der App.

## K. UI-Designsystem (S09a, reiner Umbau der Darstellung)

102. **Tun:** App starten, Sidebar betrachten. **Erwartung:** dunkle Sidebar (`#161b22`) mit
     Icon je Menüpunkt (Verbindung/Dashboard/Benutzer/Gruppen/Import), aktiver Eintrag optisch
     hervorgehoben, gesperrte Einträge vor dem Verbinden abgeblendet mit Tooltip
     "Bitte zuerst verbinden".
103. **Tun:** Verbindungsansicht ansehen. **Erwartung:** Kartenrahmen, Bootstrap-Formularfelder
     dunkel, Status-Punkt (`conn-dot`) vor "Verbunden"/"Nicht verbunden", Icon-Button zum
     Löschen des gespeicherten Zugangs hat Tooltip und ist per Tastatur/Screenreader über
     `aria-label` erkennbar.
104. **Tun:** Zertifikatsausnahme aktivieren (Verbindung zu einem Server mit selbstsigniertem
     Zertifikat). **Erwartung:** rotes Banner mit Warn-Icon oben im Hauptbereich, bleibt über
     Viewwechsel sichtbar.
105. **Tun:** Benutzertabelle mit vielen Einträgen füllen und scrollen.
     **Erwartung:** Kopfzeile (groß geschrieben, gedämpfte Farbe) bleibt beim Scrollen stehen
     (Sticky-Header), kein Zebra-Streifen, dezenter Hover-Tint auf der Zeile unter dem Cursor,
     Status als farbige Pill ("aktiv"/"deaktiviert"), Gruppen als kleine Chips, aktive
     Sortierspalte zeigt ein Pfeil-Icon.
106. **Tun:** "Neu laden" klicken, während die Liste noch lädt beobachten.
     **Erwartung:** Reload-Icon dreht sich (`spin`), Button ist währenddessen gesperrt.
107. **Tun:** Aktionsleiste mit einer Auswahl öffnen, zwischen den Aktionen wechseln.
     **Erwartung:** dunkle Bootstrap-Formularfelder, der "Vorschau"-Button zeigt das zur Aktion
     passende Icon aus der Tabelle in S09a (z. B. Papierkorb bei "Löschen").
108. **Tun:** eine Batch-Aktion mit Vorschau starten, inkl. Löschbestätigung mit Zahleneingabe.
     **Erwartung:** swal2-Dialog erscheint dunkel (Karten-Hintergrund, helle Schrift, blauer
     Bestätigen-Button), die Löschbestätigung verhält sich **exakt wie vorher** (Button bis zur
     exakten Zahleneingabe gesperrt, Hinweis auf das Mitlöschen der Dateien) - keine
     Funktionsänderung, nur Optik.
109. **Tun:** einen Batch-Job laufen lassen und abbrechen. **Erwartung:** Fortschrittsanzeige
     und "Abbrechen"-Button mit X-Icon, nach Abschluss Ergebnis-Tabelle und CSV-Export-Button
     mit Download-Icon, Verhalten unverändert zur Zeit vor S09a.
110. **Tun:** eine Ansicht ohne Treffer/Inhalt aufrufen (z. B. Benutzerfilter ohne Treffer,
     oder Dashboard/Gruppen/Import vor ihrer Implementierung). **Erwartung:** zentrierter
     Empty-State mit großem, gedämpftem Icon und Text statt einer leeren weißen Fläche.
111. **Tun:** `npx vite build && timeout 20 npx electron .` headless ausführen.
     **Erwartung:** Prozess startet und läuft bis zum Timeout ohne Absturz; keine
     Konsolenfehler außer der erwarteten Terminierung durch `timeout`. Fenstervisuelle Prüfung
     ist headless nicht möglich - bei Gelegenheit zusätzlich mit echtem Display nachholen.

## L. Importvorschau (S10, noch ohne tatsächliches Anlegen)

112. **Tun:** Import-Ansicht öffnen, "CSV wählen" klicken und eine gültige Import-CSV aus
     `tests/fixtures/` auswählen. **Erwartung:** Dateiname und Zeilenanzahl erscheinen,
     Optionen- und Vorschau-Karten werden sichtbar.
113. **Tun:** eine CSV mit Dateifehler wählen (leer, nur Kopfzeile, falsche Kopfzeile, über
     2000 Zeilen, unbalanciertes Anführungszeichen). **Erwartung:** der deutsche Fehlertext
     erscheint **statt** der Vorschautabelle, keine leere Tabelle.
114. **Tun:** Passwort-Prefix leer lassen, dann zu kurz, dann mit Kleinbuchstaben beginnend,
     dann gültig eingeben. **Erwartung:** passender deutscher Fehlertext erscheint live bei
     jeder Eingabe und verschwindet bei einem gültigen Prefix; das Live-Beispiel darunter
     (z. B. `Schule01012010!`) ändert sich synchron mit dem Prefix.
115. **Tun:** mit gültigem Prefix die Reihenfolge zwischen "vorname.nachname" und
     "nachname.vorname" umschalten. **Erwartung:** die Usernames in der Vorschautabelle ändern
     sich sofort entsprechend, ohne die Datei neu zu laden.
116. **Tun:** "Gruppe neu anlegen" klicken, einen neuen Namen eingeben und bestätigen.
     **Erwartung:** swal2-Dialog fragt nach dem Namen, `groups.create` legt die Gruppe an, die
     Gruppenliste lädt neu und die neue Gruppe ist sofort als Zielgruppe ankreuzbar. Einen
     bereits existierenden Namen eingeben -> Fehlermeldung "Diese Gruppe existiert schon."
117. **Tun:** eine Import-CSV mit allen drei Fällen aus einer Datei laden: zwei eindeutige
     neue Namen, zwei Namen mit gleichem Nachnamen-Präfix (Kollision), und eine Zeile mit
     ungültigem Datum. **Erwartung:** Vorschautabelle zeigt alle drei Statusfarben (grün "neu",
     gelb "Kollision aufgelöst", rot "Fehler" mit deutschem Begründungstext), die
     Kopfzeilen-Zusammenfassung nennt die drei Zahlen korrekt.
118. **Tun:** eine CSV mit einem sehr langen Nachnamen laden, der gekürzt werden muss.
     **Erwartung:** die betroffene Zeile zeigt ein Schere-Icon mit Tooltip "Nachname wurde
     gekürzt" neben dem Username.
119. **Tun:** eine Datei laden, die ausschließlich Fehlerzeilen ergibt (z. B. nur ungültige
     Daten). **Erwartung:** die Vorschautabelle zeigt genau diese Fehlerzeilen, der
     "Anlegen"-Button bleibt deaktiviert (0 anzulegende Zeilen).
120. **Tun:** mit gültigem Prefix und mindestens einer "neu"/"kollision_aufgeloest"-Zeile den
     "Anlegen"-Button betrachten, dann klicken. **Erwartung:** Button zeigt die Anzahl der
     tatsächlich anzulegenden Zeilen, ist nur dann aktiv; der Klick zeigt in diesem Schritt nur
     einen Platzhalter-Hinweis, es wird **kein** User angelegt (`POST /cloud/users` darf im
     Netzwerk-Tab nicht auftauchen).
