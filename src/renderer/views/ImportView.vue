<script setup>
// CSV wählen, Optionen setzen, Vorschau sehen (S10, ARCHITECTURE §3.1/§6). Das Anlegen selbst ist
// S11. Rechnet nichts selbst: parseImportCsv/buildImportPlan aus shared/, Live-Beispiel aus
// shared/password.js - keine neue Importlogik hier (S10 spec "Ausdrücklich NICHT").
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import { MESSAGES } from '../../shared/messages.js';
import { parseImportCsv } from '../../shared/csvImport.js';
import { buildImportPlan } from '../../shared/importPlan.js';
import { validatePrefix, beispielPasswort } from '../../shared/password.js';
import { QUOTA_PRESETS, formatQuotaForApi, findQuotaPreset } from '../../shared/quota.js';
import { anzahlAnzulegen, buildCreateUserItems, dateiName, serverUserIds } from '../../shared/importView.js';
import {
  importDatei, importRows, importPlanRows, importSummary, importPrefix, importOrder,
  importGruppen, importQuota, importFehler, users, usersLadezustand, usersFehler,
  jobId, jobLaeuft, jobFortschritt, jobResults, jobSummary,
} from '../state.js';
import StateBlock from '../components/StateBlock.vue';
import JobProgress from '../components/JobProgress.vue';

const ORDER_OPTIONS = [
  { wert: 'givenFirst', label: 'vorname.nachname' },
  { wert: 'surnameFirst', label: 'nachname.vorname' },
];

const STATUS_BADGE = {
  neu: 'badge-active',
  kollision_aufgeloest: 'badge-warning',
  fehler: 'badge-inactive',
};

const STATUS_LABEL = {
  neu: 'neu',
  kollision_aufgeloest: 'Kollision aufgelöst',
  fehler: 'Fehler',
};

// Vom Server geladene Gruppen - nur diese sind als Zielgruppe wählbar, kein Freitext (DECISIONS,
// hält OCS 104 "Gruppe existiert nicht" aus dem Import fern).
const serverGruppen = ref([]);
const gruppenLadezustand = ref('laedt'); // 'laedt' | 'fehler' | 'bereit'
const gruppenFehler = ref(null);

async function ladeGruppen() {
  gruppenLadezustand.value = 'laedt';
  gruppenFehler.value = null;
  try {
    const result = await window.api.groupsList();
    if (!result.ok) {
      gruppenLadezustand.value = 'fehler';
      gruppenFehler.value = result.message ?? MESSAGES.gruppenliste_fehlgeschlagen;
      return;
    }
    serverGruppen.value = result.groups;
    gruppenLadezustand.value = 'bereit';
  } catch (error) {
    gruppenLadezustand.value = 'fehler';
    gruppenFehler.value = MESSAGES.unerwarteter_serverfehler;
    console.error('Failed to load group list:', error);
  }
}

// Userliste nachladen (CRITICAL-Fix S10-Review): serverUserIds unten braucht state.users, das
// aber nur UsersView.load() befüllt. Ohne diesen Nachlade-Pfad bleibt die Kollisionsprüfung
// (Stufe 13) off, wenn Import direkt nach dem Verbinden geöffnet wird - genau das Muster, das
// ARCHITECTURE §3.1 für GroupsView vorschreibt, gilt hier ebenso.
async function ladeUserliste() {
  usersLadezustand.value = 'laedt';
  usersFehler.value = null;
  try {
    const result = await window.api.usersList();
    if (!result.ok) {
      usersLadezustand.value = 'fehler';
      usersFehler.value = result.message ?? MESSAGES.userliste_fehlgeschlagen;
      return;
    }
    users.value = result.users;
    usersLadezustand.value = result.users.length === 0 ? 'leer' : 'bereit';
  } catch (error) {
    usersLadezustand.value = 'fehler';
    usersFehler.value = MESSAGES.unerwarteter_serverfehler;
    console.error('Failed to load user list:', error);
  }
}

// Serverliste gilt als geladen, sobald sie Einträge hat oder erfolgreich als leer zurückkam -
// nicht erst bei usersLadezustand === 'bereit', sonst bliebe eine zuvor von UsersView geladene,
// nicht-leere Liste fälschlich blockiert.
const userlisteBereit = computed(() => users.value.length > 0 || usersLadezustand.value === 'leer');

onMounted(() => {
  ladeGruppen();
  if (users.value.length === 0) {
    ladeUserliste();
  }
});

onUnmounted(() => {
  // Initialpasswörter dürfen nicht die ganze Sitzung im Speicher bleiben (CRITICAL-Fix
  // S10-Review, ARCHITECTURE §6) - mit dem Verlassen der View verschwindet die Vorschau.
  importPlanRows.value = [];
  importSummary.value = null;
});

