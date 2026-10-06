# Research: Nextcloud OCS Provisioning API + Stack

Stand 2026-10-05. Quelle: docs.nextcloud.com, electronjs.org, nextcloud/server GitHub.
Nur Fakten. Verifizierungsgrad ist pro Punkt markiert. Architekt/Coder: das hier ist die API-Referenz.

## 1. Auth und Envelope (verifiziert)
- Basic Auth: Admin-User + App-Passwort.
- Header `OCS-APIRequest: true` ist auf **jedem** Request Pflicht.
- `?format=json` anhängen, sonst XML.
- Basis-Pfad: `https://<host>/ocs/v1.php/cloud`.
- Antwort immer gewrappt: `{ ocs: { meta: { status, statuscode, message }, data: {...} } }`.
  `meta.status` ist `"ok"` oder `"failure"`.

## 2. Users (verifiziert, instruction_set_for_users.html)
| Zweck | Methode + Pfad | Parameter |
|---|---|---|
| Liste (nur IDs) | `GET /cloud/users` | `search`, `limit`, `offset` |
| Liste mit Details | `GET /cloud/users/details` | `search`, `limit`, `offset` — **verifiziert, siehe V1: v1 UND v2 funktionieren, aber nur v1 liefert `statuscode` 100** |
| Einzeluser | `GET /cloud/users/{userid}` | – |
| Anlegen | `POST /cloud/users` | `userid` (Pflicht), `password`, `displayName`, `email`, `groups[]`, `subadmin[]`, `quota`, `language` |
| Feld ändern | `PUT /cloud/users/{userid}` | `key`, `value` |
| Aktivieren | `PUT /cloud/users/{userid}/enable` | – |
| Deaktivieren | `PUT /cloud/users/{userid}/disable` | – |
| Löschen | `DELETE /cloud/users/{userid}` | – |
| Gruppen des Users | `GET /cloud/users/{userid}/groups` | – |
| Zu Gruppe hinzufügen | `POST /cloud/users/{userid}/groups` | `groupid` |
| Aus Gruppe entfernen | `DELETE /cloud/users/{userid}/groups` | `groupid` |

- Einzeluser-Datenfelder: `enabled, id, quota, email, displayname, phone, address, website, twitter, groups`.
- Editierbare `key`-Werte: `email, quota, displayname, phone, address, website, twitter, password`.
  (`GET /cloud/user/fields` listet nur `displayname, email, phone, address, website, twitter` — `quota`/`password` sind admin-only und fehlen dort.)
- Passwortloses Anlegen ist möglich: `password` leer lassen, dann ist `email` Pflicht und Nextcloud schickt eine Einladungsmail.
  **Für uns irrelevant** — wir setzen laut DECISIONS.md immer ein Initialpasswort und keine E-Mail.

## 3. Groups (teilweise verifiziert, instruction_set_for_groups.html)
| Zweck | Methode + Pfad | Parameter |
|---|---|---|
| Liste | `GET /cloud/groups` | `search`, `limit`, `offset` |
| Anlegen | `POST /cloud/groups` | `groupid` |
| Löschen | `DELETE /cloud/groups/{groupid}` | – |
| Mitglieder | `GET /cloud/groups/{groupid}` | **verifiziert, siehe V4: `data.users` ist ein Array** |
| Anzeigename ändern | `PUT /cloud/groups/{groupid}` | `key=displayname`, `value` |
| Subadmins | `GET /cloud/groups/{groupid}/subadmins` | – |

- User zu/aus Gruppe läuft über die **User**-Endpunkte, nicht über Groups.
- Ein dediziertes `/cloud/groups/details` konnte **nicht** bestätigt werden.

