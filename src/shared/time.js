// formatTimestamp existierte dreimal (DashboardView.vue, UsersView.vue, App.vue) - eine Stelle
// statt drei Kopien (REVIEW-NOTES MINOR, S13-Review). Pure, kein I/O.
// ms: Date.now()-Zeitstempel. null/0/undefined (noch kein Stand) -> '', sonst deutsches Format.
export function formatTimestamp(ms) {
  return ms ? new Date(ms).toLocaleString('de-DE') : '';
}
