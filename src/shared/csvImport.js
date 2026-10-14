// Import-CSV and username-list parsing, Stufen 1-9 of ARCHITECTURE §6. Pure, no I/O.
// CSV columns are Vorname, Nachname, Passwort. The third value is stored as geburtsdatum.
const MAX_ROWS = 2000;
const HEADER_FIELDS = ['vorname', 'nachname', 'passwort'];

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Counts ';' and ',' in the header line only (ARCHITECTURE §6 Stufe 3); more occurrences wins,
// a tie goes to ';' (German Excel). Exported so the tie-break rule is directly testable: a
// header line can never tie AND still validate as the exact three columns (adding a second
// delimiter character to force a tie always corrupts one of the three required field values),
// so this rule is unreachable from parseImportCsv's own success path.
export function detectDelimiter(headerLine) {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  if (semicolons === 0 && commas === 0) return null;
  return semicolons >= commas ? ';' : ',';
}

function isValidHeader(headerLine, delimiter) {
  const fields = headerLine.split(delimiter).map((f) => f.trim().toLowerCase());
  return fields.length === HEADER_FIELDS.length && fields.every((f, i) => f === HEADER_FIELDS[i]);
}

function hasUnbalancedQuotes(line) {
  const count = (line.match(/"/g) || []).length;
  return count % 2 !== 0;
}

// RawRow = { zeile, vorname, nachname, geburtsdatum, fehler? } (ARCHITECTURE §6).
function parseDataLine(line, zeile, delimiter, seen) {
  if (hasUnbalancedQuotes(line)) {
    return { zeile, vorname: '', nachname: '', geburtsdatum: '', fehler: 'quote_unbalanciert' };
  }
  const fields = line.split(delimiter);
  if (fields.length !== 3) {
    return { zeile, vorname: '', nachname: '', geburtsdatum: '', fehler: 'spaltenzahl' };
  }

  const vorname = fields[0].trim();
  const nachname = fields[1].trim();
  const geburtsdatum = fields[2].trim();

  if (vorname === '') return { zeile, vorname, nachname, geburtsdatum, fehler: 'vorname_leer' };
  if (nachname === '') return { zeile, vorname, nachname, geburtsdatum, fehler: 'nachname_leer' };

  // Stufe 9: raw-text duplicate, trimmed + case-insensitive, '|'-separated key (ARCHITECTURE §6).
  // Deliberately NOT normalizeComponent: that would already merge e.g. 'Anna Maria'/'AnnaMaria'
  // here and make the in-file collision path (Stufe 14b) unreachable.
  const key = [vorname.toLowerCase(), nachname.toLowerCase(), geburtsdatum.toLowerCase()].join('|');
  if (seen.has(key)) return { zeile, vorname, nachname, geburtsdatum, fehler: 'doppelzeile' };
  seen.add(key);

  return { zeile, vorname, nachname, geburtsdatum };
}

export function parseImportCsv(text) {
  const decoded = normalizeNewlines(stripBom(String(text ?? '')));
  const allLines = decoded.split('\n');
  while (allLines.length > 0 && allLines[allLines.length - 1].trim() === '') allLines.pop();

  if (allLines.length === 0) return { ok: false, rows: [], fileError: 'datei_leer' };

  const headerLine = allLines[0];
  const delimiter = detectDelimiter(headerLine);
  if (!delimiter || !isValidHeader(headerLine, delimiter)) {
    return { ok: false, rows: [], fileError: 'header_fehlt' };
  }

  const dataLines = allLines.slice(1);
  if (dataLines.length === 0) return { ok: false, rows: [], fileError: 'nur_header' };
  if (dataLines.length > MAX_ROWS) return { ok: false, rows: [], fileError: 'zeilenlimit' };

  const seen = new Set();
  const rows = dataLines.map((line, idx) => parseDataLine(line, idx + 1, delimiter, seen));
  return { ok: true, rows };
}

// Batch-Input: one username per line, optional 'Username' header, blank lines dropped.
export function parseUserList(text) {
  const decoded = normalizeNewlines(stripBom(String(text ?? '')));
  const lines = decoded
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length > 0 && lines[0].toLowerCase() === 'username') lines.shift();
  return { ok: true, usernames: lines };
}
