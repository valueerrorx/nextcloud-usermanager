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
import { formatPercent } from '../../shared/quota.js';
import { formatTimestamp } from '../../shared/time.js';
import { dashboardCards, fastVollListe, historyCounts } from '../../shared/dashboard.js';
import { nextcloudLink } from '../../shared/externalUrl.js';
import { toastError } from '../toast.js';
import { ladeGruppen, ladeUserliste } from '../loaders.js';
import {
  activeView, connection, filterGruppe, filterQuotaStufe, filterStatus, filterSuche, groups, groupsFehler,
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

const karten = computed(() => dashboardCards({ users: users.value, groupCount: groups.value.length }));
const serverLink = computed(() => nextcloudLink(connection.baseUrl));
const fastVoll = computed(() => fastVollListe(users.value));

// Optional (Step-Spec: "wenn es ohne Berechnung in der .vue nicht geht, weglassen") - hier geht
// es ohne Berechnung: einfache Zuweisungen auf bestehende state.js-Felder. Die drei anderen Filter
// werden zuerst zurückgesetzt (REVIEW-NOTES MINOR, S13-Review) - sonst kann ein stehender Filter
// (z. B. "nur deaktiviert") den gerade angeklickten User in der Usertabelle unsichtbar machen.
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
          <div class="stat-value stat-value-lg">
            {{ karte.wert }}
          </div>
          <div class="stat-label">
            {{ karte.label }}
          </div>
          <div
            v-if="karte.metrics.length > 0"
            class="stat-card-metrics stat-card-metrics--stack mt-3"
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
              Zu Benutzern
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
              Zu Gruppen
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

.fast-voll-zeile {
  cursor: pointer;
}

.fast-voll-zeile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
