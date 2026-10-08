// Pure display helpers for the action job report (S08 B3). No I/O. Named functions instead of
// counting/resolving inline in ActionBar.vue/JobProgress.vue (ARCHITECTURE §4.1, REVIEW-NOTES
// [S06] "jede abgeleitete Liste gehört in ein pures Modul").
import { MESSAGES } from './messages.js';

// ItemResult.grund (ARCHITECTURE §5) is a messageId for 'fehler' (set from ocs/client.js),
// an already-German sentence for 'teilweise' (pipeline.js names the failed sub-step itself),
// or null for 'ok'/'nicht ausgeführt'. MESSAGES[grund] ?? grund resolves the first case and
// passes the second through unchanged, because it simply matches no key.
export function resolveGrund(grund) {
  if (grund === null || grund === undefined) return null;
  return MESSAGES[grund] ?? grund;
}

// summary carries the four raw counts (ARCHITECTURE §5 "summary-Form"). The report additionally
// folds 'teilweise' into the error column while keeping it visible on its own
// (DECISIONS "summary-Form des Action-Ergebnisses").
export function summaryAnzeige(summary) {
  return {
    ok: summary.ok,
    fehler: summary.fehler + summary.teilweise,
    teilweise: summary.teilweise,
    nichtAusgefuehrt: summary.nichtAusgefuehrt,
  };
}