// ---- Schritt 1: Datei ----
async function onDateiWaehlen() {
  importFehler.value = null;
  try {
    const result = await window.api.filesOpenCsv({ zweck: 'import' });
    if (!result.ok) {
      if (result.messageId !== 'abgebrochen') {
        // Vorherige Datei nicht neben der Fehlermeldung stehen lassen (MINOR-Fix S10-Review).
        importDatei.value = null;
        importRows.value = [];
        importFehler.value = result.message ?? MESSAGES.datei_lesen_fehlgeschlagen;
      }
      return;
    }
    const parsed = parseImportCsv(result.text);
    if (!parsed.ok) {
      importDatei.value = null;
      importRows.value = [];
      importFehler.value = MESSAGES[parsed.fileError];
      return;
    }
    importDatei.value = { path: result.path, zeilenAnzahl: parsed.rows.length };
    importRows.value = parsed.rows;
  } catch (error) {
    importFehler.value = MESSAGES.unerwarteter_serverfehler;
    console.error('files.openCsv failed:', error);
  }
}

// ---- Schritt 2: Optionen ----
const prefixValidierung = computed(() => validatePrefix(importPrefix.value));
const prefixFehlertext = computed(() => (
  prefixValidierung.value.ok ? null : MESSAGES[prefixValidierung.value.messageId]
));
// Live-Beispiel über dieselbe Funktion wie das echte Initialpasswort (ARCHITECTURE §4.1) - keine
// eigene Formatierung hier.
const passwortBeispiel = computed(() => beispielPasswort(importPrefix.value));

function istGruppeAusgewaehlt(groupId) {
  return importGruppen.value.includes(groupId);
}

function onGruppeToggle(groupId) {
  importGruppen.value = istGruppeAusgewaehlt(groupId)
    ? importGruppen.value.filter((g) => g !== groupId)
    : [...importGruppen.value, groupId];
}

async function onGruppeAnlegen() {
  const { value: name } = await Swal.fire({
    title: 'Gruppe neu anlegen',
    input: 'text',
    inputPlaceholder: 'Gruppenname',
    showCancelButton: true,
    confirmButtonText: 'Anlegen',
    cancelButtonText: 'Abbrechen',
    // Verhindert ein leises Schließen bei leerem/Leerzeichen-Namen (MINOR-Fix S10-Review).
    inputValidator: (value) => (
      !value || value.trim() === '' ? 'Bitte einen Gruppennamen eingeben.' : undefined
    ),
  });
  if (!name || name.trim() === '') return;
  try {
    const result = await window.api.groupsCreate({ groupid: name.trim() });
    if (!result.ok) {
      // Existiert die Gruppe server-seitig schon (OCS 102), wird sie trotzdem wählbar - sonst
      // bleibt sie unselektierbar, obwohl sie längst existiert (MINOR-Fix S10-Review).
      if (result.messageId === 'gruppe_existiert') {
        await ladeGruppen();
      }
      await Swal.fire({ title: 'Fehler', text: result.message ?? MESSAGES.gruppe_anlegen_fehlgeschlagen, icon: 'error' });
      return;
    }
    await ladeGruppen();
  } catch (error) {
    console.error('groups.create failed:', error);
    await Swal.fire({ title: 'Fehler', text: MESSAGES.unerwarteter_serverfehler, icon: 'error' });
  }
}

// ---- Schritt 3: Vorschau ----
// Server-Set aus der schon geladenen Userliste (ARCHITECTURE §3.1 Punkt 4) - kein eigener Request.
const serverUserIdListe = computed(() => serverUserIds(users.value));

// CRITICAL-Fix S10-Review: ohne userlisteBereit würde die Vorschau auch mit einer leeren,
// nicht nachgeladenen Liste gerechnet - der Kollisionscheck (Stufe 13) wäre damit lautlos aus.
const vorschauMoeglich = computed(() => (
  importRows.value.length > 0 && prefixValidierung.value.ok && userlisteBereit.value
));

// Einzige Stelle, die buildImportPlan aufruft - keine neue Importlogik (S10 spec).
const plan = computed(() => {
  if (!vorschauMoeglich.value) return null;
  return buildImportPlan({
    rows: importRows.value,
    serverUserIds: serverUserIdListe.value,
    order: importOrder.value,
    prefix: importPrefix.value,
  });
});

watch(plan, (neuerPlan) => {
  importPlanRows.value = neuerPlan?.rows ?? [];
  importSummary.value = neuerPlan?.summary ?? null;
}, { immediate: true });

