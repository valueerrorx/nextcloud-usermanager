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
    class="job-progress"
  >
    <template v-if="jobLaeuft">
      <h2>Aktion läuft</h2>
      <p v-if="jobFortschritt">
        {{ jobFortschritt.done }} / {{ jobFortschritt.total }}
      </p>
      <button
        type="button"
        :disabled="stopDisabled"
        @click="onAbbrechen"
      >
        Abbrechen
      </button>
      <p v-if="stopMeldung">
        {{ stopMeldung }}
      </p>
    </template>

    <template v-else-if="anzeige">
      <h2>Ergebnis</h2>
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
      <table class="result-table">
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
      <button
        type="button"
        @click="onExport"
      >
        Ergebnis als CSV speichern
      </button>
    </template>
  </div>
</template>

<style scoped>
.job-progress {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.job-progress button {
  background: var(--accent);
  border: none;
  color: var(--fg);
  padding: 8px 14px;
  border-radius: 4px;
  cursor: pointer;
}

.zusammenfassung,
.dry-run-hinweis {
  color: var(--fg-muted);
}

.result-table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.result-table th,
.result-table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}

.result-table th {
  color: var(--fg-muted);
  font-weight: normal;
}
</style>
