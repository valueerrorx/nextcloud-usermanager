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
import { formatBytes, formatPercent } from '../../shared/quota.js';
import { formatTimestamp } from '../../shared/time.js';
import { fastVollListe, historyCounts, storageTotals, userCounts } from '../../shared/dashboard.js';
import { ladeGruppen, ladeUserliste } from '../loaders.js';
import {
  activeView, filterGruppe, filterQuotaStufe, filterStatus, filterSuche, groups, groupsFehler,
  groupsLadezustand, jobHistorie, users, usersFehler, usersFetchedAt, usersLadezustand,
  usersUebersprungen,
} from '../state.js';
import StateBlock from '../components/StateBlock.vue';

async function ladeAlles() {
  await Promise.all([ladeUserliste(), ladeGruppen()]);
}

onMounted(() => {
  if (users.value.length === 0) ladeUserliste();
  if (groups.value.length === 0) ladeGruppen();
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

const benutzerKennzahlen = computed(() => userCounts(users.value));
const speicherKennzahlen = computed(() => storageTotals(users.value));
const fastVoll = computed(() => fastVollListe(users.value));

// Optional (Step-Spec: "wenn es ohne Berechnung in der .vue nicht geht, weglassen") - hier geht
// es ohne Berechnung: einfache Zuweisungen auf bestehende state.js-Felder. Die drei anderen Filter
// werden zuerst zurückgesetzt (REVIEW-NOTES MINOR, S13-Review) - sonst kann ein stehender Filter
// (z. B. "nur deaktiviert") den gerade angeklickten User in der Usertabelle unsichtbar machen.
function zuBenutzerWechseln(userid) {
  filterGruppe.value = null;
  filterStatus.value = 'alle';
  filterQuotaStufe.value = null;
  filterSuche.value = userid;
  activeView.value = 'users';
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

  <div class="toolbar">
    <button
      type="button"
      class="btn btn-outline-secondary"
      title="Dashboard neu laden"
      :disabled="kombinierterZustand === 'laedt'"
      @click="ladeAlles"
    >
      <i
        class="bi bi-arrow-clockwise"
        :class="{ spin: kombinierterZustand === 'laedt' }"
        aria-hidden="true"
      />
      Neu laden
    </button>
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
    <div class="dashboard-stat-row">
      <div class="stat-card">
        <div class="stat-card-kicker">
          Benutzer
        </div>
        <div class="stat-value">
          {{ benutzerKennzahlen.gesamt }}
        </div>
        <div class="stat-card-metrics">
          <div class="stat-metric">
            <span class="stat-metric-label">Aktiv</span>
            <span class="stat-metric-value">{{ benutzerKennzahlen.aktiv }}</span>
          </div>
          <div class="stat-metric">
            <span class="stat-metric-label">Deaktiviert</span>
            <span class="stat-metric-value">{{ benutzerKennzahlen.deaktiviert }}</span>
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-card-kicker">
          Gruppen
        </div>
        <div class="stat-value">
          {{ groups.length }}
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-card-kicker">
          Speicher
        </div>
        <div class="stat-card-metrics stat-card-metrics--stack">
          <div class="stat-metric stat-metric--row">
            <span class="stat-metric-label">Genutzt (gesamt)</span>
            <span class="stat-metric-value mono">{{ formatBytes(speicherKennzahlen.genutztBytes) }}</span>
          </div>
          <div class="stat-metric stat-metric--row">
            <span class="stat-metric-label">Summe begrenzter Kontingente</span>
            <span class="stat-metric-value mono">{{ formatBytes(speicherKennzahlen.summeBegrenztBytes) }}</span>
          </div>
          <div class="stat-metric stat-metric--row">
            <span class="stat-metric-label">Unbegrenzte Konten</span>
            <span class="stat-metric-value">{{ speicherKennzahlen.anzahlUnbegrenzt }}</span>
          </div>
          <div class="stat-metric stat-metric--row">
            <span class="stat-metric-label">Unbekanntes Kontingent</span>
            <span class="stat-metric-value">{{ speicherKennzahlen.anzahlUnbekannt }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="content-card">
      <div class="content-card-header">
        <span>Fast voll (&gt; 90 %)</span>
      </div>
      <div class="content-card-body">
        <div
          v-if="fastVoll.eintraege.length === 0"
          class="empty-state"
        >
          <i
            class="bi bi-check-circle"
            aria-hidden="true"
          />
          Kein Benutzer über 90 % Kontingent
        </div>
        <template v-else>
          <div class="table-usermanager-wrap">
            <table class="table-usermanager">
              <thead>
                <tr>
                  <th>Benutzer</th>
                  <th>Belegung</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="eintrag in fastVoll.eintraege"
                  :key="eintrag.userid"
                  class="fast-voll-zeile"
                  tabindex="0"
                  role="button"
                  :aria-label="`Zu Benutzer ${eintrag.displayname} wechseln`"
                  @click="zuBenutzerWechseln(eintrag.userid)"
                  @keydown.enter="zuBenutzerWechseln(eintrag.userid)"
                  @keydown.space.prevent="zuBenutzerWechseln(eintrag.userid)"
                >
                  <td>{{ eintrag.displayname }} ({{ eintrag.userid }})</td>
                  <td>{{ formatPercent(eintrag.quota.usagePercent) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p
            v-if="fastVoll.weitere > 0"
            class="notice"
          >
            und {{ fastVoll.weitere }} weitere
          </p>
        </template>
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
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.notice {
  color: var(--text-secondary);
  margin: 0.5rem 0 0;
}

.fast-voll-zeile {
  cursor: pointer;
}

.fast-voll-zeile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
