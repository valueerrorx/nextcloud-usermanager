// Normalizes a raw OCS user object (from either the details path or the N+1 fallback, both
// shaped identically per RESEARCH-OCS V2) into the UserView shape (ARCHITECTURE §4). Pure, no I/O.
import { parseQuota } from './quota.js';

// lastLogin is ms (NC 33: seconds * 1000). Older payloads and lastLoginTimestamp are seconds. 0 = never.
function lastSeenMs(rawUser) {
  const roh = rawUser.lastLogin ?? rawUser.lastLoginTimestamp;
  const wert = typeof roh === 'string' && roh.trim() !== '' ? Number(roh) : roh;
  if (typeof wert !== 'number' || !Number.isFinite(wert) || wert <= 0) return null;
  return wert < 1e12 ? Math.round(wert * 1000) : Math.round(wert);
}

export function toUserView(rawUser, { adminUserId }) {
  const userid = rawUser.id;
  // email can be null (RESEARCH-OCS V7); ?? only replaces null/undefined, never turns it into "".
  const email = rawUser.email ?? null;
  return {
    userid,
    displayname: rawUser.displayname || userid,
    email,
    enabled: Boolean(rawUser.enabled),
    groups: Array.isArray(rawUser.groups) ? rawUser.groups : [],
    quota: parseQuota(rawUser.quota),
    lastSeenMs: lastSeenMs(rawUser),
    istVerbundenerAdmin: userid.toLowerCase() === adminUserId.toLowerCase(),
  };
}
