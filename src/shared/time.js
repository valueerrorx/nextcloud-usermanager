// formatTimestamp existierte dreimal (DashboardView.vue, UsersView.vue, App.vue) - eine Stelle
// statt drei Kopien (REVIEW-NOTES MINOR, S13-Review). Pure, kein I/O.
// ms: Date.now()-Zeitstempel. null/0/undefined (noch kein Stand) -> '', sonst deutsches Format.
export function formatTimestamp(ms, { sekunden = true } = {}) {
  if (!ms) return '';
  if (sekunden) return new Date(ms).toLocaleString('de-DE');
  return new Date(ms).toLocaleString('de-DE', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
