<script setup>
// Batch bar (S17) and the one execution path for row actions: parameter prompt, Dry-Run, confirmation
// (swal2), actions.run. Rechnet nicht selbst: Dry-Run aus shared/dryRun.js, Begründungstexte aus
// shared/jobReport.js, Helfer aus shared/userRows.js (ARCHITECTURE §4.1, REVIEW-NOTES [S06]).
import Swal from 'sweetalert2';
import { planActions, bestaetigungPasst, planToItems } from '../../shared/dryRun.js';
import { gruppenOptionen } from '../../shared/filters.js';
import { QUOTA_PRESETS, formatQuotaForApi, findQuotaPreset } from '../../shared/quota.js';
import { resolveGrund } from '../../shared/jobReport.js';
import { pushJobHistorie } from '../../shared/dashboard.js';
import {
  ACTION_LABELS, BATCH_ACTIONS, batchBarVisible, buildUpdateParams, jobToast, optionenObjekt,
} from '../../shared/userRows.js';
import { MESSAGES } from '../../shared/messages.js';
import { toastError, toastSuccess } from '../toast.js';
import {
  dryRunPlan, jobId, jobLaeuft, jobFortschritt, jobResults, jobSummary, jobHistorie,
} from '../state.js';

const props = defineProps({
  users: { type: Array, required: true },
  auswahl: { type: Set, required: true },
  adminUserId: { type: String, default: null },
  gesperrt: { type: Boolean, default: false },
});
const emit = defineEmits(['finished', 'clear']);

// Nur für die swal2-HTML-Ausgabe - dasselbe Muster wie App.vue's Zertifikatsdialog, keine
// Vue-Komponente innerhalb von swal2 möglich.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// Asks for the action's parameters; resolves null when the dialog is cancelled.
async function frageParams(action, user) {
  switch (action) {
    case 'user.addToGroup':
    case 'user.removeFromGroup': {
      const result = await Swal.fire({
        title: ACTION_LABELS[action],
        input: 'select',
        inputOptions: optionenObjekt(gruppenOptionen(props.users).map((g) => ({ value: g, label: g }))),
        inputPlaceholder: 'Gruppe wählen',
        inputValidator: (wert) => (wert ? undefined : 'Bitte eine Gruppe wählen'),
        showCancelButton: true,
        confirmButtonText: 'Vorschau',
        cancelButtonText: 'Abbrechen',
      });
      return result.isConfirmed ? { groupid: result.value } : null;
    }
    case 'user.setQuota': {
      const result = await Swal.fire({
        title: ACTION_LABELS[action],
        input: 'select',
        inputOptions: optionenObjekt(QUOTA_PRESETS.map((p) => ({ value: p.id, label: p.label }))),
        inputValue: QUOTA_PRESETS[0].id,
        showCancelButton: true,
        confirmButtonText: 'Vorschau',
        cancelButtonText: 'Abbrechen',
      });
      return result.isConfirmed ? { value: formatQuotaForApi(findQuotaPreset(result.value)) } : null;
    }
    case 'user.setPassword': {
      const result = await Swal.fire({
        title: ACTION_LABELS[action],
        input: 'password',
        inputPlaceholder: 'Neues Passwort',
        inputAttributes: { autocomplete: 'new-password' },
        inputValidator: (wert) => (wert.trim() ? undefined : 'Bitte ein Passwort eingeben'),
        showCancelButton: true,
        confirmButtonText: 'Vorschau',
        cancelButtonText: 'Abbrechen',
      });
      return result.isConfirmed ? { value: result.value.trim() } : null;
    }
    case 'user.update': {
      const result = await Swal.fire({
        title: ACTION_LABELS[action],
        html: `<p>Leere Felder bleiben unverändert.</p>
          <input id="edit-displayname" class="swal2-input" placeholder="Anzeigename" value="${escapeHtml(user?.displayname)}">
          <input id="edit-email" class="swal2-input" placeholder="E-Mail" value="${escapeHtml(user?.email)}">`,
        focusConfirm: false,
        preConfirm: () => {
          const felder = buildUpdateParams({
            displayname: document.getElementById('edit-displayname').value,
            email: document.getElementById('edit-email').value,
          });
          if (Object.keys(felder).length === 0) {
            Swal.showValidationMessage('Bitte Anzeigename oder E-Mail angeben');
            return false;
          }
          return felder;
        },
        showCancelButton: true,
        confirmButtonText: 'Vorschau',
        cancelButtonText: 'Abbrechen',
      });
      return result.isConfirmed ? result.value : null;
    }
    default:
      return {};
  }
}

function planZeile(plan) {
  if (plan.vorher === null && plan.nachher === null) return escapeHtml(plan.userid);
  const pfeil = plan.nachher === null ? '' : ` → ${escapeHtml(plan.nachher)}`;
  return `${escapeHtml(plan.userid)}: ${escapeHtml(plan.vorher)}${pfeil}`;
}

function grundZeile(eintrag) {
  return `${escapeHtml(eintrag.userid)}: ${escapeHtml(resolveGrund(eintrag.grund))}`;
}

function listeHtml(eintraege, zeile) {
  if (eintraege.length === 0) return '<p class="vorschau-leer">— keine —</p>';
  return `<ul>${eintraege.map((e) => `<li>${zeile(e)}</li>`).join('')}</ul>`;
}

