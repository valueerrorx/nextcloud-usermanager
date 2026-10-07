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
