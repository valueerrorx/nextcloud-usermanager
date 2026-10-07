// users/details probe with N+1 fallback and session-memoized mode (ARCHITECTURE §7).
import { listUserDetails, listUserIds, getUser } from './users.js';
import { runPool } from '../../shared/pool.js';
import { toUserView } from '../../shared/userView.js';
import { session } from '../session.js';
import { MESSAGES } from '../../shared/messages.js';

// An array is also an object in JS, so Array.isArray must be checked explicitly - otherwise the
// id-list response from /cloud/users would be mistaken for the keyed details object.
function hasValidDetailsShape(usersRaw) {
  if (usersRaw === null || typeof usersRaw !== 'object' || Array.isArray(usersRaw)) return false;
  const firstKey = Object.keys(usersRaw)[0];
  if (firstKey === undefined) return true; // empty list: nothing to inspect, shape is fine
  const first = usersRaw[firstKey];
  return Boolean(first && typeof first === 'object' && ('enabled' in first || 'quota' in first));
}

// The five triggers of A6.2, narrowed on purpose: on a FAILED probe only HTTP 404, kind 'notOcs'
// and kind 'ocs' (statuscode != 100) count. Every other failure kind - timeout, network, cert,
// auth, forbidden, ratelimit, http - is not a trigger and must be surfaced unchanged, never
// treated as a reason to switch to N+1 (a 429 must not lock the session into single-user requests
// against the server that just rate-limited it). On a successful probe, the two shape-based
// triggers are both covered by hasValidDetailsShape.
function isFallbackTrigger(probe) {
  if (probe.ok) return !hasValidDetailsShape(probe.data);
  return probe.httpStatus === 404 || probe.kind === 'notOcs' || probe.kind === 'ocs';
}

// A raw user that is not an object or has no id is skipped and counted, never handed to
// toUserView - a single malformed item must not abort the whole list load (A6.6 tolerance
// guarantee extends to malformed data, not only to failed getUser requests).
function toUserViewSafe(rawUser, adminUserId) {
  if (!rawUser || typeof rawUser !== 'object' || Array.isArray(rawUser) || rawUser.id === undefined) {
    return null;
  }
  return toUserView(rawUser, { adminUserId });
}

function detailsToResult(usersRaw, adminUserId) {
  const users = [];
  let uebersprungen = 0;
  for (const raw of Object.values(usersRaw ?? {})) {
    const view = toUserViewSafe(raw, adminUserId);
    if (view) users.push(view);
    else uebersprungen += 1;
  }
  return { ok: true, users, mode: 'details', uebersprungen };
}

// Memoized details mode got a shape that no longer fits (e.g. the instance switched API
// versions mid-session): surfaced as an error, never re-probed and never routed into the
// fallback (MINOR 7) - re-probing would silently abandon the memoized decision from A6.5.
function detailsShapeError(result) {
  return {
    ok: false,
    kind: 'ocs',
    httpStatus: result.httpStatus,
    ocsCode: null,
    messageId: 'userliste_fehlgeschlagen',
    message: MESSAGES.userliste_fehlgeschlagen,
    versuche: result.versuche,
  };
}

async function runFallback({ client, adminUserId, onProgress, shouldStop }) {
  const idsResult = await listUserIds(client);
  if (!idsResult.ok) return idsResult;
  const ids = Array.isArray(idsResult.data) ? idsResult.data : [];
  const gesamt = ids.length;
  let geladen = 0;

  const results = await runPool(
    ids,
    async (id) => {
      const result = await getUser(client, id);
      geladen += 1;
      onProgress?.({ geladen, gesamt });
      return result;
    },
    { concurrency: 4, shouldStop },
  );

  const users = [];
  let uebersprungen = 0;
  for (const result of results) {
    // A single failed getUser (error result, thrown error, malformed data, or shouldStop skip)
    // never aborts the fallback - the affected id is just missing from the list and counted.
    const view = result && result.ok ? toUserViewSafe(result.data, adminUserId) : null;
    if (view) users.push(view);
    else uebersprungen += 1;
  }
  return { ok: true, users, mode: 'fallback', uebersprungen };
}

export async function fetchAllUsers({ client, adminUserId, onProgress, shouldStop }) {
  const mode = session.userListMode;

  if (mode === null) {
    // First call this session (or after a reconnect): probe once and decide.
    const probe = await listUserDetails(client);
    if (!isFallbackTrigger(probe)) {
      if (!probe.ok) return probe; // non-trigger failure: surfaced unchanged, mode stays unset
      session.setUserListMode('details');
      return detailsToResult(probe.data, adminUserId);
    }
    session.setUserListMode('fallback');
    return runFallback({ client, adminUserId, onProgress, shouldStop });
  }

  if (mode === 'details') {
    // Mode is memoized: no re-probing, but data is still fetched fresh on every call.
    const result = await listUserDetails(client);
    if (!result.ok) return result;
    if (!hasValidDetailsShape(result.data)) return detailsShapeError(result);
    return detailsToResult(result.data, adminUserId);
  }

  // mode === 'fallback' (freshly decided above, or memoized from a previous call): the probe
  // itself (the listUserDetails call) is skipped entirely once this is known.
  return runFallback({ client, adminUserId, onProgress, shouldStop });
}
