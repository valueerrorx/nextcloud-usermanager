# S03a + S04 — URL-Normalisierung, Verbindung, Credentials, TLS

Status: spec (schlanker Modus — ein Review, MINOR wird notiert)
Bindend: `CLAUDE.md`, `docs/ARCHITECTURE.md` §3, §7, §8, §9, `docs/DECISIONS.md`,
`docs/REVIEW-NOTES.md` (20 Einträge).

## Ziel

Die App kann sich mit einer echten Nextcloud verbinden. Erst nach erfolgreicher Verbindung sind
Dashboard, Benutzer, Gruppen und Import erreichbar. Zugangsdaten werden nur mit echtem Keyring
persistiert, sonst nur für die Sitzung. Selbstsignierte Zertifikate nach Fingerprint-Bestätigung.

Umsetzung in **zwei Durchläufen**: A = Main-Prozess, B = Renderer.

---

## ARCHITEKTURKORREKTUR: `app.on('certificate-error')` ist der falsche Hook

§8 nennt `app.on('certificate-error')`. Das feuert **nur für `webContents`** — also für
Renderer-Navigation, **nicht** für `net.fetch`. Mit dem bisherigen Plan könnte der
Fingerprint-Dialog nie erscheinen und die vom Nutzer gewählte Zertifikatsausnahme wäre toter Code.

**Verbindlich stattdessen:**
- `fetchImpl` = **`net.fetch`** aus `electron` (Chromium-Netzwerkstack).
- Zertifikatsprüfung über **`session.defaultSession.setCertificateVerifyProc(proc)`**.
- `proc({ hostname, certificate, validatedCertificate, verificationResult, errorCode }, callback)`:
  - `verificationResult === 'net::OK'` -> `callback(-3)` (**Chromiums Default übernehmen**, nichts
    aufweichen).
  - Sonst: Host **und** Fingerprint gleich `session.certException` -> `callback(0)`.
  - Sonst: Prompt an den Renderer, auf Antwort warten. Akzeptiert -> Ausnahme setzen,
    `callback(0)`. Abgelehnt oder Timeout -> `callback(-2)`.
- **Verboten bleiben:** `setUsePlainTextEncryption`, `ignore-certificate-errors`,
  `webSecurity: false`, `NODE_TLS_REJECT_UNAUTHORIZED`, ein pauschales `callback(0)`.

**Prüfe die Signaturen gegen `node_modules/electron/electron.d.ts`**, bevor du etwas schreibst —
`setCertificateVerifyProc`, `net.fetch`, `Certificate`. REVIEW-NOTES `[S01]`: Signaturen nachlesen,
nicht raten. Unterstützt `net.fetch` kein `signal`, melde das statt es zu umgehen.

**Fingerprint-Format:** SHA-256 als Hex in Doppelpunktgruppen (`AB:CD:…`), berechnet aus dem
PEM in `certificate.data` mit `node:crypto`. Electrons `certificate.fingerprint` ist
`sha256/<base64>` und für den Vergleich durch den Nutzer unbrauchbar.

---

## Teil A — Main-Prozess

### A1. `src/shared/url.js` (pur)

`normalizeBaseUrl(input)` -> `{ ok: true, baseUrl }` | `{ ok: false, messageId }`

Reihenfolge: leer/kein String -> `url_leer` · kein `://` -> `url_kein_schema` ·
nicht als `URL` parsebar -> `url_ungueltig` · Protokoll nicht `https:` -> `url_nur_https` ·
`username` oder `password` gesetzt -> `url_mit_zugangsdaten`.

**Erst parsen, dann Protokoll prüfen** — ein Stringvergleich würde `HTTPS://host` fälschlich
ablehnen.

Aufbau des Ergebnisses: `url.protocol + '//' + url.host` (Port bleibt, Host ist schon lowercase)
plus Pfadsegmente, **abgeschnitten beim ersten** Segment, dessen Kleinschreibung in
`{'ocs','index.php','settings','apps','login'}` liegt. Leere Segmente weg, `search`/`hash` weg,
kein Trailing Slash. Pfad-Groß-/Kleinschreibung **bleibt** (Subpfade sind case-sensitiv).

