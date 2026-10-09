// S14: Einzel-User anlegen über die bestehende user.create-Pipeline. Pure, kein I/O.
import { validateUserid } from './username.js';
import { findQuotaPreset, formatQuotaForApi } from './quota.js';
import { resolveGrund } from './jobReport.js';
import { MESSAGES } from './messages.js';

export function kannAnlegen({ userid, password, laeuft }) {
  return userid !== '' && useridHinweis(userid) === null && password.trim() !== '' && !laeuft;
}

// Hinweistext zur manuell eingegebenen userid, null bei leerer oder gültiger Eingabe.
export function useridHinweis(wert) {
  if (wert === '') return null;
  const pruefung = validateUserid(wert, { quelle: 'manuell' });
  return pruefung.ok ? null : MESSAGES[pruefung.messageId];
}

// Ein Item, params-Form wie im Import (S11): byUserid trägt Passwort und Anzeigename.
export function buildSingleCreate({ userid, password, displayName, groups, quotaId }) {
  const preset = quotaId ? findQuotaPreset(quotaId) : null;
  return {
    items: [userid],
    params: {
      byUserid: { [userid]: { password: password.trim(), displayName: displayName.trim() === '' ? undefined : displayName.trim() } },
      groups,
      quota: preset ? formatQuotaForApi(preset) : null,
    },
  };
}

// Übersetzt das ItemResult eines Ein-Item-Jobs in eine Formularmeldung.
export function einzelErgebnis(result) {
  if (result.status === 'ok') return { erfolg: true, text: MESSAGES.benutzer_angelegt };
  if (result.status === 'teilweise') {
    return { erfolg: true, text: `${MESSAGES.benutzer_angelegt} ${resolveGrund(result.grund)}` };
  }
  return { erfolg: false, text: resolveGrund(result.grund) ?? MESSAGES.benutzer_anlegen_fehlgeschlagen };
}
