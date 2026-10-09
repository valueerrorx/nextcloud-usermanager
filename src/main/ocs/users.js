// User endpoints, each function with its OWN local error-code map (ARCHITECTURE §2, REVIEW-NOTES 3).
import { mapOcsError } from './errors.js';

// No endpoint-specific codes documented for a plain user listing (RESEARCH-OCS §5).
const LIST_IDS_ERRORS = {};

// GET /cloud/users -> data.users is an array of id strings.
export async function listUserIds(client) {
  const result = await client.request({ method: 'GET', path: '/cloud/users' });
  if (!result.ok) return mapOcsError(result, LIST_IDS_ERRORS, 'userliste_fehlgeschlagen');
  return { ok: true, data: result.data?.users, httpStatus: result.httpStatus, versuche: result.versuche };
}

const LIST_DETAILS_ERRORS = {};

// GET /cloud/users/details -> data.users is an object keyed by userid.
export async function listUserDetails(client) {
  const result = await client.request({ method: 'GET', path: '/cloud/users/details' });
  if (!result.ok) return mapOcsError(result, LIST_DETAILS_ERRORS, 'userliste_fehlgeschlagen');
  return { ok: true, data: result.data?.users, httpStatus: result.httpStatus, versuche: result.versuche };
}

// 101 here means "user not found" for this endpoint; 404/998 fall through via `kind` unchanged.
const GET_USER_ERRORS = { 101: 'user_nicht_gefunden' };

// GET /cloud/users/{userid} -> data is the raw single-user object.
// userid is encodeURIComponent-encoded here: the client never encodes paths itself
// (DECISIONS "Pfad-Encoding liegt beim Aufrufer"), and real ids contain '.' and uppercase letters.
export async function getUser(client, userid) {
  const result = await client.request({ method: 'GET', path: `/cloud/users/${encodeURIComponent(userid)}` });
  if (!result.ok) return mapOcsError(result, GET_USER_ERRORS, 'userliste_fehlgeschlagen');
  return { ok: true, data: result.data, httpStatus: result.httpStatus, versuche: result.versuche };
}

// "User anlegen" codes (RESEARCH-OCS §5 / S11 A1). 108/110 (E-Mail erforderlich) can only happen
// if an instance is configured to require email even with a password set - we always set a
// password (DECISIONS), so this is unreachable in practice but still mapped defensively.
const CREATE_USER_ERRORS = {
  101: 'aktion_fehlgeschlagen',
  102: 'benutzer_existiert_bereits',
  104: 'gruppe_existiert_nicht',
  105: 'kein_recht_fuer_gruppe',
  107: 'passwort_policy',
  108: 'aktion_fehlgeschlagen',
  110: 'aktion_fehlgeschlagen',
  111: 'userid_nicht_erzeugbar',
};

// POST /cloud/users. No `groups[]` here on purpose (S11 A1/A2, ARCHITECTURE §5): sending groups
// along with the create call would make a group failure indistinguishable from a create failure.
// client.request/buildFormBody already drops undefined/null form values, so a missing quota is
// simply omitted, never sent as the string "undefined".
export async function createUser(client, { userid, password, displayName, quota }) {
  const result = await client.request({
    method: 'POST',
    path: '/cloud/users',
    form: { userid, password, displayName, quota },
  });
  if (!result.ok) return mapOcsError(result, CREATE_USER_ERRORS, 'aktion_fehlgeschlagen');
  return { ok: true, data: result.data, httpStatus: result.httpStatus, versuche: result.versuche };
}

// Enable/Disable/Delete: only 100/101 confirmed (RESEARCH-OCS §5); 101 is the only
// endpoint-specific code, every other failure kind falls through via mapOcsError unchanged.
const ENABLE_USER_ERRORS = { 101: 'aktion_fehlgeschlagen' };