Pflichttabelle:
| Eingabe | Ergebnis |
|---|---|
| `https://cloud.xapient.solutions` · `…/` · `…///` | `https://cloud.xapient.solutions` |
| `https://Cloud.Xapient.Solutions` | `https://cloud.xapient.solutions` |
| `HTTPS://host` | `https://host` |
| `https://host/nextcloud` · `…/nextcloud/` | `https://host/nextcloud` |
| `https://host/NextCloud` | `https://host/NextCloud` (Pfad-Case bleibt) |
| `https://host:8443/nextcloud` | `https://host:8443/nextcloud` |
| `https://192.168.1.10/nextcloud` | unverändert |
| `https://host/index.php` | `https://host` |
| `https://host/nextcloud/index.php` | `https://host/nextcloud` |
| `https://host/ocs/v1.php/cloud/users` | `https://host` |
| `https://host/nextcloud/ocs/v2.php` | `https://host/nextcloud` |
| `https://host/settings/admin` · `/login` | `https://host` |
| `https://host/?foo=1#x` · `https://host?` | `https://host` |
| `http://host` · `ftp://host` | `url_nur_https` |
| `cloud.xapient.solutions` | `url_kein_schema` |
| `''` · `'   '` · `null` · `42` | `url_leer` |
| `https://` | `url_ungueltig` |
| `https://admin:geheim@host` | `url_mit_zugangsdaten` |

Beim Zugangsdaten-Fall zusätzlich behaupten, dass weder `admin:` noch `geheim` im Rückgabeobjekt
vorkommen.

**Akzeptiert als Kollateralschaden:** ein echter Subpfad namens `apps` oder `ocs` wird
abgeschnitten. Nicht „reparieren".

### A2. `src/main/session.js`
Nur Speicher, nie Platte. Hält: `client` (OCS-Client-Instanz), `baseUrl`, `adminUser`,
`adminUserId`, `secretStorage` (`'keyring' | 'session'`), `certException` (`{host, fingerprint}`
oder `null`), `userListMode` (`null` bis S05), Jobzustände (`'laufend' | 'beendet'`) und
Stop-Flags. Getter/Setter, kein Rechnen. **Das Klartextpasswort lebt nur hier** und wird in keinen
IPC-Rückgabewert geschrieben.

### A3. `src/main/credentials.js`
- `probeStorage()` -> `'keyring' | 'session'`: `safeStorage.isEncryptionAvailable()` und auf Linux
  `getSelectedStorageBackend()`. `gnome_libsecret`/`kwallet*` -> `keyring`, sonst -> `session`.
- `save({ baseUrl, adminUser, appPassword })`: nur bei `keyring`. Datei
  `credentials.json` in `app.getPath('userData')`: `{ baseUrl, adminUser, secret: <base64> }`.
  Bei `session` **nicht schreiben** und `messageId: 'kein_keyring_nur_sitzung'` melden.
- `load()` -> `{ baseUrl, adminUser, appPassword }` oder `null`. Entschlüsseln **nur** hier.
- `forget()` löscht die Datei.
- Defekte oder nicht entschlüsselbare Datei -> wie „kein gespeicherter Zugang", Datei löschen.

### A4. `src/main/ocs/connection.js`
`checkConnection({ baseUrl, adminUser, appPassword, fetchImpl })`:
`GET /cloud/users?limit=1` über einen frischen `createOcsClient`.
Erfolg = `ok: true`. `adminUserId` = der **eingegebene** Loginname (DECISIONS), nicht aus der
Antwort. Fehler werden **unverändert** aus dem Client übernommen — der Client klassifiziert
bereits 401/403/429/notOcs/cert/network/timeout. **Keine zweite Fehlertabelle.**

