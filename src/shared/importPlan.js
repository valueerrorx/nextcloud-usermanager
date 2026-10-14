// Import plan, Stufen 10-18 of ARCHITECTURE §6. Pure, no I/O.
// The password column is used verbatim and never feeds the username.
import {
  MAX_USERID,
  normalizeComponent,
  normalizeOrder,
  buildUsername,
  truncateToFit,
  validateUserid,
} from './username.js';

const ONLY_DOTS = /^\.+$/;

function isUnmappable(normalized) {
  return normalized === '' || ONLY_DOTS.test(normalized);
}

// Builds the displayname/base fields shared by every outcome of a row.
function baseFields(row) {
  return {
    zeile: row.zeile,
    vorname: row.vorname,
    nachname: row.nachname,
    displayname: `${row.vorname} ${row.nachname}`,
  };
}

function fehlerZeile(row, fehlerId, { username = null, gekuerzt = false } = {}) {
  return {
    ...baseFields(row),
    username,
    status: 'fehler',
    gekuerzt,
    fehlerId,
    passwort: null,
  };
}

function erfolgsZeile(row, { username, status, gekuerzt }) {
  return {
    ...baseFields(row),
    username,
    status,
    gekuerzt,
    passwort: row.passwort,
  };
}

// Builds one candidate; n === 1 is the base name, n >= 2 gets the counter suffix '.n'.
function buildKandidat(row, normVorname, normNachname, n, ctx) {
  const suffix = n === 1 ? '' : `.${n}`;
  const trunc = truncateToFit({ first: normVorname, second: normNachname, suffix, max: ctx.max });
  if (!trunc.passt) return { passt: false };
  const kandidat = buildUsername(row.vorname, trunc.second, normalizeOrder(ctx.order)) + suffix;
  return { passt: true, kandidat, gekuerzt: trunc.gekuerzt };
}

// Processes one RawRow through Stufen 10-15 and returns the PreviewRow.
function processRow(row, ctx) {
  // Stufe 1-9 Zeilenfehler verlassen die Pipeline sofort, ohne Kandidaten.
  if (row.fehler) return fehlerZeile(row, row.fehler);

  // Stufe 10
  const normVorname = normalizeComponent(row.vorname);
  const normNachname = normalizeComponent(row.nachname);
  if (isUnmappable(normVorname) || isUnmappable(normNachname)) {
    return fehlerZeile(row, 'name_nicht_abbildbar');
  }

  // Stufe 12: Basis-Kandidat ohne Suffix. first = Vorname (nie gekuerzt), second = Nachname.
  const basis = buildKandidat(row, normVorname, normNachname, 1, ctx);
  if (!basis.passt) return fehlerZeile(row, 'username_zu_lang');

  // Stufe 13: Kollision mit bestehendem Nextcloud-User ist ein harter Fehler, kein Weiterzaehlen.
  if (ctx.serverSet.has(basis.kandidat.toLowerCase())) {
    return fehlerZeile(row, 'benutzer_existiert_bereits', { username: basis.kandidat, gekuerzt: basis.gekuerzt });
  }
  if (!ctx.vergeben.has(basis.kandidat.toLowerCase())) {
    return finalizeKandidat(row, ctx, { ...basis, status: 'neu' });
  }

  // Stufe 14: in der Datei belegt -> Zaehlersuffix .2, .3, ... (endet: Kuerzung scheitert -> username_zu_lang, oder ein Platz ist frei, da die Registry endlich ist).
  for (let n = 2; ; n += 1) {
    const cand = buildKandidat(row, normVorname, normNachname, n, ctx);
    if (!cand.passt) return fehlerZeile(row, 'username_zu_lang', { username: basis.kandidat, gekuerzt: basis.gekuerzt });
    const lower = cand.kandidat.toLowerCase();
    if (ctx.serverSet.has(lower)) {
      return fehlerZeile(row, 'benutzer_existiert_bereits', { username: cand.kandidat, gekuerzt: cand.gekuerzt });
    }
    if (!ctx.vergeben.has(lower)) return finalizeKandidat(row, ctx, { ...cand, status: 'kollision_aufgeloest' });
  }
}

// Stufe 15: Validierung am finalen String (nach Kuerzung und Suffix), erst jetzt.
function finalizeKandidat(row, ctx, { kandidat, gekuerzt, status }) {
  const validation = validateUserid(kandidat, { quelle: 'generator' });
  if (!validation.ok) return fehlerZeile(row, validation.messageId, { username: kandidat, gekuerzt });
  // Stufe 18: nur Zeilen, die Stufe 15 bestanden haben, kommen in die Registry.
  ctx.vergeben.add(kandidat.toLowerCase());
  return erfolgsZeile(row, { username: kandidat, status, gekuerzt });
}

export function buildImportPlan({ rows = [], serverUserIds = [], order, max = MAX_USERID } = {}) {
  const ctx = {
    serverSet: new Set(serverUserIds.map((id) => String(id).toLowerCase())),
    vergeben: new Set(), // finale Usernamen (lowercase) dieser Datei
    order,
    max,
  };

  const previewRows = [];
  let neu = 0;
  let kollisionAufgeloest = 0;
  let fehler = 0;

  for (const row of rows) {
    const preview = processRow(row, ctx);
    previewRows.push(preview);
    if (preview.status === 'neu') neu += 1;
    else if (preview.status === 'kollision_aufgeloest') kollisionAufgeloest += 1;
    else fehler += 1;
  }

  return { rows: previewRows, summary: { neu, kollisionAufgeloest, fehler } };
}
