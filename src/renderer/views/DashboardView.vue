<script setup>
// Startseite (S13, ARCHITECTURE §4.1): rendert NUR die Rückgaben von shared/dashboard.js und
// formatiert mit shared/quota.js#formatBytes/formatPercent. Kein Set/sort/filter/reduce/map/
// localeCompare hier (DECISIONS "Berechnungen gehören nie in Vue-Komponenten").
//
// Dieselbe Falle wie S10/S12 (REVIEW-NOTES [S10]): alle Kacheln rechnen auf state.users/
// state.groups. Ohne geladene Liste zeigt das Dashboard lauter Nullen, die wie eine leere
// Instanz aussehen statt wie fehlende Daten - deshalb lädt diese View beide Listen selbst nach,
// wenn sie noch leer sind, und blockiert bis dahin mit StateBlock statt mit Null-Kacheln.
import { computed, onMounted } from 'vue';
import { MESSAGES } from '../../shared/messages.js';
import { formatTimestamp } from '../../shared/time.js';
import { dashboardCards, historyCounts } from '../../shared/dashboard.js';
import { systemZeilen } from '../../shared/systemInfo.js';
import { nextcloudLink } from '../../shared/externalUrl.js';
import { toastError } from '../toast.js';
import { ladeFreiplatz, ladeGruppen, ladeUserliste } from '../loaders.js';
import {
  activeView, connection, groups, groupsFehler,
  groupsLadezustand, freiplatz, jobHistorie, users, usersFehler, usersFetchedAt, usersLadezustand,
  usersUebersprungen,
} from '../state.js';
import StateBlock from '../components/StateBlock.vue';

async function ladeAlles() {
  await Promise.all([ladeUserliste(), ladeGruppen(), ladeFreiplatz()]);
}

onMounted(() => {
  if (users.value.length === 0) ladeUserliste();
  if (groups.value.length === 0) ladeGruppen();
  ladeFreiplatz();
});

// Blockiert nur, solange eine der beiden Grundlagen lädt oder fehlgeschlagen ist - ein
// tatsächlich leerer Bestand (0 User bzw. 0 Gruppen) ist ein echtes Ergebnis und rendert die
// Kacheln mit echten Nullen, keine Nullen aus fehlenden Daten (REVIEW-NOTES [S10]).
const kombinierterZustand = computed(() => {
  if (usersLadezustand.value === 'fehler' || groupsLadezustand.value === 'fehler') return 'fehler';
  if (usersLadezustand.value === 'laedt' || groupsLadezustand.value === 'laedt') return 'laedt';
  return 'bereit';
});
const kombinierteFehlermeldung = computed(() => usersFehler.value ?? groupsFehler.value ?? '');

const karten = computed(() => dashboardCards({ users: users.value, groupCount: groups.value.length, freiplatz: freiplatz.value }));
const serverLink = computed(() => nextcloudLink(connection.baseUrl));
const system = computed(() => systemZeilen(freiplatz.value?.system));

function zuAnsicht(ansicht) {
  activeView.value = ansicht;
}

async function nextcloudOeffnen() {
  try {
    const result = await window.api.openExternal({ url: serverLink.value });
    if (!result.ok) toastError(result.message ?? MESSAGES.link_nicht_erlaubt);
  } catch (error) {
    console.error('openExternal failed:', error);
    toastError(MESSAGES.unerwarteter_serverfehler);
  }
}

</script>

