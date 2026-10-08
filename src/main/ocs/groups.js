// Group endpoints, each function with its OWN local error-code map (ARCHITECTURE §2, REVIEW-NOTES 3).
import { mapOcsError } from './errors.js';

// No endpoint-specific codes documented for a plain group listing (RESEARCH-OCS §5).
const LIST_GROUPS_ERRORS = {};

// GET /cloud/groups -> data.groups is an array of group ids (RESEARCH-OCS V4, verified).
// Falls back to [] if data.groups is missing or not an array (S10-Review MINOR 1): ImportView
// renders serverGruppen.length without a guard, so an `undefined` here would throw during render.
export async function listGroups(client) {
  const result = await client.request({ method: 'GET', path: '/cloud/groups' });
  if (!result.ok) return mapOcsError(result, LIST_GROUPS_ERRORS, 'gruppenliste_fehlgeschlagen');
  const groups = Array.isArray(result.data?.groups) ? result.data.groups : [];
  return { ok: true, data: groups, httpStatus: result.httpStatus, versuche: result.versuche };
}

// Gruppe anlegen (RESEARCH-OCS §5): 101 ungültige Eingabe, 102 Gruppe existiert schon,
// 103 Anlegen fehlgeschlagen.
const CREATE_GROUP_ERRORS = {
  101: 'gruppe_anlegen_fehlgeschlagen',
  102: 'gruppe_existiert',
  103: 'gruppe_anlegen_fehlgeschlagen',
};

// POST /cloud/groups - groupid geht als Form-Feld, nicht im Pfad; buildFormBody (client.js)
// kodiert es bereits über URLSearchParams, kein zusätzliches encodeURIComponent nötig.
export async function createGroup(client, groupid) {
  const result = await client.request({ method: 'POST', path: '/cloud/groups', form: { groupid } });
  if (!result.ok) return mapOcsError(result, CREATE_GROUP_ERRORS, 'gruppe_anlegen_fehlgeschlagen');
  return { ok: true, data: result.data, httpStatus: result.httpStatus, versuche: result.versuche };
}
