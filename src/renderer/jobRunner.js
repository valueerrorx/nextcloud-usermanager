// Shared by ActionBar.vue (row/batch actions) and the group delete flow (S18): Dry-Run preview
// HTML, typed delete confirmation and the actions.run call. One execution path, extracted from
// ActionBar.vue unchanged (REVIEW-NOTES [S06]). Renderer I/O module, therefore not in src/shared/.
import Swal from 'sweetalert2';
import { bestaetigungPasst, planToItems } from '../shared/dryRun.js';
import { resolveGrund } from '../shared/jobReport.js';
import { pushJobHistorie } from '../shared/dashboard.js';
import { ACTION_LABELS, jobToast } from '../shared/userRows.js';
import { MESSAGES } from '../shared/messages.js';
import { describeError } from '../shared/logSafe.js';
import { toastError, toastInfo, toastSuccess } from './toast.js';
import {
  jobId, jobLaeuft, jobQuelle, jobFortschritt, jobResults, jobSummary, jobHistorie,
} from './state.js';

// Only for swal2 HTML output - no Vue component possible inside swal2.
export function groupNameHtml(name, id) {
  return `<span class="group-name"><span class="group-name-current">${escapeHtml(name)}</span><span class="group-name-id">${escapeHtml(id)}</span></span>`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function idHtml(userid) {
  return `<code class="vorschau-id">${escapeHtml(userid)}</code>`;
}

function planZeile(plan) {
  if (plan.vorher === null && plan.nachher === null) return idHtml(plan.userid);
  const pfeil = plan.nachher === null ? '' : ` → ${escapeHtml(plan.nachher)}`;
  return `${idHtml(plan.userid)} <span class="vorschau-detail">${escapeHtml(plan.vorher)}${pfeil}</span>`;
}

function grundZeile(eintrag) {
  return `${idHtml(eintrag.userid)} <span class="vorschau-detail">${escapeHtml(resolveGrund(eintrag.grund))}</span>`;
}

// Generic error dialog: German text for the user plus "name: message" of the cause in the footer.
export function unerwartetFooter(error) {
  return `<small>${escapeHtml(describeError(error))}</small>`;
}

// Dialog options for every swal2 that shows a preview (wide, left-aligned via CSS class).
export const VORSCHAU_DIALOG = { width: '42rem', customClass: { popup: 'vorschau-popup' } };

function titelHtml(text, anzahl) {
  return `<div class="vorschau-titel">${text} <span class="vorschau-anzahl">${anzahl}</span></div>`;
}

export function listeHtml(eintraege, zeile) {
  if (eintraege.length === 0) return '<p class="vorschau-leer">— keine —</p>';
  return `<ul>${eintraege.map((e) => `<li>${zeile(e)}</li>`).join('')}</ul>`;
}

// Drei Blöcke wie in S08 B2 verlangt: auszuführen (vorher -> nachher), keine Änderung,
// ausgeschlossen - je mit Begründung aus resolveGrund.
export function vorschauHtml(plan) {
  return `
    <div class="vorschau">
      ${titelHtml('Wird ausgeführt', plan.anzahl)}
      ${listeHtml(plan.auszufuehren, planZeile)}
      ${titelHtml('Keine Änderung', plan.keineAenderung.length)}
      ${listeHtml(plan.keineAenderung, grundZeile)}
      ${titelHtml('Ausgeschlossen', plan.ausgeschlossen.length)}
      ${listeHtml(plan.ausgeschlossen, grundZeile)}
    </div>
  `;
}

// Löschbestätigung: getippte Dry-Run-Zahl (plan.anzahl, NIE die Rohauswahl), getrimmt, exakter
// Stringvergleich, Button bis zur Übereinstimmung deaktiviert, kein Versuchslimit, auch bei
// n = 1 (DECISIONS "Löschbestätigung"). Ausdrücklicher Hinweis auf das Mitlöschen der Dateien
// (DECISIONS "Batch-Löschen: Hinweis auf Dateien"). vorHtml: optionaler Kontext oberhalb (S18).
export async function confirmDelete(plan, vorHtml = '') {
  const result = await Swal.fire({
    ...VORSCHAU_DIALOG,
    title: 'Löschen bestätigen',
    html: `${vorHtml}${vorschauHtml(plan)}
      <p><strong>Achtung:</strong> Nextcloud löscht beim Löschen eines Benutzers auch dessen
      Dateien unwiderruflich mit.</p>
      <p>Zum Bestätigen die Zahl <strong>${plan.anzahl}</strong> eingeben:</p>`,
    input: 'text',
    inputPlaceholder: 'Anzahl',
    showCancelButton: true,
    confirmButtonText: 'Löschen',
    cancelButtonText: 'Abbrechen',
    didOpen: () => {
      const confirmButton = Swal.getConfirmButton();
      confirmButton.disabled = true;
      Swal.getInput().addEventListener('input', (event) => {
        confirmButton.disabled = !bestaetigungPasst(event.target.value, plan.anzahl);
      });
    },
  });
  return result.isConfirmed;
}

// Runs the confirmed plan through actions.run. Resolves with the ItemResult[] (null if the job
// did not run or failed globally); errors end in a dialog, never a rejection.
export async function startJob(plan, action, params, quelle) {
  if (jobLaeuft.value) {
    await Swal.fire({ title: 'Auftrag läuft', text: MESSAGES.job_laeuft_bereits, icon: 'warning' });
    return null;
  }
  const neueJobId = `job-${Date.now()}`;
  jobId.value = neueJobId;
  jobQuelle.value = quelle;
  jobLaeuft.value = true;
  jobFortschritt.value = { done: 0, total: plan.anzahl };
  jobResults.value = [];
  jobSummary.value = null;

  const items = planToItems(plan);
  let ergebnisse = null;
  try {
    const result = await window.api.actionsRun({ jobId: neueJobId, action, items, params });
    if (result.ok) {
      ergebnisse = result.results;
      jobResults.value = result.results;
      jobSummary.value = result.summary;
      // Nur tatsächlich ausgeführte Jobs landen in der Historie, nie die Vorschau (DECISIONS
      // "Dry-Runs in der Job-Historie") - dieser Pfad läuft erst nach der Bestätigung.
      jobHistorie.value = pushJobHistorie(jobHistorie.value, {
        zeitpunkt: Date.now(), aktion: ACTION_LABELS[action], summary: result.summary,
      });
      const feedback = jobToast(ACTION_LABELS[action], result.summary);
      if (feedback.kind === 'info') toastInfo(feedback.text);
      else (feedback.kind === 'error' ? toastError : toastSuccess)(feedback.text);
    } else {
      await Swal.fire({ title: 'Fehler', text: result.message ?? MESSAGES.aktion_fehlgeschlagen, icon: 'error' });
    }
  } catch (error) {
    console.error('Action job failed:', error);
    await Swal.fire({
      title: 'Fehler', text: MESSAGES.unerwarteter_serverfehler, icon: 'error', footer: unerwartetFooter(error),
    });
  } finally {
    jobLaeuft.value = false;
  }
  return ergebnisse;
}
