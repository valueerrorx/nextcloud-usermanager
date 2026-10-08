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
