<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { MESSAGES } from '../../shared/messages.js';
import {
  alleAusgewaehlt, filterUsers, gruppenOptionen, pruneAuswahl, sortUsers,
} from '../../shared/filters.js';
import {
  auswahl, connection, filterGruppe, filterQuotaStufe, filterStatus, filterSuche, sortFeld,
  sortRichtung, users, usersFehler, usersFetchedAt, usersLadezustand, usersMode,
  usersUebersprungen,
} from '../state.js';
import StateBlock from '../components/StateBlock.vue';
import UserTable from '../components/UserTable.vue';
import ActionBar from '../components/ActionBar.vue';
import JobProgress from '../components/JobProgress.vue';

const QUOTA_STUFEN = [
  { wert: 'unter50', label: '< 50 %' },
  { wert: 'f50bis90', label: '50 - 90 %' },
  { wert: 'ueber90', label: '> 90 %' },
  { wert: 'unbegrenzt', label: 'unbegrenzt' },
  { wert: 'unbekannt', label: 'unbekannt' },
];

// Alphabetisch (deutsch) aus der geladenen Userliste abgeleitet, keine eigene Gruppenquelle (S06).
// Nur Aufruf der puren Funktion aus filters.js - kein Rechnen in der Komponente (ARCHITECTURE §4.1).
const gruppenOptionenListe = computed(() => gruppenOptionen(users.value));

// Einzige Stelle, die filterUsers/sortUsers aufruft - keine Filter- oder Sortierlogik in der
// Komponente (ARCHITECTURE §4.1).
const gefilterteUndSortierte = computed(() => sortUsers(
  filterUsers(users.value, {
    suche: filterSuche.value,
    gruppe: filterGruppe.value,
    status: filterStatus.value,
    quotaStufe: filterQuotaStufe.value,
  }),
  { feld: sortFeld.value, richtung: sortRichtung.value },
));

// Ändert sich das Filterergebnis, bleiben nur noch sichtbare User in der Auswahl (ARCHITECTURE
// §4.1) - keine unsichtbaren User werden mitgeschleppt. immediate: true, damit die Invariante
// auch dann gilt, wenn ein fehlgeschlagenes Neuladen die Liste identisch lässt (sonst würde der
// watch nicht feuern und eine inzwischen ungültige Auswahl stehen bleiben).
watch(gefilterteUndSortierte, (liste) => {
  auswahl.value = new Set(pruneAuswahl(auswahl.value, liste));
}, { immediate: true });

function onSort(feld) {
  if (sortFeld.value === feld) {
    sortRichtung.value = sortRichtung.value === 'aufsteigend' ? 'absteigend' : 'aufsteigend';
  } else {
    sortFeld.value = feld;
    sortRichtung.value = 'aufsteigend';
  }
}

function onToggle(userid) {
  const neu = new Set(auswahl.value);
  if (neu.has(userid)) {
    neu.delete(userid);
  } else {
    neu.add(userid);
  }
  auswahl.value = neu;
}

// "Alles auswählen" trifft genau das aktuelle Filterergebnis, nicht die ganze Liste (DECISIONS).
// alleAusgewaehlt ist dieselbe Funktion wie in UserTable.vue (CRITICAL-Fix S06-Review) - eine
// Wahrheit für den Checkbox-Zustand. Abwählen entfernt nur die sichtbaren userids aus der
// Auswahl statt sie komplett zu leeren.
function onToggleAlle() {
  const sichtbar = gefilterteUndSortierte.value;
  const neu = new Set(auswahl.value);
  if (alleAusgewaehlt(auswahl.value, sichtbar)) {
    sichtbar.forEach((u) => neu.delete(u.userid));
  } else {
    sichtbar.forEach((u) => neu.add(u.userid));
  }
  auswahl.value = neu;
}

function filterZuruecksetzen() {
  filterSuche.value = '';
  filterGruppe.value = null;
  filterStatus.value = 'alle';
  filterQuotaStufe.value = null;
}

// { geladen, gesamt } während des N+1-Fallbacks, sonst null - nur in dieser View interessant,
// deshalb kein eigenes state.js-Feld.
const fortschritt = ref(null);

// Eigenes try/catch statt dem Aufrufer zu überlassen (REVIEW-NOTES [S01] - jede Promise wird
// awaited oder gecatcht), damit sowohl onMounted als auch der "Neu laden"-Button load() ohne
// .catch() aufrufen können.
async function load() {
  usersLadezustand.value = 'laedt';
  usersFehler.value = null;
  usersUebersprungen.value = 0;
  fortschritt.value = null;
  try {
    const result = await window.api.usersList();
    if (!result.ok) {
      usersLadezustand.value = 'fehler';
      usersFehler.value = result.message ?? MESSAGES.userliste_fehlgeschlagen;
      auswahl.value = new Set();
      return;
    }
    users.value = result.users;
    usersMode.value = result.mode;
    usersFetchedAt.value = result.fetchedAt;
    usersUebersprungen.value = result.uebersprungen ?? 0;
    usersLadezustand.value = result.users.length === 0 ? 'leer' : 'bereit';
  } catch (error) {
    usersLadezustand.value = 'fehler';
    usersFehler.value = MESSAGES.unerwarteter_serverfehler;
    auswahl.value = new Set();
    console.error('Failed to load user list:', error);
  } finally {
    fortschritt.value = null;
  }
}

