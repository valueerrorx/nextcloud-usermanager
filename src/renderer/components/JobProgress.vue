<script setup>
// Fortschritt, Abbrechen, Ergebnisbericht, CSV-Export (ARCHITECTURE §2/§3.1). Rechnet nichts
// selbst: resolveGrund/summaryAnzeige aus shared/jobReport.js, CSV aus shared/resultCsv.js
// (ARCHITECTURE §4.1).
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import { buildResultCsvReport, buildImportResultCsvReport } from '../../shared/resultCsv.js';
import { resolveGrund, summaryAnzeige, zeigtJobBericht } from '../../shared/jobReport.js';
import { buildImportExportRows } from '../../shared/importView.js';
import { MESSAGES } from '../../shared/messages.js';
import { unerwartetFooter } from '../jobRunner.js';
import {
  jobFortschritt, jobId, jobLaeuft, jobQuelle, jobResults, jobSummary, dryRunPlan,
} from '../state.js';

// S11 B2: ImportView.vue reicht ihre Vorschauzeilen durch, statt JobProgress nachzubauen
// (S11 spec "Ausdrücklich NICHT" - kein zweiter Ausführungspfad). null (Default) heißt: normaler
// Batch-Bericht ohne Passwortspalte, wie bisher.
const props = defineProps({
  importPlanRows: { type: Array, default: null },
  quelle: { type: String, required: true },
});

const sichtbar = computed(() => zeigtJobBericht(props.quelle, jobQuelle.value, jobLaeuft.value, jobSummary.value));

const anzeige = computed(() => (jobSummary.value ? summaryAnzeige(jobSummary.value) : null));

const fortschrittProzent = computed(() => {
  const stand = jobFortschritt.value;
  if (!stand || stand.total <= 0) return 0;
  return Math.min(100, Math.round((stand.done / stand.total) * 100));
});

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

function onKeydown(event) {
  if (event.key === 'Escape' && sichtbar.value && !jobLaeuft.value) schliessen();
}

onMounted(() => {
  disposeProgress = window.api.onActionsProgress((payload) => {
    if (payload.jobId !== jobId.value) return; // a stray event from an earlier job
    jobFortschritt.value = { done: payload.done, total: payload.total };
  });
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  disposeProgress?.();
  window.removeEventListener('keydown', onKeydown);
});

watch(jobId, () => {
  stopMeldung.value = null;
  stopDisabled.value = false;
});

function schliessen() {
  if (jobLaeuft.value) return;
  jobSummary.value = null;
  jobResults.value = [];
  jobFortschritt.value = null;
  jobQuelle.value = null;
  dryRunPlan.value = null;
}

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
    await Swal.fire({
      title: 'Fehler', text: MESSAGES.unerwarteter_serverfehler, icon: 'error', footer: unerwartetFooter(error),
    });
  }
}

// Auch nach einem Abbruch möglich (DECISIONS "Abbruch-Semantik im Batch") - verfügbar, sobald
// der Bericht steht, unabhängig davon, wie der Job endete.
// S11 B2: importPlanRows gesetzt -> 7-spaltiger Import-Export mit Klartext-Passwörtern
// (buildImportExportRows deckt Pipeline-Ergebnisse PLUS Vorschaufehler ab, ARCHITECTURE §5),
// sonst der bisherige 6-spaltige Batch-Bericht ohne Passwortspalte.
async function onExport() {
  const istImportExport = Boolean(props.importPlanRows && props.importPlanRows.length > 0);
  if (istImportExport) {
    const warnung = await Swal.fire({
      title: 'Passwort-Export',
      text: MESSAGES.passwort_export_warnung,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Exportieren',
      cancelButtonText: 'Abbrechen',
    });
    if (!warnung.isConfirmed) return;
  }
  try {
    const csv = istImportExport
      ? buildImportResultCsvReport(buildImportExportRows(props.importPlanRows, jobResults.value))
      : buildResultCsvReport(jobResults.value);
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
  <Teleport to="body">
    <div
      v-if="sichtbar"
      class="job-overlay"
      @click.self="schliessen"
    >
      <div
        class="job-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-dialog-titel"
      >
        <template v-if="jobLaeuft">
          <h2
            id="job-dialog-titel"
            class="job-titel"
          >
            <i
              class="bi bi-arrow-clockwise spin"
              aria-hidden="true"
            />
            Aktion läuft
          </h2>
          <p
            v-if="jobFortschritt"
            class="job-zaehler"
          >
            <span class="job-zaehler-stand">{{ jobFortschritt.done }}</span>
            <span class="job-zaehler-gesamt">/ {{ jobFortschritt.total }}</span>
          </p>
          <div
            class="job-balken"
            role="progressbar"
            :aria-valuenow="jobFortschritt?.done ?? 0"
            :aria-valuemin="0"
            :aria-valuemax="jobFortschritt?.total ?? 0"
          >
            <div
              class="job-balken-fill"
              :style="{ width: `${fortschrittProzent}%` }"
            />
          </div>
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
          <p
            v-if="stopMeldung"
            class="job-hinweis"
          >
            {{ stopMeldung }}
          </p>
        </template>

        <template v-else-if="anzeige">
          <h2
            id="job-dialog-titel"
            class="job-titel"
          >
            <i
              class="bi bi-check-lg"
              aria-hidden="true"
            />
            Ergebnis
          </h2>
          <p class="job-hinweis">
            {{ anzeige.ok }} erfolgreich, {{ anzeige.fehler }} Fehler
            (davon {{ anzeige.teilweise }} teilweise), {{ anzeige.nichtAusgefuehrt }} nicht ausgeführt
          </p>
          <p
            v-if="dryRunHinweis"
            class="job-hinweis"
          >
            {{ dryRunHinweis }}
          </p>
          <div class="job-tabelle">
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
          <div class="job-aktionen">
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
            <button
              type="button"
              class="btn btn-primary"
              @click="schliessen"
            >
              Schließen
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.job-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(1, 4, 9, 0.72);
}

.job-dialog {
  width: min(720px, 100%);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.5rem 1.5rem 1.25rem;
  border-radius: 12px;
  border: 1px solid var(--sidebar-border);
  background: var(--card-bg);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}

.job-titel {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.job-zaehler {
  margin: 0;
  line-height: 1;
}

.job-zaehler-stand {
  font-size: 2.4rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}

.job-zaehler-gesamt {
  margin-left: 0.35rem;
  font-size: 1.15rem;
  color: var(--text-secondary);
}

.job-balken {
  height: 6px;
  border-radius: 999px;
  background: rgba(88, 166, 255, 0.15);
  overflow: hidden;
}

.job-balken-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 0.2s ease;
}

.job-hinweis {
  margin: 0;
  color: var(--text-secondary);
}

.job-tabelle {
  overflow: auto;
  min-height: 0;
  border: 1px solid var(--sidebar-border);
  border-radius: 8px;
}

.job-aktionen {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
