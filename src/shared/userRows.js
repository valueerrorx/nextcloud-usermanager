// Pure view helpers for the user list: avatar initials, row action states, batch bar (S17).

export const BATCH_BAR_MIN = 2;

// Batch bar shows from two selected users on; a single user uses the row buttons.
export function batchBarVisible(count) {
  return count >= BATCH_BAR_MIN;
}

// Batch bar buttons: variant is the Bootstrap outline colour, needsParam opens a prompt first.
export const BATCH_ACTIONS = [
  { id: 'user.addToGroup', label: 'Zur Gruppe hinzufügen', icon: 'bi-people', variant: 'secondary' },
  { id: 'user.removeFromGroup', label: 'Aus Gruppe entfernen', icon: 'bi-person-dash', variant: 'secondary' },
  { id: 'user.setQuota', label: 'Kontingent setzen', icon: 'bi-hdd', variant: 'secondary' },
  { id: 'user.enable', label: 'Aktivieren', icon: 'bi-person-check', variant: 'success' },
  { id: 'user.disable', label: 'Deaktivieren', icon: 'bi-person-slash', variant: 'danger' },
  { id: 'user.delete', label: 'Löschen', icon: 'bi-trash', variant: 'danger' },
];

// Label per action id for the job history and toasts.
export const ACTION_LABELS = {
  'user.enable': 'Aktivieren',
  'user.disable': 'Deaktivieren',
  'user.delete': 'Löschen',
  'user.setQuota': 'Kontingent setzen',
  'user.setPassword': 'Passwort setzen',
  'user.addToGroup': 'Zu Gruppe hinzufügen',
  'user.removeFromGroup': 'Aus Gruppe entfernen',
  'user.update': 'Anzeigename/E-Mail ändern',
};

// First letters of the first two words of the display name (userid as fallback), upper case.
export function userInitials(user) {
  const quelle = (user.displayname || '').trim() || (user.userid || '').trim();
  const woerter = quelle.split(/[\s._-]+/).filter(Boolean);
  if (woerter.length === 0) return '?';
  const buchstaben = woerter.length === 1 ? [...woerter[0]].slice(0, 2) : woerter.slice(0, 2).map((w) => [...w][0]);
  return buchstaben.join('').toUpperCase();
}

// Case-insensitive on purpose: the same comparison as the self-protection in dryRun.js.
function istSelbst(user, adminUserId) {
  return Boolean(adminUserId) && user.userid.toLowerCase() === adminUserId.toLowerCase();
}

const SELBST_HINWEIS = 'Das eigene Konto kann nicht deaktiviert oder gelöscht werden';

// Buttons of one table row; every action runs through the dry-run path with this one user.
export function rowActions(user, { adminUserId, gesperrt = false } = {}) {
  const selbst = istSelbst(user, adminUserId);
  const toggleAktion = user.enabled ? 'user.disable' : 'user.enable';
  const toggleLabel = user.enabled ? 'Deaktivieren' : 'Aktivieren';
  return [
    { action: 'user.update', label: 'Bearbeiten', icon: 'bi-pencil', danger: false, disabled: gesperrt, title: 'Bearbeiten' },
    { action: 'user.setPassword', label: 'Passwort setzen', icon: 'bi-key', danger: false, disabled: gesperrt, title: 'Passwort setzen' },
    { action: 'user.setQuota', label: 'Kontingent setzen', icon: 'bi-hdd', danger: false, disabled: gesperrt, title: 'Kontingent setzen' },
    { action: 'user.addToGroup', label: 'Zur Gruppe hinzufügen', icon: 'bi-people', danger: false, disabled: gesperrt, title: 'Zur Gruppe hinzufügen' },
    { action: 'user.removeFromGroup', label: 'Aus Gruppe entfernen', icon: 'bi-person-dash', danger: false, disabled: gesperrt, title: 'Aus Gruppe entfernen' },
    {
      action: toggleAktion,
      label: toggleLabel,
      icon: user.enabled ? 'bi-person-slash' : 'bi-person-check',
      danger: user.enabled,
      disabled: gesperrt || (selbst && user.enabled),
      title: selbst && user.enabled ? SELBST_HINWEIS : toggleLabel,
    },
    {
      action: 'user.delete',
      label: 'Löschen',
      icon: 'bi-trash',
      danger: true,
      disabled: gesperrt || selbst,
      title: selbst ? SELBST_HINWEIS : 'Löschen',
    },
  ];
}

// Logout is blocked while a batch or import job runs.
export function logoutState(jobLaeuft) {
  return {
    disabled: Boolean(jobLaeuft),
    title: jobLaeuft ? 'Abmelden ist während eines laufenden Auftrags nicht möglich' : 'Abmelden',
  };
}

// Toast after a finished job, e.g. "Löschen: 5 OK, 1 fehlgeschlagen"; partial results count as failed.
export function jobToast(label, summary) {
  const fehler = summary.fehler + summary.teilweise;
  const text = fehler > 0 ? `${label}: ${summary.ok} OK, ${fehler} fehlgeschlagen` : `${label}: ${summary.ok} OK`;
  return { kind: fehler > 0 ? 'error' : 'success', text };
}

// Object form of a select list for swal2 inputOptions.
export function optionenObjekt(eintraege) {
  return Object.fromEntries(eintraege.map((e) => [e.value, e.label]));
}

// Params of a user.update from the edit dialog; empty fields stay untouched.
export function buildUpdateParams({ displayname, email }) {
  const params = {};
  if ((displayname ?? '').trim() !== '') params.displayname = displayname.trim();
  if ((email ?? '').trim() !== '') params.email = email.trim();
  return params;
}