// PUT /cloud/users/{userid}/enable
export async function enableUser(client, userid) {
  const result = await client.request({ method: 'PUT', path: `/cloud/users/${encodeURIComponent(userid)}/enable` });
  if (!result.ok) return mapOcsError(result, ENABLE_USER_ERRORS, 'aktion_fehlgeschlagen');
  return { ok: true, data: result.data, httpStatus: result.httpStatus, versuche: result.versuche };
}

const DISABLE_USER_ERRORS = { 101: 'aktion_fehlgeschlagen' };

// PUT /cloud/users/{userid}/disable
export async function disableUser(client, userid) {
  const result = await client.request({ method: 'PUT', path: `/cloud/users/${encodeURIComponent(userid)}/disable` });
  if (!result.ok) return mapOcsError(result, DISABLE_USER_ERRORS, 'aktion_fehlgeschlagen');
  return { ok: true, data: result.data, httpStatus: result.httpStatus, versuche: result.versuche };
}

const DELETE_USER_ERRORS = { 101: 'aktion_fehlgeschlagen' };

// DELETE /cloud/users/{userid}
export async function deleteUser(client, userid) {
  const result = await client.request({ method: 'DELETE', path: `/cloud/users/${encodeURIComponent(userid)}` });
  if (!result.ok) return mapOcsError(result, DELETE_USER_ERRORS, 'aktion_fehlgeschlagen');
  return { ok: true, data: result.data, httpStatus: result.httpStatus, versuche: result.versuche };
}

// "User bearbeiten" codes (RESEARCH-OCS §5): 101 ungültiges Argument, 107 Passwort-Policy,
// 112 Backend unterstützt Passwortsetzen nicht, 113 Feld nicht editierbar.
const SET_USER_FIELD_ERRORS = {
  101: 'aktion_fehlgeschlagen',
  107: 'passwort_policy',
  112: 'passwort_backend_nicht_unterstuetzt',
  113: 'feld_nicht_editierbar',
};

// PUT /cloud/users/{userid} with one key/value pair - the only way to change a single field.
export async function setUserField(client, userid, key, value) {
  const result = await client.request({
    method: 'PUT',
    path: `/cloud/users/${encodeURIComponent(userid)}`,
    form: { key, value },
  });
  if (!result.ok) return mapOcsError(result, SET_USER_FIELD_ERRORS, 'aktion_fehlgeschlagen');
  return { ok: true, data: result.data, httpStatus: result.httpStatus, versuche: result.versuche };
}

// Gruppen-Codes für User-zu-Gruppe (S07-batch-kern.md A1): 102 Gruppe existiert nicht, 103 kein Recht.
const ADD_USER_TO_GROUP_ERRORS = { 102: 'gruppe_existiert_nicht', 103: 'kein_recht_fuer_gruppe' };

// POST /cloud/users/{userid}/groups
export async function addUserToGroup(client, userid, groupid) {
  const result = await client.request({
    method: 'POST',
    path: `/cloud/users/${encodeURIComponent(userid)}/groups`,
    form: { groupid },
  });
  if (!result.ok) return mapOcsError(result, ADD_USER_TO_GROUP_ERRORS, 'aktion_fehlgeschlagen');
  return { ok: true, data: result.data, httpStatus: result.httpStatus, versuche: result.versuche };
}

const REMOVE_USER_FROM_GROUP_ERRORS = { 102: 'gruppe_existiert_nicht', 103: 'kein_recht_fuer_gruppe' };

// DELETE /cloud/users/{userid}/groups
export async function removeUserFromGroup(client, userid, groupid) {
  const result = await client.request({
    method: 'DELETE',
    path: `/cloud/users/${encodeURIComponent(userid)}/groups`,
    form: { groupid },
  });
  if (!result.ok) return mapOcsError(result, REMOVE_USER_FROM_GROUP_ERRORS, 'aktion_fehlgeschlagen');
  return { ok: true, data: result.data, httpStatus: result.httpStatus, versuche: result.versuche };
}
