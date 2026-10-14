<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { MESSAGES } from '../../shared/messages.js';
import {
  alleAusgewaehlt, filterUsers, gruppenOptionen, pruneAuswahl, SEITEN_GROESSEN, seitenAusschnitt, sortUsers,
} from '../../shared/filters.js';
import { formatTimestamp } from '../../shared/time.js';
import { parseUserList } from '../../shared/csvImport.js';
import { QUOTA_PRESETS } from '../../shared/quota.js';
import { auswahlNachCsv, ordneUserliste, userlisteRueckmeldung } from '../../shared/userListe.js';
import { gruppenKurztext } from '../../shared/groups.js';
import { buildSingleCreate, einzelErgebnis, kannAnlegen, useridHinweis } from '../../shared/userCreate.js';
import { describeError } from '../../shared/logSafe.js';
import { ladeGruppen, ladeUserliste } from '../loaders.js';
import {
  auswahl, connection, groups, jobLaeuft, filterGruppe, filterQuotaStufe, filterStatus, filterSuche, seitenGroesse,
  seitenNummer, sortFeld, sortRichtung, users, usersFehler, usersFetchedAt, usersLadezustand, usersUebersprungen,
} from '../state.js';
import StateBlock from '../components/StateBlock.vue';
import UserTable from '../components/UserTable.vue';
import ActionBar from '../components/ActionBar.vue';
import JobProgress from '../components/JobProgress.vue';

const actionBar = ref(null);

const QUOTA_STUFEN = [
  { wert: 'unter50', label: '< 50 %' },
  { wert: 'f50bis90', label: '50 - 90 %' },
  { wert: 'ueber90', label: '> 90 %' },
  { wert: 'unbegrenzt', label: 'unbegrenzt' },
  { wert: 'unbekannt', label: 'unbekannt' },
];

// Gruppenoptionen aus der geladenen Userliste (S06).
const gruppenOptionenListe = computed(() => gruppenOptionen(users.value));

// Einzige Stelle, die filterUsers/sortUsers aufruft (ARCHITECTURE §4.1).
const gefilterteUndSortierte = computed(() => sortUsers(
  filterUsers(users.value, {
    suche: filterSuche.value,
    gruppe: filterGruppe.value,
    status: filterStatus.value,
    quotaStufe: filterQuotaStufe.value,
  }),
  { feld: sortFeld.value, richtung: sortRichtung.value },
));

const ausschnitt = computed(() => seitenAusschnitt(
  gefilterteUndSortierte.value,
  seitenNummer.value,
  seitenGroesse.value,
));

// Auswahl auf das Filterergebnis beschneiden; immediate, damit sie auch nach fehlgeschlagenem Reload gilt.
watch(gefilterteUndSortierte, (liste) => {
  auswahl.value = new Set(pruneAuswahl(auswahl.value, liste));
}, { immediate: true });

// Filter, Sortierung und Seitengröße beginnen wieder bei der ersten Seite.
watch([gefilterteUndSortierte, seitenGroesse], () => {
  seitenNummer.value = 1;
});

function zuSeite(nummer) {
  seitenNummer.value = nummer;
}

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

// Trifft nur das aktuelle Filterergebnis; Abwählen entfernt nur sichtbare userids.
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

const csvRueckmeldung = ref('');

// Nach erfolgreichem Lesen ersetzt die CSV die Auswahl immer, auch wenn nichts passt.
async function onAuswahlAusCsv() {
  if (usersLadezustand.value !== 'bereit') return;
  try {
    const result = await window.api.filesOpenCsv({ zweck: 'userliste' });
    if (usersLadezustand.value !== 'bereit') return;
    if (!result.ok) {
      if (result.messageId !== 'abgebrochen') csvRueckmeldung.value = result.message ?? MESSAGES.datei_lesen_fehlgeschlagen;
      return;
    }
    const ordnung = ordneUserliste(parseUserList(result.text).usernames, users.value);
    csvRueckmeldung.value = userlisteRueckmeldung(ordnung);
    filterZuruecksetzen();
    auswahl.value = new Set(auswahlNachCsv(ordnung));
  } catch (error) {
    csvRueckmeldung.value = MESSAGES.unerwarteter_serverfehler;
    console.error('files.openCsv failed:', error);
  }
}

