// Pure dry-run planner (ARCHITECTURE §5, S08 A1). Computes on the already-loaded `users` list,
// issues no request at all. Self-protection and no-op detection live here so batch and single-user
// actions inherit the same rules.
import { formatBytes } from './quota.js';

// Self-protection applies only to delete and disable (DECISIONS "Selbstschutz") - user.enable
// may still target the connected admin.
const SELF_PROTECTED_ACTIONS = new Set(['user.delete', 'user.disable']);

// user.setPassword and user.delete have no entry here: a password is not readable, a delete is
// never a no-op (A1).
const NO_OP_REASONS = {
  'user.enable': 'bereits_aktiv',
  'user.disable': 'bereits_deaktiviert',
  'user.addToGroup': 'bereits_in_gruppe',
  'user.removeFromGroup': 'nicht_in_gruppe',
  'user.setQuota': 'kontingent_unveraendert',
  'user.update': 'keine_felder_geaendert',
};

function enabledLabel(enabled) {
  return enabled ? 'aktiv' : 'deaktiviert';
}

function groupsLabel(groups) {
  return groups.length > 0 ? groups.join(', ') : 'keine Gruppen';
}

function quotaLabel(quota) {
  return quota.kind === 'unlimited' ? 'unbegrenzt' : formatBytes(quota.limitBytes);
}

// value is the API-ready string from formatQuotaForApi() (A2): 'none' or bytes as a string.
function quotaLabelFromValue(value) {
  return value === 'none' ? 'unbegrenzt' : formatBytes(Number(value));
}

function isQuotaNoOp(user, value) {
  if (value === 'none') return user.quota.kind === 'unlimited';
  return user.quota.kind === 'limited' && String(user.quota.limitBytes) === value;
}

function isUpdateNoOp(user, params) {
  const displaynameChanged = params.displayname !== undefined && params.displayname !== user.displayname;
  const emailChanged = params.email !== undefined && params.email !== (user.email ?? '');
  return !displaynameChanged && !emailChanged;
}

function isNoOp(action, user, params) {
  switch (action) {
    case 'user.enable':
      return user.enabled === true;
    case 'user.disable':
      return user.enabled === false;
    case 'user.addToGroup':
      return user.groups.includes(params.groupid);
    case 'user.removeFromGroup':
      return !user.groups.includes(params.groupid);
    case 'user.setQuota':
      return isQuotaNoOp(user, params.value);
    case 'user.update':
      return isUpdateNoOp(user, params);
    default:
      return false; // user.setPassword, user.delete
  }
}

function buildDisplay(action, user, params) {
  switch (action) {
    case 'user.enable':
      return { vorher: enabledLabel(user.enabled), nachher: enabledLabel(true) };
    case 'user.disable':
      return { vorher: enabledLabel(user.enabled), nachher: enabledLabel(false) };
    case 'user.addToGroup':
      return { vorher: groupsLabel(user.groups), nachher: groupsLabel([...user.groups, params.groupid]) };
    case 'user.removeFromGroup':
      return { vorher: groupsLabel(user.groups), nachher: groupsLabel(user.groups.filter((g) => g !== params.groupid)) };
    case 'user.setQuota':
      return { vorher: quotaLabel(user.quota), nachher: quotaLabelFromValue(params.value) };
    case 'user.update': {
      const vorher = [];
      const nachher = [];
      if (params.displayname !== undefined) {
        vorher.push(user.displayname);
        nachher.push(params.displayname);
      }
      if (params.email !== undefined) {
        vorher.push(user.email ?? '');
        nachher.push(params.email ?? '');
      }
      return { vorher: vorher.join(' / '), nachher: nachher.join(' / ') };
    }
    case 'user.setPassword':
      return { vorher: null, nachher: null }; // a password is not readable (A1)
    case 'user.delete':
      return { vorher: user.displayname, nachher: null };
    default:
      return { vorher: null, nachher: null };
  }
}

export function planActions({ users, auswahl, action, params, adminUserId }) {
  const auszufuehren = [];
  const keineAenderung = [];
  const ausgeschlossen = [];
  // adminUserId defaults to null (ActionBar.vue prop default) before a connection is known -
  // guarded here so the self-protection check below never calls toLowerCase() on null.
  const adminUserIdLower = adminUserId ? adminUserId.toLowerCase() : null;

  for (const userid of auswahl) {
    // Exact match: the selection holds userids straight from the loaded list (ARCHITECTURE §5),
    // and a case-insensitive lookup could silently plan a different, mixed-case account's row.
    const user = users.find((u) => u.userid === userid);
    if (!user) {
      // Selection references a userid outside the loaded list, e.g. after a partial reload
      // (ARCHITECTURE §5 "ausgeschlossen: nicht gefunden") - never silently dropped.
      ausgeschlossen.push({ userid, vorher: null, nachher: null, grund: 'nicht_gefunden' });
      continue;
    }

    if (
      SELF_PROTECTED_ACTIONS.has(action)
      && adminUserIdLower !== null
      && user.userid.toLowerCase() === adminUserIdLower
    ) {
      ausgeschlossen.push({ userid: user.userid, vorher: null, nachher: null, grund: 'selbstschutz_admin' });
      continue;
    }

    const { vorher, nachher } = buildDisplay(action, user, params);

    if (isNoOp(action, user, params)) {
      keineAenderung.push({ userid: user.userid, vorher, nachher, grund: NO_OP_REASONS[action] });
      continue;
    }

    auszufuehren.push({ userid: user.userid, vorher, nachher });
  }

  return { auszufuehren, keineAenderung, ausgeschlossen, anzahl: auszufuehren.length };
}

// Delete-confirmation predicate (S08 B2): trimmed, exact string match against the Dry-Run count,
// never the raw selection size - the two renderer call sites share this one invariant.
export function bestaetigungPasst(eingabe, anzahl) {
  return eingabe.trim() === String(anzahl);
}

// userids to execute (S08 B4): actions.run must see exactly plan.auszufuehren, never the raw
// selection - No-Ops and Ausgeschlossene are excluded by construction.
export function planToItems(plan) {
  return plan.auszufuehren.map((eintrag) => eintrag.userid);
}