### A5. `src/main/tls.js`
Wie in der Architekturkorrektur oben. Zusätzlich:
- **Genau EINE Ausnahme insgesamt**, nicht eine pro Host (Korrektur gegenüber der ersten
  Spec-Fassung). Die App verbindet sich zu genau einem Server; Profillisten sind ein Nicht-Ziel
  (GOAL Zeile 8). Ein anderer Host erzeugt einen neuen Prompt und **überschreibt** die bestehende
  Ausnahme. Der Kommentar im Code darf nicht „one exception per host" behaupten.
- `requestId` ist eine Zufalls-ID; eine Antwort auf eine unbekannte oder abgelaufene ID wird
  verworfen und der zugehörige `callback` mit `-2` beantwortet.
- **Prompt-Timeout 120 s** -> `callback(-2)`, ID verfällt. Ein hängender `callback` würde den
  Request-Stack blockieren.
- Ausnahme wird **nie** auf Platte geschrieben und gilt nur für die Sitzung.

### A6. `src/main/ipc.js` — vier neue Kanäle plus zwei TLS
`connection.connect`, `connection.connectSaved`, `connection.status`, `connection.forgetSaved`,
`tls.onCertificatePrompt` (main->renderer), `tls.respondCertificate`.
Formen exakt wie ARCHITECTURE §3.

`connect` normalisiert zuerst die URL, prüft dann die Verbindung und schreibt **erst bei Erfolg**
Credentials, `adminUserId` und Client in die Session. Ein Fehlschlag lässt die Session
**unverändert**. `status` gibt **nie** das Passwort zurück — nur `hasSaved`, `savedBaseUrl`,
`savedAdminUser`.

### A7. `src/preload/index.cjs`
Die sechs Methoden namentlich ergänzen. Event-Abos (`tls.onCertificatePrompt`) geben einen
**Disposer** zurück, damit ein Remount keine Listener stapelt.

---

## Teil B — Renderer

### B1. `src/renderer/views/ConnectView.vue`
Felder Server-URL, Admin-Benutzer, App-Passwort, Checkbox „Zugang speichern", Button „Verbinden".
Bei vorhandenem gespeicherten Zugang zusätzlich „Mit gespeichertem Zugang verbinden",
vorbefüllt mit `savedBaseUrl`/`savedAdminUser` — **nie** mit dem Passwort.
Fehler erscheinen als deutscher Text aus `messages.js` am Formular, nicht als swal2-Popup.
Bei `secretStorage === 'session'`: swal2-Warnung plus dauerhafter Hinweis
„Zugang gilt nur für diese Sitzung".
Wird ein gespeichertes Passwort abgelehnt: Dialog bleibt offen, Passwortfeld leer, Meldung
`gespeichertes_passwort_abgelehnt`, gespeicherter Satz bleibt bis „Zugang löschen".

### B2. `src/renderer/App.vue` + `state.js`
- `state.js`: `connection` (aus `connection.status`), `certException`.
- **View-Gating:** Dashboard, Benutzer, Gruppen, Import sind deaktiviert und nicht anwählbar,
  solange `connected === false`. Startansicht ist `connect`.
- **Permanentes Banner**, solange `certException` gesetzt ist:
  „Unsichere Zertifikatsausnahme aktiv für `<host>` (`<fingerprint>`)".
- Zertifikats-Prompt als swal2-Dialog mit Host, Fingerprint, Subject, Issuer, Gültigkeit und zwei
  Buttons. Der Fingerprint muss **kopierbar** dargestellt sein.

---

## Neue messageIds