// Row buttons share the batch path: a dry run over exactly this one user.
function onRowAction({ userid, action }) {
  actionBar.value?.runSingle(userid, action);
}

function auswahlAufheben() {
  auswahl.value = new Set();
}

function sucheLeeren() {
  filterSuche.value = '';
}

const formOffen = ref(false);
const neuUserid = ref('');
const neuAnzeigename = ref('');
const neuPasswort = ref('');
const neuQuota = ref('standard');
const neuGruppen = ref([]);
const anlegenMeldung = ref(null); // { erfolg, text } | null
const anlegenLaeuft = ref(false);

const useridFehlertext = computed(() => useridHinweis(neuUserid.value));
const anlegenMoeglich = computed(() => kannAnlegen({
  userid: neuUserid.value, password: neuPasswort.value, laeuft: anlegenLaeuft.value || jobLaeuft.value,
}));

function formularLeeren() {
  neuUserid.value = '';
  neuAnzeigename.value = '';
  neuPasswort.value = '';
  neuQuota.value = 'standard';
  neuGruppen.value = [];
}

async function onAnlegen() {
  const { items, params } = buildSingleCreate({
    userid: neuUserid.value,
    password: neuPasswort.value,
    displayName: neuAnzeigename.value,
    groups: neuGruppen.value,
    quotaId: neuQuota.value,
  });
  anlegenLaeuft.value = true;
  anlegenMeldung.value = null;
  try {
    const result = await window.api.actionsRun({
      jobId: `create-${Date.now()}`, action: 'user.create', items, params,
    });
    if (!result.ok) {
      anlegenMeldung.value = { erfolg: false, text: result.message ?? MESSAGES.aktion_fehlgeschlagen };
      return;
    }
    anlegenMeldung.value = einzelErgebnis(result.results[0]);
    if (anlegenMeldung.value.erfolg) {
      formularLeeren();
      await ladeUserliste();
    }
  } catch (error) {
    console.error('user.create failed:', error);
    anlegenMeldung.value = { erfolg: false, text: `${MESSAGES.unerwarteter_serverfehler} (${describeError(error)})` };
  } finally {
    neuPasswort.value = '';
    anlegenLaeuft.value = false;
  }
}

// { geladen, gesamt } während des N+1-Fallbacks, sonst null.
const fortschritt = ref(null);

// Gemeinsamer Ladepfad aus loaders.js (eigenes try/catch); bei Fehler wird die Auswahl geleert.
async function load() {
  fortschritt.value = null;
  const result = await ladeUserliste();
  if (!result.ok) {
    auswahl.value = new Set();
  }
  fortschritt.value = null;
}

let disposeProgress = null;

onMounted(() => {
  // Feuert nur im N+1-Fallback, sein Eintreffen zeigt die Fortschrittsanzeige.
  disposeProgress = window.api.onUsersLoadProgress((progress) => {
    fortschritt.value = progress;
  });
  load();
  if (groups.value.length === 0) ladeGruppen();
});

onUnmounted(() => {
  disposeProgress?.();
  neuPasswort.value = '';
});
</script>

