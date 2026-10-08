<script setup>
// Aktionsauswahl, Dry-Run-Aufruf, Bestätigungen (swal2) - ARCHITECTURE §2/§3.1. Rechnet nicht
// selbst: Dry-Run kommt aus shared/dryRun.js, Begründungstexte aus shared/jobReport.js,
// Gruppenliste aus shared/filters.js (ARCHITECTURE §4.1, REVIEW-NOTES [S06]).
import { computed, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import { planActions, bestaetigungPasst, planToItems } from '../../shared/dryRun.js';
import { gruppenOptionen } from '../../shared/filters.js';
import { QUOTA_PRESETS, formatQuotaForApi, findQuotaPreset } from '../../shared/quota.js';
import { resolveGrund } from '../../shared/jobReport.js';
import { MESSAGES } from '../../shared/messages.js';
import {
  dryRunPlan, jobId, jobLaeuft, jobFortschritt, jobResults, jobSummary,
} from '../state.js';

const props = defineProps({
  users: { type: Array, required: true },
  auswahl: { type: Set, required: true },
  adminUserId: { type: String, default: null },
});
const emit = defineEmits(['finished']);

const ACTIONS = [
  { id: 'user.enable', label: 'Aktivieren' },
  { id: 'user.disable', label: 'Deaktivieren' },
  { id: 'user.delete', label: 'Löschen' },
  { id: 'user.setQuota', label: 'Kontingent setzen' },
  { id: 'user.setPassword', label: 'Passwort setzen' },
  { id: 'user.addToGroup', label: 'Zu Gruppe hinzufügen' },
  { id: 'user.removeFromGroup', label: 'Aus Gruppe entfernen' },
  { id: 'user.update', label: 'Anzeigename/E-Mail ändern' },
];

const selectedAction = ref('user.enable');
const groupId = ref('');
const quotaPresetId = ref(QUOTA_PRESETS[0].id);
const password = ref('');
const displayname = ref('');
const email = ref('');

// Clear on action change so a password never survives into a different action (Review: #6).
watch(selectedAction, () => {
  password.value = '';
});

// Alphabetisch deduplizierte Gruppenliste aus der geladenen Userliste - keine eigene Ableitung
// hier, dieselbe pure Funktion wie in UsersView.vue (ARCHITECTURE §4.1).
const gruppenOptionenListe = computed(() => gruppenOptionen(props.users));

const vorschauDisabled = computed(() => {
  if (props.auswahl.size === 0 || jobLaeuft.value) return true;
  if (selectedAction.value === 'user.addToGroup' || selectedAction.value === 'user.removeFromGroup') {
    return groupId.value === '';
  }
  if (selectedAction.value === 'user.setPassword') {
    return password.value.trim() === '';
  }
  if (selectedAction.value === 'user.update') {
    return displayname.value.trim() === '' && email.value.trim() === '';
  }
  return false;
});

function buildParams() {
  switch (selectedAction.value) {
    case 'user.addToGroup':
    case 'user.removeFromGroup':
      return { groupid: groupId.value };
    case 'user.setQuota': {
      const preset = findQuotaPreset(quotaPresetId.value);
      return { value: formatQuotaForApi(preset) };
    }
    case 'user.setPassword':
      // Trimmed, same value vorschauDisabled already validated against (Review: #9).
      return { value: password.value.trim() };
    case 'user.update': {
      const params = {};
      if (displayname.value.trim() !== '') params.displayname = displayname.value.trim();
      if (email.value.trim() !== '') params.email = email.value.trim();
      return params;
    }
    default:
      return {};
  }
}

// Nur für die swal2-HTML-Ausgabe - dasselbe Muster wie App.vue's Zertifikatsdialog, keine
// Vue-Komponente innerhalb von swal2 möglich.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
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
    } else {
      await Swal.fire({ title: 'Fehler', text: result.message ?? MESSAGES.aktion_fehlgeschlagen, icon: 'error' });
    }
  } catch (error) {
    console.error('Action job failed:', error);
    await Swal.fire({ title: 'Fehler', text: MESSAGES.unerwarteter_serverfehler, icon: 'error' });
  } finally {
    jobLaeuft.value = false;
    // Never survives into the next selection (Review: #6).
    password.value = '';
    // Die Daten sind jetzt veraltet (B4) - der Elternteil lädt die Userliste neu.
    emit('finished');
  }
}

async function onVorschau() {
  const paramsObj = buildParams();
  const plan = planActions({
    users: props.users,
    auswahl: [...props.auswahl],
    action: selectedAction.value,
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

  const bestaetigt = selectedAction.value === 'user.delete' ? await confirmDelete(plan) : await confirmNormal(plan);
  if (!bestaetigt) return;

  dryRunPlan.value = plan;
  await startJob(plan, selectedAction.value, paramsObj);
}
</script>

<template>
  <div
    v-if="auswahl.size > 0"
    class="action-bar"
  >
    <select v-model="selectedAction">
      <option
        v-for="action in ACTIONS"
        :key="action.id"
        :value="action.id"
      >
        {{ action.label }}
      </option>
    </select>

    <select
      v-if="selectedAction === 'user.addToGroup' || selectedAction === 'user.removeFromGroup'"
      v-model="groupId"
    >
      <option value="">
        Gruppe wählen
      </option>
      <option
        v-for="gruppe in gruppenOptionenListe"
        :key="gruppe"
        :value="gruppe"
      >
        {{ gruppe }}
      </option>
    </select>

    <select
      v-if="selectedAction === 'user.setQuota'"
      v-model="quotaPresetId"
    >
      <option
        v-for="preset in QUOTA_PRESETS"
        :key="preset.id"
        :value="preset.id"
      >
        {{ preset.label }}
      </option>
    </select>

    <input
      v-if="selectedAction === 'user.setPassword'"
      v-model="password"
      type="password"
      placeholder="Neues Passwort"
    >

    <template v-if="selectedAction === 'user.update'">
      <input
        v-model="displayname"
        type="text"
        placeholder="Neuer Anzeigename (leer = unverändert)"
      >
      <input
        v-model="email"
        type="text"
        placeholder="Neue E-Mail (leer = unverändert)"
      >
    </template>

    <span class="auswahl-anzahl">{{ auswahl.size }} ausgewählt</span>

    <button
      type="button"
      :disabled="vorschauDisabled"
      @click="onVorschau"
    >
      Vorschau
    </button>
  </div>
</template>

<style scoped>
.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.action-bar select,
.action-bar input {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
}

.action-bar button {
  background: var(--accent);
  border: none;
  color: var(--fg);
  padding: 8px 14px;
  border-radius: 4px;
  cursor: pointer;
}

.action-bar button:disabled {
  opacity: 0.6;
  cursor: default;
}

.auswahl-anzahl {
  color: var(--fg-muted);
  margin-left: auto;
}
</style>