function fehlertext(zeile) {
  return zeile.fehlerId ? MESSAGES[zeile.fehlerId] : '';
}

// ---- Schritt 4: Anlegen ----
const anzahlAnzulegenWert = computed(() => anzahlAnzulegen(importSummary.value));
const anlegenDisabled = computed(() => (
  !prefixValidierung.value.ok || !userlisteBereit.value || anzahlAnzulegenWert.value === 0
));

// S11 B1: erst Bestätigung mit der Anzahl (keine Zahleneingabe, das ist nur beim Löschen), dann
// derselbe actions.run-Weg wie jede andere Aktion (ARCHITECTURE §5) - items/byUserid kommen rein
// aus buildCreateUserItems, keine eigene Berechnung hier.
async function onAnlegen() {
  const bestaetigt = await Swal.fire({
    title: 'Benutzer anlegen',
    html: `<p>${anzahlAnzulegenWert.value} ${MESSAGES.import_bestaetigen}</p>`,
    showCancelButton: true,
    confirmButtonText: 'Anlegen',
    cancelButtonText: 'Abbrechen',
  });
  if (!bestaetigt.isConfirmed) return;

  const { items, byUserid } = buildCreateUserItems(importPlanRows.value);
  const quotaPreset = importQuota.value ? findQuotaPreset(importQuota.value) : null;
  const params = {
    byUserid,
    groups: importGruppen.value,
    quota: quotaPreset ? formatQuotaForApi(quotaPreset) : null,
  };

  const neueJobId = `job-${Date.now()}`;
  jobId.value = neueJobId;
  jobLaeuft.value = true;
  jobFortschritt.value = { done: 0, total: items.length };
  jobResults.value = [];
  jobSummary.value = null;

  try {
    const result = await window.api.actionsRun({ jobId: neueJobId, action: 'user.create', items, params });
    if (result.ok) {
      jobResults.value = result.results;
      jobSummary.value = result.summary;
    } else {
      await Swal.fire({ title: 'Fehler', text: result.message ?? MESSAGES.aktion_fehlgeschlagen, icon: 'error' });
    }
  } catch (error) {
    console.error('Import-Job fehlgeschlagen:', error);
    await Swal.fire({ title: 'Fehler', text: MESSAGES.unerwarteter_serverfehler, icon: 'error' });
  } finally {
    jobLaeuft.value = false;
    // Die angelegten User fehlen sonst in der Tabelle (S11 B3).
    await ladeUserliste();
  }
}
</script>

