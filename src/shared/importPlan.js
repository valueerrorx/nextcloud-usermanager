// Import plan, Stufen 10-18 of ARCHITECTURE §6. Pure, no I/O.
// Birthdate parsing is re-run here (same pure parseBirthdate as csvImport.js, see the step
// report): RawRow only carries the raw geburtsdatum string, and rows can also be constructed
// directly for tests without going through parseImportCsv at all, so this is the only place
// ddmmyyyy is guaranteed to be derived.
import { parseBirthdate } from './birthdate.js';
import { buildInitialPassword } from './password.js';
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

function fehlerZeile(row, fehlerId, { ddmmyyyy = null, username = null, gekuerzt = false } = {}) {
  return {
    ...baseFields(row),
    ddmmyyyy,
    username,
    status: 'fehler',
    gekuerzt,
    fehlerId,
    passwort: null,
  };
}

function erfolgsZeile(row, { ddmmyyyy, username, status, gekuerzt, prefix }) {
  return {
    ...baseFields(row),
    ddmmyyyy,
    username,
    status,
    gekuerzt,
    passwort: buildInitialPassword(prefix, ddmmyyyy),
  };
}

// Processes one RawRow through Stufen 8 (Geburtsdatum) and 10-15, returns a PreviewRow plus the
// identitaet to register (Stufe 18 decides whether that registration actually happens).
function processRow(row, ctx) {
  // Stufe 1-9 Zeilenfehler verlassen die Pipeline sofort, ohne Kandidaten.
  if (row.fehler) return { preview: fehlerZeile(row, row.fehler), identitaet: null };

  const parsedDate = parseBirthdate(row.geburtsdatum, { heute: ctx.heute });
  if (!parsedDate.ok) return { preview: fehlerZeile(row, parsedDate.messageId), identitaet: null };
  const { ddmmyyyy } = parsedDate;

  // Stufe 10
  const normVorname = normalizeComponent(row.vorname);
  const normNachname = normalizeComponent(row.nachname);
  if (isUnmappable(normVorname) || isUnmappable(normNachname)) {
    return { preview: fehlerZeile(row, 'name_nicht_abbildbar', { ddmmyyyy }), identitaet: null };
  }

  const order = normalizeOrder(ctx.order);
  const identitaet = `${normVorname}|${normNachname}|${ddmmyyyy}`;

  // Stufe 12: Kuerzung ohne Suffix. first = Vorname (nie gekuerzt), second = Nachname.
  const trunc1 = truncateToFit({ first: normVorname, second: normNachname, suffix: '', max: ctx.max });
  if (!trunc1.passt) return { preview: fehlerZeile(row, 'username_zu_lang', { ddmmyyyy }), identitaet: null };
  const kandidatA = buildUsername(row.vorname, trunc1.second, order);

  // Stufe 13: Kollision mit bestehendem Nextcloud-User ist ein harter Fehler, nichts wird aufgeloest.
  if (ctx.serverSet.has(kandidatA.toLowerCase())) {
    return {
      preview: fehlerZeile(row, 'benutzer_existiert_bereits', { ddmmyyyy, username: kandidatA, gekuerzt: trunc1.gekuerzt }),
      identitaet: null,
    };
  }

  const belegtA = ctx.vergeben.get(kandidatA.toLowerCase());

  // Stufe 14a: kandidatA ist frei in der Datei.
  if (belegtA === undefined) {
    return finalizeKandidat(row, ctx, {
      kandidat: kandidatA,
      ddmmyyyy,
      gekuerzt: trunc1.gekuerzt,
      status: 'neu',
      identitaet,
    });
  }

  // Stufe 14b: gleiche identitaet -> kein Suffix hilft, derselbe Mensch unter anderer Schreibweise.
  if (belegtA === identitaet) {
    return {
      preview: fehlerZeile(row, 'benutzer_existiert_bereits', { ddmmyyyy, username: kandidatA, gekuerzt: trunc1.gekuerzt }),
      identitaet: null,
    };
  }

  // Stufe 14c: verschiedene identitaet -> Suffix anhaengen, Stufe 12 erneut mit diesem Suffix.
  const suffix = `.${ddmmyyyy}`;
  const trunc2 = truncateToFit({ first: normVorname, second: normNachname, suffix, max: ctx.max });
  if (!trunc2.passt) {
    return {
      preview: fehlerZeile(row, 'username_zu_lang', { ddmmyyyy, username: kandidatA, gekuerzt: trunc1.gekuerzt }),
      identitaet: null,
    };
  }
  const kandidatB = buildUsername(row.vorname, trunc2.second, order) + suffix;

  // Stufe 14d
  if (ctx.serverSet.has(kandidatB.toLowerCase())) {
    return {
      preview: fehlerZeile(row, 'benutzer_existiert_bereits', { ddmmyyyy, username: kandidatB, gekuerzt: trunc2.gekuerzt }),
      identitaet: null,
    };
  }

  const belegtB = ctx.vergeben.get(kandidatB.toLowerCase());

  // Stufe 14e: kandidatB frei in der Datei.
  if (belegtB === undefined) {
    return finalizeKandidat(row, ctx, {
      kandidat: kandidatB,
      ddmmyyyy,
      gekuerzt: trunc2.gekuerzt,
      status: 'kollision_aufgeloest',
      identitaet,
    });
  }

  // Stufe 14f: kandidatB auch schon belegt.
  if (belegtB === identitaet) {
    return {
      preview: fehlerZeile(row, 'benutzer_existiert_bereits', { ddmmyyyy, username: kandidatB, gekuerzt: trunc2.gekuerzt }),
      identitaet: null,
    };
  }
  return {
    preview: fehlerZeile(row, 'username_nach_kuerzung_nicht_eindeutig', { ddmmyyyy, username: kandidatB, gekuerzt: trunc2.gekuerzt }),
    identitaet: null,
  };
}

// Stufe 15: Validierung am finalen String (nach Kuerzung und Suffix), erst jetzt.
function finalizeKandidat(row, ctx, { kandidat, ddmmyyyy, gekuerzt, status, identitaet }) {
  const validation = validateUserid(kandidat, { quelle: 'generator' });
  if (!validation.ok) {
    return { preview: fehlerZeile(row, validation.messageId, { ddmmyyyy, username: kandidat, gekuerzt }), identitaet: null };
  }
  return {
    preview: erfolgsZeile(row, { ddmmyyyy, username: kandidat, status, gekuerzt, prefix: ctx.prefix }),
    identitaet,
  };
}

export function buildImportPlan({ rows = [], serverUserIds = [], order, prefix, max = MAX_USERID, heute } = {}) {
  const ctx = {
    serverSet: new Set(serverUserIds.map((id) => String(id).toLowerCase())),
    vergeben: new Map(), // finalName.toLowerCase() -> identitaet (Stufe 14 Registry)
    order,
    prefix,
    max,
    heute,
  };

  const previewRows = [];
  let neu = 0;
  let kollisionAufgeloest = 0;
  let fehler = 0;

  for (const row of rows) {
    const { preview, identitaet } = processRow(row, ctx);
    previewRows.push(preview);
    if (preview.status === 'neu') neu += 1;
    else if (preview.status === 'kollision_aufgeloest') kollisionAufgeloest += 1;
    else fehler += 1;

    // Stufe 18: nur Zeilen, die Stufe 15 bestanden haben, registrieren.
    if (identitaet) ctx.vergeben.set(preview.username.toLowerCase(), identitaet);
  }

  return { rows: previewRows, summary: { neu, kollisionAufgeloest, fehler } };
}
