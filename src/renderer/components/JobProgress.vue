<script setup>
// Fortschritt, Abbrechen, Ergebnisbericht, CSV-Export (ARCHITECTURE §2/§3.1). Rechnet nichts
// selbst: resolveGrund/summaryAnzeige aus shared/jobReport.js, CSV aus shared/resultCsv.js
// (ARCHITECTURE §4.1).
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Swal from 'sweetalert2';
import { buildResultCsvReport } from '../../shared/resultCsv.js';
import { resolveGrund, summaryAnzeige } from '../../shared/jobReport.js';
import { MESSAGES } from '../../shared/messages.js';
import {
  jobFortschritt, jobId, jobLaeuft, jobResults, jobSummary, dryRunPlan,
} from '../state.js';

const anzeige = computed(() => (jobSummary.value ? summaryAnzeige(jobSummary.value) : null));

// Dry-Run-Zahlen zusätzlich zum Pipeline-Bericht (Review: #8 - sonst wird dryRunPlan nie gelesen).
const dryRunHinweis = computed(() => {
  if (!dryRunPlan.value) return null;
  const { keineAenderung, ausgeschlossen } = dryRunPlan.value;
  return `${keineAenderung.length} ohne Änderung, ${ausgeschlossen.length} ausgeschlossen (laut Vorschau)`;
});

// Zustand von actions.stop (ARCHITECTURE §5) - feuert nie einen Fehler, aber darf nicht
// verworfen werden: der Nutzer sieht sonst keine Rückmeldung auf den Klick (Review: #7).
const stopMeldung = ref(null);
const stopDisabled = ref(false);

let disposeProgress = null;

onMounted(() => {
  disposeProgress = window.api.onActionsProgress((payload) => {
    if (payload.jobId !== jobId.value) return; // a stray event from an earlier job
    jobFortschritt.value = { done: payload.done, total: payload.total };
  });
});

onUnmounted(() => {
  disposeProgress?.();
});

const STOP_MELDUNGEN = {
  gestoppt: MESSAGES.job_gestoppt,
  bereits_beendet: MESSAGES.job_bereits_beendet,
  unbekannt: MESSAGES.job_unbekannt,
};

async function onAbbrechen() {
  stopDisabled.value = true;
  try {
    const result = await window.api.actionsStop({ jobId: jobId.value });
    stopMeldung.value = STOP_MELDUNGEN[result.zustand] ?? null;
  } catch (error) {
    console.error('actions.stop failed:', error);
    stopDisabled.value = false;
    await Swal.fire({ title: 'Fehler', text: MESSAGES.unerwarteter_serverfehler, icon: 'error' });
  }
}

// Auch nach einem Abbruch möglich (DECISIONS "Abbruch-Semantik im Batch") - verfügbar, sobald
// der Bericht steht, unabhängig davon, wie der Job endete.
async function onExport() {
  try {
    const csv = buildResultCsvReport(jobResults.value);
    const result = await window.api.filesSaveCsv({ vorschlag: `ergebnis-${jobId.value}.csv`, inhalt: csv });
    if (!result.ok && result.messageId !== 'abgebrochen') {
      await Swal.fire({ title: 'Fehler', text: MESSAGES[result.messageId] ?? MESSAGES.export_fehlgeschlagen, icon: 'error' });
    }
  } catch (error) {
    console.error('files.saveCsv failed:', error);
    await Swal.fire({ title: 'Fehler', text: MESSAGES.export_fehlgeschlagen, icon: 'error' });
  }
}
</script>

<template>
  <div
    v-if="jobLaeuft || jobSummary"
    class="content-card job-progress"
  >
    <div class="content-card-body">
      <template v-if="jobLaeuft">
        <h2 class="page-title">
          <i
            class="bi bi-arrow-clockwise spin"
            aria-hidden="true"
          />
          Aktion läuft
        </h2>
        <p v-if="jobFortschritt">
          {{ jobFortschritt.done }} / {{ jobFortschritt.total }}
        </p>
        <button
          type="button"
          class="btn btn-outline-danger"
          :disabled="stopDisabled"
          @click="onAbbrechen"
        >
          <i
            class="bi bi-x-lg"
            aria-hidden="true"
          />
          Abbrechen
        </button>
        <p v-if="stopMeldung">
          {{ stopMeldung }}
        </p>
      </template>

      <template v-else-if="anzeige">
        <h2 class="page-title">
          <i
            class="bi bi-check-lg"
            aria-hidden="true"
          />
          Ergebnis
        </h2>
        <p class="zusammenfassung">
          {{ anzeige.ok }} erfolgreich, {{ anzeige.fehler }} Fehler
          (davon {{ anzeige.teilweise }} teilweise), {{ anzeige.nichtAusgefuehrt }} nicht ausgeführt
        </p>
        <p
          v-if="dryRunHinweis"
          class="dry-run-hinweis"
        >
          {{ dryRunHinweis }}
        </p>
        <div class="table-usermanager-wrap">
          <table class="table-usermanager">
            <thead>
              <tr>
                <th>Benutzer</th>
                <th>Status</th>
                <th>Begründung</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="result in jobResults"
                :key="result.userid"
              >
                <td>{{ result.userid }}</td>
                <td>{{ result.status }}</td>
                <td>{{ resolveGrund(result.grund) ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button
          type="button"
          class="btn btn-outline-secondary"
          @click="onExport"
        >
          <i
            class="bi bi-download"
            aria-hidden="true"
          />
          Ergebnis als CSV speichern
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.job-progress {
  margin-top: 16px;
}

.zusammenfassung,
.dry-run-hinweis {
  color: var(--text-secondary);
}
</style>