let disposeProgress = null;

onMounted(() => {
  // Feuert laut ARCHITECTURE §3 nur während des N+1-Fallbacks - ihr Eintreffen ist daher selbst
  // das Signal, die Fortschrittsanzeige samt Warnhinweis zu zeigen.
  disposeProgress = window.api.onUsersLoadProgress((progress) => {
    fortschritt.value = progress;
  });
  load();
});

onUnmounted(() => {
  disposeProgress?.();
});

function formatTimestamp(ms) {
  return ms ? new Date(ms).toLocaleString('de-DE') : '';
}
</script>

<template>
  <div class="page-header">
    <h1 class="page-title">
      <i
        class="bi bi-people-fill"
        aria-hidden="true"
      />
      Benutzer
    </h1>
  </div>

  <div class="toolbar">
    <button
      type="button"
      class="btn btn-outline-secondary"
      title="Userliste neu laden"
      :disabled="usersLadezustand === 'laedt'"
      @click="load"
    >
      <i
        class="bi bi-arrow-clockwise"
        :class="{ spin: usersLadezustand === 'laedt' }"
        aria-hidden="true"
      />
      Neu laden
    </button>
    <span
      v-if="usersFetchedAt"
      class="timestamp"
    >
      Stand: {{ formatTimestamp(usersFetchedAt) }}
    </span>
  </div>

  <p
    v-if="usersLadezustand === 'laedt' && fortschritt"
    class="notice"
  >
    {{ MESSAGES.einzelabfragen_aktiv }} ({{ fortschritt.geladen }} / {{ fortschritt.gesamt }})
  </p>

  <p
    v-if="usersUebersprungen > 0"
    class="notice"
  >
    {{ MESSAGES.einige_user_uebersprungen }} ({{ usersUebersprungen }})
  </p>

  <div
    v-if="usersLadezustand === 'bereit'"
    class="filterleiste"
  >
    <div class="suche input-group">
      <span class="input-group-text">
        <i
          class="bi bi-search"
          aria-hidden="true"
        />
      </span>
      <input
        v-model="filterSuche"
        type="text"
        placeholder="Suche nach Benutzername, Anzeigename oder E-Mail"
        class="form-control"
      >
    </div>
    <select
      v-model="filterGruppe"
      class="form-select"
    >
      <option :value="null">
        Alle Gruppen
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
      v-model="filterStatus"
      class="form-select"
    >
      <option value="alle">
        Alle
      </option>
      <option value="aktiv">
        Aktiv
      </option>
      <option value="deaktiviert">
        Deaktiviert
      </option>
    </select>
    <select
      v-model="filterQuotaStufe"
      class="form-select"
    >
      <option :value="null">
        Alle Kontingentstufen
      </option>
      <option
        v-for="stufe in QUOTA_STUFEN"
        :key="stufe.wert"
        :value="stufe.wert"
      >
        {{ stufe.label }}
      </option>
    </select>
    <button
      type="button"
      class="btn btn-outline-secondary"
      title="Filter zurücksetzen"
      @click="filterZuruecksetzen"
    >
      <i
        class="bi bi-funnel"
        aria-hidden="true"
      />
      Filter zurücksetzen
    </button>
  </div>

  <p
    v-if="usersLadezustand === 'bereit'"
    class="zusammenfassung"
  >
    {{ gefilterteUndSortierte.length }} von {{ users.length }} Benutzern,
    {{ auswahl.size }} ausgewählt
  </p>

  <div class="content-card">
    <div class="content-card-body">
      <StateBlock
        :zustand="usersLadezustand"
        :fehlermeldung="usersFehler ?? ''"
        @retry="load"
      >
        <UserTable
          v-if="gefilterteUndSortierte.length > 0"
          :users="gefilterteUndSortierte"
          :sort-feld="sortFeld"
          :sort-richtung="sortRichtung"
          :auswahl="auswahl"
          :ausgewaehlte-anzahl="auswahl.size"
          @sort="onSort"
          @toggle="onToggle"
          @toggle-alle="onToggleAlle"
        />
        <p
          v-else
          class="notice"
        >
          Keine Treffer für diesen Filter.
        </p>
      </StateBlock>
    </div>
  </div>

  <ActionBar
    v-if="usersLadezustand === 'bereit'"
    :users="users"
    :auswahl="auswahl"
    :admin-user-id="connection.adminUserId"
    @finished="load"
  />
  <JobProgress />
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.timestamp {
  color: var(--text-secondary);
  font-size: 0.9em;
}

.notice {
  color: var(--text-secondary);
  margin: 0 0 12px;
}

.filterleiste {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.filterleiste .suche {
  flex: 1;
  min-width: 220px;
}

.zusammenfassung {
  color: var(--text-secondary);
  margin: 0 0 12px;
}
</style>
