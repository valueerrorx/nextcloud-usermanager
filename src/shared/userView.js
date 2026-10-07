// Normalizes a raw OCS user object (from either the details path or the N+1 fallback, both
// shaped identically per RESEARCH-OCS V2) into the UserView shape (ARCHITECTURE §4). Pure, no I/O.
import { parseQuota } from './quota.js';

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
    istVerbundenerAdmin: userid.toLowerCase() === adminUserId.toLowerCase(),
  };
}
