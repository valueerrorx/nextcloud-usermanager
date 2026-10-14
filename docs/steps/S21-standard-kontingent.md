# S21 Standard-Kontingent

## Anlass
Nutzerwunsch: Beim Anlegen aus CSV soll das Kontingent auf dem **Standard-Kontingent des Servers**
stehen, nicht auf „Kein Kontingent“. Entscheidung (DECISIONS 2026-10-14 „Standard-Kontingent“):
gilt für CSV-Import, Einzel-Anlegen und als Option in „Kontingent setzen“ (Batch + Zeile).

## API-Fakt (vom Coder vor der Umsetzung zu belegen)
Nextcloud `apps/provisioning_api/lib/Controller/UsersController.php`: `editUser(…, 'quota', $value)`
akzeptiert `'none'` und `'default'` neben Bytes; `addUser` mit nicht-leerem `quota` leitet auf
dieselbe Prüfung. Der Coder belegt das mit URL + Zeile aus dem Nextcloud-Quellcode (GitHub,
aktueller stable-Branch) im Abschlussbericht und als einzeiligen Kommentar am Preset. Ist `default`
dort **nicht** zulässig: abbrechen und berichten, nichts bauen.

## Umsetzung
- `src/shared/quota.js`: neues Preset als **erstes** Element
  `{ id: 'standard', label: 'Standard-Kontingent (Server)', apiValue: 'default' }` (kein `bytes`).
  `formatQuotaForApi`: zuerst `if (preset.apiValue) return preset.apiValue;`, dann unverändert
  `bytes === null ? 'none' : String(bytes)`. Kein generisches `kind`-Feld, kein `apiValue` an
  anderen Presets. Quellen-Kommentar am Preset einzeilig, **englisch**.
- `src/renderer/state.js`: `importQuota = ref('standard')`; `resetOnConnect` setzt `'standard'`.
- `src/renderer/views/ImportView.vue`: `<option :value="null">Kein Kontingent</option>` entfernen,
  Label „Kontingent (optional)“ -> „Kontingent“. Der Guard `importQuota.value ? … : null` bleibt.
- `src/renderer/views/UsersView.vue` (Einzel-Anlegen): `<option :value="null">Server-Standard</option>`
  entfernen (sonst zwei Standard-Einträge), `neuQuota = ref('standard')`, `formularLeeren()` setzt
  `'standard'`.
- `src/shared/userCreate.js`: unverändert. `quotaId: null` -> `quota: null` bleibt Verhalten, die
  bestehenden Tests in `tests/userCreate.test.js` bleiben.
- `src/renderer/components/ActionBar.vue`: `inputValue: QUOTA_PRESETS[0].id` -> `inputValue: '1gb'`
  (Dialog-Vorbelegung bleibt 1 GB); Standard erscheint automatisch in der Liste.
- `src/shared/dryRun.js`: `quotaLabelFromValue('default')` -> `'Standard-Kontingent (Server)'`;
  `isQuotaNoOp`: explizit `if (value === 'default') return false;`. Kommentar Z. 34 um `'default'`
  ergänzen.
- Bestehende Tests, die **angepasst** (nicht abgeschwächt) werden müssen:
  `tests/quota.test.js` Z. ~103 (ID-Liste beginnt mit `'standard'`), Z. ~108-110 und ~114-118
  (Schleifen schließen `standard` explizit aus; `standard` eigener Test), `tests/state.test.js`
  Z. ~60 (`toBeNull()` -> `toBe('standard')`).
- docs: `docs/ARCHITECTURE.md` Z. ~73 eine Zeile zum Standard-Preset; `docs/MANUAL-TEST.md` neue
  Fälle mit Buchstabensuffix: (a) CSV-Import mit unveränderter Auswahl -> User hat in Nextcloud
  das Standard-Kontingent; (b) Einzel-Anlegen dito; (c) Batch „Kontingent setzen“ auf Standard;
  (d) Dialog „Kontingent setzen“ ist mit 1 GB vorbelegt.

## Akzeptanz
1. `formatQuotaForApi(findQuotaPreset('standard')) === 'default'`; alle anderen Presets
   unverändert; kein Preset liefert `'undefined'` oder `'NaN'`.
2. `createUser(client, { …, quota: 'default' })` sendet `quota=default` im Form-Body (gemockter
   `fetchImpl`, in `tests/ocsUsers.test.js`).
3. `buildSingleCreate({ quotaId: 'standard', … })` -> `quota: 'default'`.
4. Dry-Run „Kontingent setzen“ mit `'default'` für drei User (unbegrenzt, begrenzt, unbekannt
   `quota: 0`): alle drei in `auszufuehren`, Label `Standard-Kontingent (Server)` (nie „NaN GiB“).
5. `importQuota.value === 'standard'` beim frischen Modul-Import **und** nach `resetOnConnect`.
6. ActionBar-Vorbelegung `'1gb'`: Review-Check + MANUAL-TEST (d), kein eigener Unit-Test.
7. `npm test`, `npm run lint`, `npm run build` grün.

## Nicht im Scope
- Anzeige „Standard“ in der Usertabelle (der Server liefert den aufgelösten Wert; bleibt wie heute).
- Server-Standardkontingent lesen oder ändern.
- Alles aus S22-S25.