| id | deutsche Meldung |
|---|---|
| `url_leer` | Bitte eine Server-Adresse eingeben. |
| `url_kein_schema` | Die Adresse braucht ein Schema, zum Beispiel https://. |
| `url_nur_https` | Nur https wird unterstützt. |
| `url_ungueltig` | Diese Adresse ist ungültig. |
| `url_mit_zugangsdaten` | Die Adresse darf keinen Benutzernamen oder Passwort enthalten. |
| `kein_keyring_nur_sitzung` | Kein Systemschlüsselbund gefunden. Der Zugang gilt nur für diese Sitzung. |
| `kein_gespeicherter_zugang` | Es ist kein gespeicherter Zugang vorhanden. |
| `gespeichertes_passwort_abgelehnt` | Das gespeicherte Passwort wurde abgelehnt. Bitte neu eingeben. |
| `secret_nicht_gespeichert` | Der Zugang konnte nicht gespeichert werden. |
| `zertifikat_abgelehnt` | Die Zertifikatsausnahme wurde abgelehnt. |
| `zertifikat_anfrage_abgelaufen` | Diese Zertifikatsanfrage ist abgelaufen oder unbekannt. |
| `zugang_loeschen_fehlgeschlagen` | Der gespeicherte Zugang konnte nicht gelöscht werden. |

## Abnahmekriterien

**Automatisiert (Ziel ~30 Tests, nicht mehr):**
1. `normalizeBaseUrl`: die volle Tabelle aus A1, plus die Zugangsdaten-Assertion.
2. `credentials`: `basic_text` -> **keine** Datei geschrieben, `secretStorage: 'session'`,
   `messageId: 'kein_keyring_nur_sitzung'`. Keyring -> Datei mit base64-`secret`, Klartext
   **nicht** in der Datei. Defekte Datei -> wie „kein Zugang", Datei gelöscht.
   `node:fs/promises` und `electron` gemockt.
3. `checkConnection`: Erfolg; 401; 403; 429; HTML; Netz — jeweils die `messageId` **aus dem
   Client**, keine eigene Tabelle. `adminUserId` ist der eingegebene Name, auch bei anderer
   Groß-/Kleinschreibung in der Antwort.
4. `connect` schreibt die Session **nur** bei Erfolg: nach einem 401 ist
   `session.connected === false` und `session.client === null`.
5. **Kein Secret in `connection.status`:** Rückgabe mit `JSON.stringify` serialisieren und
   behaupten, dass Passwort **und** dessen base64-Form nicht vorkommen. *(Mutationsbeweis
   erforderlich — Secret-Grenze.)*
6. `setCertificateVerifyProc`: `net::OK` -> `callback(-3)`; passende Ausnahme -> `callback(0)`;
   unbekanntes Zertifikat ohne Antwort innerhalb des Timeouts -> `callback(-2)`; Antwort auf
   unbekannte `requestId` -> verworfen. *(Mutationsbeweis für das `-3`: ein pauschales
   `callback(0)` muss einen Test rot machen — Secret-/Sicherheitsgrenze.)*
7. `mainWindow`-Flags bleiben grün; Preload exponiert die neuen Methoden **namentlich**,
   kein generischer Durchgriff.

**Manuell** (in `docs/MANUAL-TEST.md` eintragen):
Verbinden gegen `https://cloud.xapient.solutions`; falsches Passwort; falsche URL; Nicht-Admin;
Speichern und Neustart; Verhalten ohne Keyring; Views vor dem Verbinden gesperrt.

## Ausdrücklich NICHT

- Kein `ocs/users.js`, `ocs/groups.js`, `ocs/userList.js`, keine `users/details`-Probe,
  kein `userView.js`, `quota.js`, `filters.js`, `dashboard.js`.
- Keine Userliste, keine Tabelle, kein Dashboard-Inhalt — die vier Views bleiben leere
  Platzhalter, nur eben gesperrt bzw. freigeschaltet.
- Kein `ocs/errors.js` (S05), keine Endpunkt-Fehlerkarten.
- Keine Pipeline, kein Pool, kein Batch, kein CSV.
- Keine Profilliste, kein `electron-store`, keine persistierte Zertifikatsausnahme.
- Keine neuen Abhängigkeiten.
- **Scope-Guards pflegen:** `tests/skeleton.test.js` verbietet noch `session.js`,
  `credentials.js`, `tls.js`, `files.js` in `src/main/`. Die ersten drei entstehen jetzt —
  Eintrag entsprechend anpassen (REVIEW-NOTES `[S03]`).