<template>
  <div class="page-header">
    <h1 class="page-title">
      <i
        class="bi bi-upload"
        aria-hidden="true"
      />
      Import
    </h1>
  </div>

  <div class="content-card">
    <div class="content-card-header">
      <span>1. Datei</span>
    </div>
    <div class="content-card-body">
      <button
        type="button"
        class="btn btn-outline-secondary"
        title="CSV wählen"
        @click="onDateiWaehlen"
      >
        <i
          class="bi bi-upload"
          aria-hidden="true"
        />
        CSV wählen
      </button>
      <p
        v-if="importDatei"
        class="notice"
      >
        {{ dateiName(importDatei.path) }} — {{ importDatei.zeilenAnzahl }} Zeilen
      </p>
      <p
        v-if="importFehler"
        class="text-danger"
      >
        <i
          class="bi bi-exclamation-triangle"
          aria-hidden="true"
        />
        {{ importFehler }}
      </p>
    </div>
  </div>

  <div
    v-if="importRows.length > 0"
    class="content-card"
  >
    <div class="content-card-header">
      <span>2. Optionen</span>
    </div>
    <div class="content-card-body">
      <div class="mb-3">
        <label
          class="form-label"
          for="import-prefix"
        >Passwort-Prefix</label>
        <input
          id="import-prefix"
          v-model="importPrefix"
          type="text"
          class="form-control"
          placeholder="z. B. Schule"
        >
        <p
          v-if="prefixFehlertext"
          class="text-danger"
        >
          {{ prefixFehlertext }}
        </p>
        <p class="notice">
          Beispiel: <span class="mono">{{ passwortBeispiel }}</span>
        </p>
      </div>

      <div class="mb-3">
        <span class="form-label">Reihenfolge</span>
        <div class="order-switch">
          <button
            v-for="option in ORDER_OPTIONS"
            :key="option.wert"
            type="button"
            class="btn btn-outline-secondary"
            :class="{ active: importOrder === option.wert }"
            :title="option.label"
            @click="importOrder = option.wert"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="mb-3">
        <span class="form-label">Zielgruppen (optional)</span>
        <p
          v-if="gruppenLadezustand === 'fehler'"
          class="text-danger"
        >
          {{ gruppenFehler }}
        </p>
        <p
          v-else-if="gruppenLadezustand === 'laedt'"
          class="notice"
        >
          Gruppen werden geladen…
        </p>
        <div
          v-else
          class="gruppen-liste"
        >
          <label
            v-for="gruppe in serverGruppen"
            :key="gruppe"
            class="form-check gruppen-eintrag"
          >
            <input
              type="checkbox"
              class="form-check-input"
              :checked="istGruppeAusgewaehlt(gruppe)"
              @change="onGruppeToggle(gruppe)"
            >
            <span class="form-check-label">{{ gruppe }}</span>
          </label>
          <p
            v-if="serverGruppen.length === 0"
            class="notice"
          >
            Keine Gruppen vorhanden.
          </p>
        </div>
        <button
          type="button"
          class="btn btn-outline-secondary"
          title="Gruppe neu anlegen"
          @click="onGruppeAnlegen"
        >
          <i
            class="bi bi-people"
            aria-hidden="true"
          />
          Gruppe neu anlegen
        </button>
      </div>

      <div class="mb-3">
        <label
          class="form-label"
          for="import-quota"
        >Kontingent (optional)</label>
        <select
          id="import-quota"
          v-model="importQuota"
          class="form-select"
        >
          <option :value="null">
            Kein Kontingent
          </option>
          <option
            v-for="preset in QUOTA_PRESETS"
            :key="preset.id"
            :value="preset.id"
          >
            {{ preset.label }}
          </option>
        </select>
      </div>
    </div>
  </div>

  <div
    v-if="importRows.length > 0"
    class="content-card"
  >
    <div class="content-card-header">
      <span>3. Vorschau</span>
      <span
        v-if="importSummary"
        class="zusammenfassung"
      >
        {{ importSummary.neu }} neu · {{ importSummary.kollisionAufgeloest }} Kollision aufgelöst ·
        {{ importSummary.fehler }} Fehler
      </span>
    </div>
    <div class="content-card-body">
      <StateBlock
        v-if="!userlisteBereit"
        :zustand="usersLadezustand"
        :fehlermeldung="usersFehler ?? ''"
        @retry="ladeUserliste"
      />
      <p
        v-else-if="!prefixValidierung.ok"
        class="notice"
      >
        Bitte Passwort-Prefix eingeben.
      </p>
      <div
        v-else
        class="table-usermanager-wrap"
      >
        <table class="table-usermanager">
          <thead>
            <tr>
              <th>Zeile</th>
              <th>Vorname</th>
              <th>Nachname</th>
              <th>Geburtsdatum</th>
              <th>Username</th>
              <th>Status</th>
              <th>Begründung</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="zeile in importPlanRows"
              :key="zeile.zeile"
            >
              <td>{{ zeile.zeile }}</td>
              <td>{{ zeile.vorname }}</td>
              <td>{{ zeile.nachname }}</td>
              <td>{{ zeile.ddmmyyyy ?? '—' }}</td>
              <td>
                {{ zeile.username ?? '—' }}
                <i
                  v-if="zeile.gekuerzt"
                  class="bi bi-scissors gekuerzt-icon"
                  title="Nachname wurde gekürzt"
                  aria-label="Nachname wurde gekürzt"
                />
              </td>
              <td>
                <span :class="STATUS_BADGE[zeile.status]">
                  {{ STATUS_LABEL[zeile.status] }}
                </span>
              </td>
              <td>{{ fehlertext(zeile) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div
    v-if="importRows.length > 0"
    class="content-card"
  >
    <div class="content-card-body">
      <button
        type="button"
        class="btn btn-primary"
        title="Benutzer anlegen"
        :disabled="anlegenDisabled"
        @click="onAnlegen"
      >
        <i
          class="bi bi-check-lg"
          aria-hidden="true"
        />
        {{ anzahlAnzulegenWert }} Benutzer anlegen
      </button>
    </div>
  </div>

  <JobProgress :import-plan-rows="importPlanRows" />
</template>

<style scoped>
.notice {
  color: var(--text-secondary);
  margin: 8px 0 0;
}

.order-switch {
  display: flex;
  gap: 8px;
}

.order-switch .btn.active {
  background: rgba(88, 166, 255, 0.15);
  color: var(--accent);
  border-color: var(--accent);
}

.gruppen-liste {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
}

.gruppen-eintrag {
  display: flex;
  align-items: center;
  gap: 6px;
}

.zusammenfassung {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.gekuerzt-icon {
  color: var(--warning);
  margin-left: 4px;
}
</style>