<template>
  <div class="page-header">
    <h1 class="page-title">
      <i
        class="bi bi-speedometer2"
        aria-hidden="true"
      />
      Dashboard
    </h1>
    <p
      v-if="usersFetchedAt"
      class="page-subtitle"
    >
      Stand: {{ formatTimestamp(usersFetchedAt) }}
    </p>
  </div>

  <p
    v-if="usersUebersprungen > 0"
    class="notice"
  >
    {{ MESSAGES.einige_user_uebersprungen }} ({{ usersUebersprungen }})
  </p>

  <StateBlock
    :zustand="kombinierterZustand"
    :fehlermeldung="kombinierteFehlermeldung"
    @retry="ladeAlles"
  >
    <div class="row row-cols-1 row-cols-md-2 row-cols-xl-4 g-3 mb-4">
      <div
        v-for="karte in karten"
        :key="karte.key"
        class="col"
      >
        <div class="stat-card stat-card-rich">
          <div class="stat-card-head">
            <div
              class="stat-icon"
              :style="karte.iconStyle"
            >
              <i
                class="bi"
                :class="karte.icon"
                aria-hidden="true"
              />
            </div>
            <div class="stat-card-kicker">
              {{ karte.kicker }}
            </div>
          </div>
          <div class="stat-value stat-value-lg">
            {{ karte.wert }}
          </div>
          <div class="stat-label">
            {{ karte.label }}
          </div>
          <div
            v-if="karte.metrics.length > 0"
            class="stat-card-metrics stat-card-metrics--stack"
          >
            <div
              v-for="metrik in karte.metrics"
              :key="metrik.label"
              class="stat-metric stat-metric--row"
            >
              <span class="stat-metric-label">{{ metrik.label }}</span>
              <span
                class="stat-metric-value"
                :class="{ mono: metrik.mono }"
                :title="metrik.hinweis ?? undefined"
              >{{ metrik.wert }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-12 col-xl-4">
        <div class="content-card h-100">
          <div class="content-card-header">
            <span>Schnellzugriff</span>
          </div>
          <div class="content-card-body">
            <button
              type="button"
              class="quick-link"
              :disabled="kombinierterZustand === 'laedt'"
              @click="ladeAlles"
            >
              <span class="quick-link-icon">
                <i
                  class="bi bi-arrow-repeat"
                  :class="{ spin: kombinierterZustand === 'laedt' }"
                  aria-hidden="true"
                />
              </span>
              Daten aktualisieren
            </button>
            <button
              type="button"
              class="quick-link"
              @click="zuAnsicht('users')"
            >
              <span class="quick-link-icon"><i
                class="bi bi-people-fill"
                aria-hidden="true"
              /></span>
              Benutzer
              <i
                class="bi bi-chevron-right quick-link-end"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="quick-link"
              @click="zuAnsicht('groups')"
            >
              <span class="quick-link-icon"><i
                class="bi bi-collection-fill"
                aria-hidden="true"
              /></span>
              Gruppen
              <i
                class="bi bi-chevron-right quick-link-end"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="quick-link"
              @click="zuAnsicht('import')"
            >
              <span class="quick-link-icon"><i
                class="bi bi-upload"
                aria-hidden="true"
              /></span>
              CSV-Import
              <i
                class="bi bi-chevron-right quick-link-end"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="quick-link"
              :disabled="!serverLink"
              :title="serverLink ? 'Nextcloud im Browser öffnen' : 'Nur für https-Server verfügbar'"
              @click="nextcloudOeffnen"
            >
              <span class="quick-link-icon"><i
                class="bi bi-cloud"
                aria-hidden="true"
              /></span>
              Nextcloud öffnen
              <i
                class="bi bi-box-arrow-up-right quick-link-end"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>
      <div class="col-12 col-xl-8">
        <div class="content-card h-100">
          <div class="content-card-header">
            <span>System</span>
          </div>
          <div class="content-card-body">
            <div class="system-grid">
              <div
                v-for="zeile in system"
                :key="zeile.label"
                class="system-row"
              >
                <span
                  class="system-icon"
                  :class="`ton-${zeile.ton}`"
                >
                  <i
                    class="bi"
                    :class="zeile.icon"
                    aria-hidden="true"
                  />
                </span>
                <span class="system-copy">
                  <span class="system-label">{{ zeile.label }}</span>
                  <span class="system-value">{{ zeile.wert }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="content-card">
      <div class="content-card-header">
        <span>Letzte Jobs</span>
      </div>
      <div class="content-card-body">
        <div
          v-if="jobHistorie.length === 0"
          class="empty-state"
        >
          <i
            class="bi bi-inbox"
            aria-hidden="true"
          />
          Noch keine Jobs in dieser Sitzung
        </div>
        <div
          v-else
          class="table-usermanager-wrap"
        >
          <table class="table-usermanager">
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Aktion</th>
                <th>Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(eintrag, index) in jobHistorie"
                :key="index"
              >
                <td>{{ formatTimestamp(eintrag.zeitpunkt) }}</td>
                <td>{{ eintrag.aktion }}</td>
                <td>
                  {{ historyCounts(eintrag.summary).ok }} ok,
                  {{ historyCounts(eintrag.summary).fehler }} Fehler
                  (davon {{ historyCounts(eintrag.summary).teilweise }} teilweise)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </StateBlock>
</template>

<style scoped>
.notice {
  color: var(--text-secondary);
  margin: 0.5rem 0 0;
}

.system-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.55rem;
}

.system-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--sidebar-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.system-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.system-icon.ton-host { background: rgba(88, 166, 255, 0.12); color: #58a6ff; }
.system-icon.ton-ip { background: rgba(86, 212, 221, 0.12); color: #56d4dd; }
.system-icon.ton-cpu { background: rgba(163, 113, 247, 0.12); color: #a371f7; }
.system-icon.ton-ram { background: rgba(210, 153, 34, 0.12); color: #d29922; }
.system-icon.ton-disk { background: rgba(63, 185, 80, 0.12); color: #3fb950; }
.system-icon.ton-os { background: rgba(88, 166, 255, 0.12); color: #79c0ff; }
.system-icon.ton-zeit { background: rgba(248, 81, 73, 0.12); color: #f85149; }
.system-icon.ton-user { background: rgba(163, 113, 247, 0.12); color: #d2a8ff; }

.system-copy {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.system-label {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.system-value {
  font-size: 0.88rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

@media (min-width: 768px) {
  .system-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
