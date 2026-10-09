// Result rows -> CSV text, fixed columns from ARCHITECTURE §5 / DECISIONS "Ergebnis-CSV Spalten".
// Pure, no I/O. `grund` is expected to already be the German display text (ItemResult.grund is
// `string`, resolved from messages.js by the caller, never a messageId).
import { resolveGrund } from './jobReport.js';

const HEADER = 'userid;aktion;status;grund;httpStatus;ocsCode';

// null/undefined -> empty field, never the text "null". Quote on ';', '"' or a newline, doubling
// inner quotes (A3 Pflichttest: a ';' inside grund).
function escapeField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[;"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildRow(result) {
  return [result.userid, result.aktion, result.status, result.grund, result.httpStatus, result.ocsCode]
    .map(escapeField)
    .join(';');
}

export function buildResultCsv(results) {
  const lines = [HEADER, ...results.map(buildRow)];
  // UTF-8 BOM so Excel doesn't mangle Umlaute; CRLF line endings throughout, including after the
  // last line.
  return `﻿${lines.join('\r\n')}\r\n`;
}

// Resolves each ItemResult's messageId grund to German text, then builds the CSV - moved out of
// JobProgress.vue's onExport (REVIEW-NOTES [S06] "jede abgeleitete Liste gehört in ein pures Modul").
export function buildResultCsvReport(results) {
  return buildResultCsv(results.map((r) => ({ ...r, grund: resolveGrund(r.grund) })));
}

// Import export (S11 A3, DECISIONS "Ergebnis-CSV: Spalten des Import-Exports"): columns 1-6
// identical to the batch report, plus a 7th column `passwort` - only filled by the caller for
// 'ok'/'teilweise' rows (ARCHITECTURE §5), empty otherwise via the same escapeField/null handling.
const IMPORT_HEADER = 'userid;aktion;status;grund;httpStatus;ocsCode;passwort';

function buildImportRow(result) {
  return [result.userid, result.aktion, result.status, result.grund, result.httpStatus, result.ocsCode, result.passwort]
    .map(escapeField)
    .join(';');
}

export function buildImportResultCsv(results) {
  const lines = [IMPORT_HEADER, ...results.map(buildImportRow)];
  return `﻿${lines.join('\r\n')}\r\n`;
}

// Same grund-resolution step as buildResultCsvReport, applied to the already-merged import rows
// (shared/importView.js#buildImportExportRows combines pipeline results with preview-rejected rows).
export function buildImportResultCsvReport(results) {
  return buildImportResultCsv(results.map((r) => ({ ...r, grund: resolveGrund(r.grund) })));
}