<template>
  <div class="users-page">
    <div class="page-header d-flex flex-wrap align-items-start justify-content-between gap-2">
      <div>
        <h1 class="page-title">
          <i
            class="bi bi-people-fill"
            aria-hidden="true"
          />
          Benutzer
        </h1>
        <p class="page-subtitle">
          {{ users.length }} Benutzer<template v-if="usersFetchedAt">
            , Stand: {{ formatTimestamp(usersFetchedAt) }}
          </template>
        </p>
      </div>
      <div class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          title="Userliste neu laden"
          :disabled="anlegenLaeuft || usersLadezustand === 'laedt'"
          @click="load"
        >
          <i
            class="bi bi-arrow-clockwise"
            aria-hidden="true"
          />
          Neu laden
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          :aria-expanded="formOffen"
          @click="formOffen = !formOffen"
        >
          <i
            class="bi bi-person-plus"
            aria-hidden="true"
          />
          Benutzer anlegen
        </button>
      </div>
    </div>

    <p
      v-if="csvRueckmeldung"
      class="notice"
    >
      {{ csvRueckmeldung }}
    </p>

    <div
      v-if="formOffen"
      class="content-card"
    >
      <div class="content-card-header">
        <span>Benutzer anlegen</span>
      </div>
      <div class="content-card-body anlegen-form">
        <div>
          <label
            for="neu-userid"
            class="form-label"
          >Benutzername</label>
          <input
            id="neu-userid"
            v-model="neuUserid"
            type="text"
            class="form-control"
            autocomplete="off"
          >
          <p
            v-if="useridFehlertext"
            class="form-fehler"
          >
            {{ useridFehlertext }}
          </p>
        </div>
        <div>
          <label
            for="neu-anzeigename"
            class="form-label"
          >Anzeigename</label>
          <input
            id="neu-anzeigename"
            v-model="neuAnzeigename"
            type="text"
            class="form-control"
          >
        </div>
        <div>
          <label
            for="neu-passwort"
            class="form-label"
          >Passwort</label>
          <input
            id="neu-passwort"
            v-model="neuPasswort"
            type="password"
            class="form-control"
            autocomplete="new-password"
          >
        </div>
        <div>
          <label
            for="neu-quota"
            class="form-label"
          >Kontingent</label>
          <select
            id="neu-quota"
            v-model="neuQuota"
            class="form-select"
          >
            <option
              v-for="preset in QUOTA_PRESETS"
              :key="preset.id"
              :value="preset.id"
            >
              {{ preset.label }}
            </option>
          </select>
        </div>
        <div>
          <label
            for="neu-gruppen"
            class="form-label"
          >Gruppen</label>
          <select
            id="neu-gruppen"
            v-model="neuGruppen"
            class="form-select"
            multiple
          >
            <option
              v-for="gruppe in groups"
              :key="gruppe.id"
              :value="gruppe.id"
            >
              {{ gruppenKurztext(groups, gruppe.id) }}
            </option>
          </select>
        </div>
        <div>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!anlegenMoeglich"
            @click="onAnlegen"
          >
            <i
              class="bi bi-person-plus"
              aria-hidden="true"
            />
            Anlegen
          </button>
          <p
            v-if="anlegenMeldung"
            :class="anlegenMeldung.erfolg ? 'notice' : 'form-fehler'"
          >
            {{ anlegenMeldung.text }}
          </p>
        </div>
      </div>
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
      class="content-card mb-3"
    >
      <div class="content-card-body py-2">
        <div class="row g-2 align-items-center">
          <div class="col-md-4">
            <div class="input-group input-group-sm">
              <span class="input-group-text">
                <i
                  class="bi bi-search"
                  aria-hidden="true"
                />
              </span>
              <input
                v-model="filterSuche"
                type="text"
                placeholder="Name, Anzeigename oder E-Mail"
                aria-label="Suche"
                class="form-control"
              >
              <button
                v-if="filterSuche"
                type="button"
                class="btn btn-outline-secondary"
                title="Suche leeren"
                aria-label="Suche leeren"
                @click="sucheLeeren"
              >
                <i
                  class="bi bi-x-lg"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
          <div class="col-auto">
            <select
              v-model="filterStatus"
              class="form-select form-select-sm filter-select"
              aria-label="Status"
            >
              <option value="alle">
                Alle Status
              </option>
              <option value="aktiv">
                Aktiv
              </option>
              <option value="deaktiviert">
                Deaktiviert
              </option>
            </select>
          </div>
          <div class="col-auto">
            <select
              v-model="filterGruppe"
              class="form-select form-select-sm filter-select"
              aria-label="Gruppe"
            >
              <option :value="null">
                Alle Gruppen
              </option>
              <option
                v-for="gruppe in gruppenOptionenListe"
                :key="gruppe"
                :value="gruppe"
              >
                {{ gruppenKurztext(groups, gruppe) }}
              </option>
            </select>
          </div>
          <div class="col-auto">
            <select
              v-model="filterQuotaStufe"
              class="form-select form-select-sm filter-select"
              aria-label="Kontingentstufe"
            >
              <option :value="null">
                Alle Kontingente
              </option>
              <option
                v-for="stufe in QUOTA_STUFEN"
                :key="stufe.wert"
                :value="stufe.wert"
              >
                {{ stufe.label }}
              </option>
            </select>
          </div>
          <div class="col-auto ms-auto d-flex align-items-center gap-2">
            <span class="treffer">{{ gefilterteUndSortierte.length }} von {{ users.length }}</span>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              title="Filter zurücksetzen"
              @click="filterZuruecksetzen"
            >
              <i
                class="bi bi-x-circle"
                aria-hidden="true"
              />
              Filter zurücksetzen
            </button>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              :disabled="usersLadezustand !== 'bereit' || anlegenLaeuft"
              @click="onAuswahlAusCsv"
            >
              <i
                class="bi bi-upload"
                aria-hidden="true"
              />
              Auswahl aus CSV
            </button>
          </div>
        </div>
      </div>
    </div>

    <ActionBar
      v-if="usersLadezustand === 'bereit'"
      ref="actionBar"
      :users="users"
      :auswahl="auswahl"
      :admin-user-id="connection.adminUserId"
      :gesperrt="anlegenLaeuft"
      @finished="load"
      @clear="auswahlAufheben"
    />

    <div class="content-card users-tabelle">
      <div class="content-card-body">
        <StateBlock
          :zustand="usersLadezustand"
          :fehlermeldung="usersFehler ?? ''"
          @retry="load"
        >
          <div
            v-if="gefilterteUndSortierte.length > 0"
            class="users-ergebnis"
          >
            <UserTable
              :users="ausschnitt.eintraege"
              :auswahl-liste="gefilterteUndSortierte"
              :sort-feld="sortFeld"
              :sort-richtung="sortRichtung"
              :auswahl="auswahl"
              :admin-user-id="connection.adminUserId"
              :gesperrt="anlegenLaeuft || jobLaeuft"
              :gruppen="groups"
              @sort="onSort"
              @toggle="onToggle"
              @toggle-alle="onToggleAlle"
              @row-action="onRowAction"
            />
            <div class="seiten-leiste">
              <span class="treffer">{{ ausschnitt.von }}–{{ ausschnitt.bis }} von {{ ausschnitt.gesamt }}</span>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                :disabled="ausschnitt.seite <= 1"
                @click="zuSeite(ausschnitt.seite - 1)"
              >
                Zurück
              </button>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                :disabled="ausschnitt.seite >= ausschnitt.seiten"
                @click="zuSeite(ausschnitt.seite + 1)"
              >
                Weiter
              </button>
              <select
                v-model.number="seitenGroesse"
                class="form-select form-select-sm seiten-groesse"
                aria-label="Zeilen pro Seite"
              >
                <option
                  v-for="groesse in SEITEN_GROESSEN"
                  :key="groesse"
                  :value="groesse"
                >
                  {{ groesse }}
                </option>
              </select>
            </div>
          </div>
          <p
            v-else
            class="notice"
          >
            Keine Treffer für diesen Filter.
          </p>
        </StateBlock>
      </div>
    </div>

    <JobProgress quelle="users" />
  </div>
</template>

<style scoped>
.users-page {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.users-page > :not(.users-tabelle) {
  flex-shrink: 0;
}

.users-tabelle {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
}

.users-tabelle > .content-card-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.users-ergebnis {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.users-ergebnis :deep(.table-usermanager-wrap) {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
}

.notice {
  color: var(--text-secondary);
  margin: 0 0 12px;
}

.filter-select {
  min-width: 130px;
}

.treffer {
  color: var(--text-secondary);
  font-size: 0.83rem;
  white-space: nowrap;
}

.seiten-leiste {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.seiten-groesse {
  width: 5.5rem;
}

.form-fehler {
  color: var(--danger, #f85149);
  margin: 4px 0 0;
}

.anlegen-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

</style>