// Drei Blöcke wie in S08 B2 verlangt: auszuführen (vorher -> nachher), keine Änderung,
// ausgeschlossen - je mit Begründung aus resolveGrund.
function vorschauHtml(plan) {
  return `
    <div class="vorschau">
      <h4>Wird ausgeführt (${plan.anzahl})</h4>
      ${listeHtml(plan.auszufuehren, planZeile)}
      <h4>Keine Änderung (${plan.keineAenderung.length})</h4>
      ${listeHtml(plan.keineAenderung, grundZeile)}
      <h4>Ausgeschlossen (${plan.ausgeschlossen.length})</h4>
      ${listeHtml(plan.ausgeschlossen, grundZeile)}
    </div>
  `;
}

async function confirmNormal(plan) {
  const result = await Swal.fire({
    title: 'Vorschau',
    html: `${vorschauHtml(plan)}<p>${plan.anzahl} Benutzer werden geändert. Fortfahren?</p>`,
    showCancelButton: true,
    confirmButtonText: 'Ja',
    cancelButtonText: 'Nein',
  });
  return result.isConfirmed;
}

// Löschbestätigung: getippte Dry-Run-Zahl (plan.anzahl, NIE die Rohauswahl), getrimmt, exakter
// Stringvergleich, Button bis zur Übereinstimmung deaktiviert, kein Versuchslimit, auch bei
// n = 1 (DECISIONS "Löschbestätigung"). Ausdrücklicher Hinweis auf das Mitlöschen der Dateien
// (DECISIONS "Batch-Löschen: Hinweis auf Dateien").
async function confirmDelete(plan) {
  const result = await Swal.fire({
    title: 'Löschen bestätigen',
    html: `${vorschauHtml(plan)}
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

async function startJob(plan, action, params) {
  const neueJobId = `job-${Date.now()}`;
  jobId.value = neueJobId;
  jobLaeuft.value = true;
  jobFortschritt.value = { done: 0, total: plan.anzahl };
  jobResults.value = [];
  jobSummary.value = null;

  const items = planToItems(plan);
  try {
    const result = await window.api.actionsRun({ jobId: neueJobId, action, items, params });
    if (result.ok) {
      jobResults.value = result.results;
      jobSummary.value = result.summary;
      // Nur tatsächlich ausgeführte Jobs landen in der Historie, nie die Vorschau (DECISIONS
      // "Dry-Runs in der Job-Historie") - dieser Pfad läuft erst nach der Bestätigung.
      jobHistorie.value = pushJobHistorie(jobHistorie.value, {
        zeitpunkt: Date.now(), aktion: ACTION_LABELS[action], summary: result.summary,
      });
      const feedback = jobToast(ACTION_LABELS[action], result.summary);
      (feedback.kind === 'error' ? toastError : toastSuccess)(feedback.text);
    } else {
      await Swal.fire({ title: 'Fehler', text: result.message ?? MESSAGES.aktion_fehlgeschlagen, icon: 'error' });
    }
  } catch (error) {
    console.error('Action job failed:', error);
    await Swal.fire({ title: 'Fehler', text: MESSAGES.unerwarteter_serverfehler, icon: 'error' });
  } finally {
    jobLaeuft.value = false;
    // Die Daten sind jetzt veraltet (B4) - der Elternteil lädt die Userliste neu.
    emit('finished');
  }
}

// Dry-Run for exactly the given userids, then confirmation and execution (single and batch alike).
async function onVorschau(action, paramsObj, userids) {
  const plan = planActions({
    users: props.users,
    auswahl: userids,
    action,
    params: paramsObj,
    adminUserId: props.adminUserId,
  });

  if (plan.anzahl === 0) {
    await Swal.fire({
      title: 'Vorschau',
      html: `${vorschauHtml(plan)}<p>${MESSAGES.keine_aenderung_noetig}</p>`,
      confirmButtonText: 'OK',
    });
    return;
  }

  const bestaetigt = action === 'user.delete' ? await confirmDelete(plan) : await confirmNormal(plan);
  if (!bestaetigt) return;

  dryRunPlan.value = plan;
  await startJob(plan, action, paramsObj);
}

function blockiert() {
  return jobLaeuft.value || props.gesperrt;
}

// Every dialog and the run itself are wrapped so a failure ends in a toast, never a stuck UI.
async function fuehreAus(action, user, userids) {
  if (blockiert()) return;
  try {
    const paramsObj = await frageParams(action, user);
    if (paramsObj === null) return;
    await onVorschau(action, paramsObj, userids);
  } catch (error) {
    console.error('Action failed:', error);
    toastError(MESSAGES.unerwarteter_serverfehler);
  }
}

// Row button: the same path with a selection of exactly this user.
async function runSingle(userid, action) {
  await fuehreAus(action, props.users.find((u) => u.userid === userid), [userid]);
}

function runBatch(action) {
  return fuehreAus(action, null, [...props.auswahl]);
}

defineExpose({ runSingle });
</script>

<template>
  <div
    v-if="batchBarVisible(auswahl.size)"
    class="content-card mb-2"
  >
    <div class="content-card-body py-2 px-3 d-flex flex-wrap align-items-center gap-2">
      <span><strong>{{ auswahl.size }}</strong> ausgewählt</span>
      <button
        v-for="aktion in BATCH_ACTIONS"
        :key="aktion.id"
        type="button"
        class="btn btn-sm"
        :class="`btn-outline-${aktion.variant}`"
        :disabled="jobLaeuft || gesperrt"
        @click="runBatch(aktion.id)"
      >
        <i
          class="bi"
          :class="aktion.icon"
          aria-hidden="true"
        />
        {{ aktion.label }}
      </button>
      <button
        type="button"
        class="btn btn-link btn-sm text-secondary ms-auto"
        @click="emit('clear')"
      >
        Auswahl aufheben
      </button>
    </div>
  </div>
</template>