## 4. Quota (verifiziert + dokumentierte Bugs)
- **Setzen** über `PUT /cloud/users/{userid}` mit `key=quota`. Doc-Beispiel: `"100MB"`. Ebenfalls akzeptiert: `"1 GB"`, `"none"` (unbegrenzt), rohe Byte-Zahl.
- **Lesen:** auf der Test-Instanz liefern **beide** Wege ein Objekt `{ free, used, total, relative, quota }` (siehe V2). Die Doku zeigt für ältere Versionen auch einen Skalar — der Parser deckt beides ab.
- Bekannte Inkonsistenzen (nextcloud/server #19909, #7212):
  - Unbegrenzt erscheint je nach Codepfad als `"none"` **oder** `-3`. **Auf der Test-Instanz: `-3`** (siehe V3), und zwar in `quota`, `total` **und** `free`.
  - Bei Usern, die sich noch nie eingeloggt haben, können `free`/`total` `null` oder ganz abwesend sein.
- **Konsequenz:** Quota-Parsing muss defensiv sein. Dashboard-Kennzahlen ("90 % voll", "Nutzung vs. Kontingent") dürfen kein saubere Zahlenobjekt annehmen.

## 5. Fehlercodes (verifiziert, aber endpunkt-spezifisch)
`100` = Erfolg, überall. Die übrigen Codes bedeuten **pro Endpunkt etwas anderes**:

**User anlegen:** `101` ungültiges Argument · `102` User existiert schon · `103` keine Sub-Admins für Admin-Gruppe · `104` Gruppe existiert nicht · `105` fehlende Rechte für Gruppe · `106` keine Gruppe angegeben · `107` Hint-Exception (z. B. Passwort-Policy) · `108`/`110` E-Mail-Adresse erforderlich · `109` Sub-Admin-Gruppe existiert nicht · `111` User-ID konnte nicht erzeugt werden.

**User bearbeiten:** `101` ungültiges Argument · `107` Passwort-Policy · `112` Backend unterstützt Passwortsetzen nicht · `113` Feld nicht editierbar / existiert nicht.

**Gruppe anlegen:** `101` ungültige Eingabe · `102` Gruppe existiert schon · `103` Anlegen fehlgeschlagen.
**Gruppe löschen:** `101` Gruppe existiert nicht · `102` Löschen fehlgeschlagen.
**Enable/Disable/Delete User:** nur `100`/`101` bestätigt, feinere Aufschlüsselung UNVERIFIZIERT.

**Konsequenz:** Die Statuscode-zu-Meldung-Übersetzung muss pro Endpunkt erfolgen, **keine globale Lookup-Tabelle**. Generische Codes 996–999 ("not authorized", "not found", …) ließen sich auf keiner offiziellen Seite bestätigen — nicht darauf verlassen, stattdessen HTTP-Status mitauswerten.

## 6. Parallelität / Brute-Force
- Nextcloud veröffentlicht **keine** Obergrenze für parallele authentifizierte Provisioning-Calls. Jede Zahl, die wir wählen, ist eine Client-Entscheidung — nicht als "Nextcloud-Limit" darstellen.
- Brute-Force-Schutz greift bei **fehlgeschlagenen** Auth-Versuchen: progressive Verzögerung bis ~25 s, nach Überschreiten der Schwelle `HTTP 429` pro IP, im Extremfall bis 24 h Sperre.
- Erfolgreiche Requests mit gültigem App-Passwort werden davon nicht gedrosselt. Aber: ein Tippfehler im "Verbindung testen" kann die Verzögerung starten.
- Realer Engpass bei Batch-Jobs ist die PHP-Worker-/FPM-Pool-Größe der Instanz, nicht ein API-Limit. Niedrige Parallelität (Größenordnung 3–10) ist Community-Heuristik, keine Doku.
- `429` muss als eigener Fehlerfall behandelt werden (Backoff, nicht als „User fehlerhaft“ zählen).

## 7. Username-Constraints in Nextcloud (semi-verifiziert, lib/private/User/Manager.php)
- Erlaubte Zeichen effektiv `[a-zA-Z0-9 _.@-']` — alles andere wird abgelehnt.
- Maximale Länge über `IUser::MAX_USERID_LENGTH`; **verifiziert: 65 Zeichen werden abgelehnt, `MAX_USERID = 64` ist korrekt** (siehe V5).
- Reservierte Namen: `.htaccess`, `files_external`, `__groupfolders`, `.ncdata`, `owncloud.log`, `nextcloud.log`, `updater.log`, `audit.log`, `appdata_<instanceid>`.
- Nicht erlaubt: leer, nur Punkte, führende/abschließende Leerzeichen.
- Groß-/Kleinschreibung: in Nextcloud selbst **inkonsistent** behandelt (offene Issues #10814, #20011). Unsere Kollisionsprüfung muss daher **case-insensitiv** vergleichen, um auf der sicheren Seite zu sein.

## 8. Electron safeStorage (verifiziert) — RISIKO
- Methoden: `isEncryptionAvailable()`, `encryptString()`, `decryptString()`, Async-Varianten, `getSelectedStorageBackend()` (Linux), `setUsePlainTextEncryption()` (Linux).
- Linux-Backends: `gnome_libsecret`, `kwallet`/`kwallet5`/`kwallet6`, oder `basic_text`.
- **Zitat aus der Doku:** "If no secret store is available, items stored in using the safeStorage API will be unprotected as they are encrypted via hardcoded plaintext password."
- **Konsequenz für Arch Linux (Dev-OS):** ohne laufenden gnome-keyring/kwallet degradiert safeStorage still zu Klartext. Die App muss beim Speichern `isEncryptionAvailable()` und `getSelectedStorageBackend()` prüfen und bei `basic_text` im UI warnen. Sonst ist die CLAUDE.md-Zusage zum Secret-Handling faktisch verletzt.

## 9. Electron-Security-Defaults (verifiziert)
- `nodeIntegration` ist seit Electron 5 standardmäßig aus, `contextIsolation` seit 12 an, `sandbox` seit 20 an.
- Die CLAUDE.md-Vorgaben entsprechen damit den Defaults — es genügt, sie **nicht** abzuschalten.
- Doku-Warnung: `contextIsolation` abschalten deaktiviert auch die Sandbox, unabhängig vom Default.

## 10. Offene Punkte — ERLEDIGT
Alle vier Punkte sind am 2026-10-06 an der Test-Instanz geklärt, siehe Abschnitt „VERIFIZIERT" unten.
Der N+1-Fallback bleibt als Absicherung gegen andere Nextcloud-Versionen bestehen.
- Exakte `MAX_USERID_LENGTH` gegen die Test-Instanz prüfen; bis dahin defensiv 64 annehmen.

---

# VERIFIZIERT an der Test-Instanz (2026-10-06)

Gemessen mit `docs/nc-verify.sh` gegen `https://cloud.xapient.solutions`.
Diese Abschnitte ersetzen die oben als UNVERIFIZIERT markierten Punkte.

## V1. `users/details` — FALLE: `statuscode` unterscheidet sich zwischen v1 und v2
Beide Pfade antworten mit HTTP 200 und liefern **dieselbe** Datenstruktur
(`data.users` als Objekt, gekeyt nach `userid`). Aber:

| Pfad | `meta.statuscode` bei Erfolg |
|---|---|
| `/ocs/v1.php/cloud/users/details` | **100** |
| `/ocs/v2.php/cloud/users/details` | **200** |

**v2 verwendet HTTP-artige Codes im OCS-Envelope.** Eine Erfolgsprüfung auf
`statuscode === 100` schlägt gegen v2 bei *jedem* erfolgreichen Request fehl.

**Konsequenz:** Das Projekt benutzt **ausschließlich `/ocs/v1.php`**. Wer je einen Aufruf auf
v2 umstellt, muss die Envelope-Prüfung mitändern — sonst gilt jeder Erfolg als Fehler.

## V2. Quota ist auf BEIDEN Lesewegen ein Objekt
Entgegen der Doku-Stichprobe liefert auch der Einzeluser-Endpunkt ein Objekt, nicht einen Skalar:

```
GET /ocs/v1.php/cloud/users/{id}      -> quota: { free, used, total, relative, quota }
GET /ocs/v1.php/cloud/users/details   -> quota: { free, used, total, relative, quota }
```
Beispiel begrenzt: `{"free":1013296222,"used":60445602,"total":1073741824,"relative":5.63,"quota":1073741824}`

**Konsequenz:** Die Quota-Treue degradiert auf dem N+1-Fallback **nicht**. Der defensive Parser
bleibt trotzdem, weil der Skalar-Fall in der Doku für ältere Versionen belegt ist — aber die
Dashboard-Zahl „unbekannt" steigt im Fallback nicht, wie zuvor befürchtet.

## V3. Unbegrenztes Kontingent ist `-3` — bestätigt
Der Admin-Account liefert:
```
quota: { "free": -3, "used": 53983039299, "total": -3, "relative": 0, "quota": -3 }
```
- `quota`, `total` und `free` sind **`-3`**, nicht `"none"`. Der String `"none"` ist auf dieser
  Instanz nicht aufgetreten; der Parser muss beides akzeptieren.
- **`used` ist auch bei unbegrenzt eine echte Zahl.** Die Dashboard-Gesamtnutzung kann unbegrenzte
  User also mitzählen — nur die Summe der *Kontingente* nicht.
- `relative` ist bei unbegrenzt `0`. **Nicht** als „0 % belegt" interpretieren und nicht für die
  „fast voll"-Liste verwenden.

## V4. Gruppenmitglieder: `{ users: [...] }` — kein nacktes Array
```
GET /ocs/v1.php/cloud/groups/admin  ->  data: { "users": ["valueerror"] }
GET /ocs/v1.php/cloud/groups        ->  data: { "groups": ["2026-1C", ..., "admin", ...] }
```
Der zuvor befürchtete Shape-Zweifel ist ausgeräumt.

## V5. Maximale Username-Länge
65 Zeichen werden abgelehnt:
```
meta: { status: "failure", statuscode: 101, message: "Benutzername ist zu lang" }
```
Bestätigt `MAX_USERID = 64` als korrekte Obergrenze. Beachte: der Fehler kommt als `101` mit einer
**deutschen Servermeldung** — unsere eigene Meldung ist trotzdem vorzuziehen, weil `101` beim
Anlegen auch andere Ursachen hat.

## V6. User-IDs enthalten Großbuchstaben
Beispiel aus der echten Instanz: `Aaron.w`.
**Bestätigt die Entscheidung, Kollisionen case-insensitiv zu prüfen.** Ein Vergleich über exakte
Gleichheit hätte `aaron.w` als frei gemeldet und das Anlegen wäre serverseitig gescheitert.

## V7. `email` kann `null` sein
Nicht `""`, sondern `null`. Der Normalisierer in `userView.js` muss das abfangen, sonst steht
`null` in der Tabelle und im CSV-Export.

