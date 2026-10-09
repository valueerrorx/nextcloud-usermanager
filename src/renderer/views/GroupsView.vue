<script setup>
// Gruppen anlegen/löschen, Mitglieder anzeigen, User zu/ab (S12, ARCHITECTURE §3.1/§4). Mitglieder
// und memberCount kommen NIE per eigenem Request, sondern clientseitig aus der geladenen
// Userliste (shared/groups.js) - deshalb lädt diese View `state.users` selbst nach, wenn sie noch
// leer ist, genau wie ImportView das für die Importvorschau tut (S12 "Die Lehre aus S10").
import { computed, onMounted, ref } from 'vue';
import Swal from 'sweetalert2';
import { MESSAGES } from '../../shared/messages.js';
import { groupViews, membersOf, nichtMitgliederVon, istGruppeLoeschbar } from '../../shared/groups.js';
import { resolveGrund } from '../../shared/jobReport.js';
import { ladeGruppen, ladeUserliste } from '../loaders.js';
import {
  groups, groupsLadezustand, groupsFehler, ausgewaehlteGruppe,
  users, usersLadezustand, usersFehler,
} from '../state.js';
import StateBlock from '../components/StateBlock.vue';

// Nur für swal2-HTML - dasselbe Muster wie App.vue/ActionBar.vue, keine Vue-Komponente innerhalb
// von swal2 möglich.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// Wie in ImportView: eine zuvor schon (nicht-leer) geladene Liste gilt sofort als bereit, keine
// unnötige zweite Ladeanimation.
const userlisteBereit = computed(() => users.value.length > 0 || usersLadezustand.value === 'leer');

onMounted(() => {
  ladeGruppen();
  if (users.value.length === 0) {
    ladeUserliste();
  }
});

async function ladeAlles() {
  await Promise.all([ladeGruppen(), ladeUserliste()]);
}

// Einzige Stelle, die groupViews aufruft - keine Zähl- oder Filterlogik hier (ARCHITECTURE §4.1,
// REVIEW-NOTES [S06]). Solange die Userliste nicht bereit ist, blendet die StateBlock unten die
// Tabelle ohnehin aus - memberCount wird also nie mit einer leeren Liste gezeigt.
const groupViewsListe = computed(() => groupViews(users.value, groups.value));

// Kombinierter Ladezustand für die StateBlock: blockiert zusätzlich, solange die Userliste fehlt
// (reine Zustands-Verdrahtung, kein Rechnen auf den Daten selbst).
const kombinierterZustand = computed(() => {
  if (groupsLadezustand.value === 'fehler') return 'fehler';
  if (!userlisteBereit.value) return usersLadezustand.value === 'fehler' ? 'fehler' : 'laedt';
  return groupsLadezustand.value;
});
const kombinierteFehlermeldung = computed(() => groupsFehler.value ?? usersFehler.value ?? '');

function onGruppeAuswaehlen(groupId) {
  ausgewaehlteGruppe.value = ausgewaehlteGruppe.value === groupId ? null : groupId;
}

const ausgewaehlterGroupView = computed(
  () => groupViewsListe.value.find((g) => g.id === ausgewaehlteGruppe.value) ?? null,
);
const mitglieder = computed(() => (
  ausgewaehlteGruppe.value ? membersOf(users.value, ausgewaehlteGruppe.value) : []
));
const hinzufuegbareUser = computed(() => (
  ausgewaehlteGruppe.value ? nichtMitgliederVon(users.value, ausgewaehlteGruppe.value) : []
));

const userZumHinzufuegen = ref('');

// Einziger Ausführungspfad für Mitgliedschaftsänderungen (S12 spec "Kein zweiter
// Ausführungspfad"): direkt die bestehende Action-Pipeline, kein eigener OCS-Aufruf hier.
async function fuehreMitgliedschaftAus(action, userid) {
  try {
    const result = await window.api.actionsRun({
      jobId: `job-${Date.now()}`,
      action,
      items: [userid],
      params: { groupid: ausgewaehlteGruppe.value },
    });
    if (!result.ok) {
      await Swal.fire({ title: 'Fehler', text: result.message ?? MESSAGES.aktion_fehlgeschlagen, icon: 'error' });
    } else if (result.results[0]?.status === 'fehler') {
      await Swal.fire({
        title: 'Fehler',
        text: resolveGrund(result.results[0].grund) ?? MESSAGES.aktion_fehlgeschlagen,
        icon: 'error',
      });
    }
  } catch (error) {
    console.error('Gruppenmitgliedschaft ändern fehlgeschlagen:', error);
    await Swal.fire({ title: 'Fehler', text: MESSAGES.unerwarteter_serverfehler, icon: 'error' });
  } finally {
    // Mitgliedschaften stecken in den Usern (ARCHITECTURE §3.1) - beide Listen neu laden.
    await ladeAlles();
  }
}

async function onMitgliedHinzufuegen() {
  if (!userZumHinzufuegen.value) return;
  await fuehreMitgliedschaftAus('user.addToGroup', userZumHinzufuegen.value);
  userZumHinzufuegen.value = '';
}

async function onMitgliedEntfernen(userid) {
  await fuehreMitgliedschaftAus('user.removeFromGroup', userid);
}

async function onGruppeAnlegen() {
  const { value: name } = await Swal.fire({
    title: 'Gruppe anlegen',
    input: 'text',
    inputPlaceholder: 'Gruppenname',
    showCancelButton: true,
    confirmButtonText: 'Anlegen',
    cancelButtonText: 'Abbrechen',
    inputValidator: (value) => (!value || value.trim() === '' ? MESSAGES.gruppenname_leer : undefined),
  });
  if (!name || name.trim() === '') return;
  try {
    const result = await window.api.groupsCreate({ groupid: name.trim() });
    if (!result.ok) {
      // Existiert die Gruppe server-seitig schon (OCS 102), trotzdem neu laden - sonst bleibt sie
      // unselektierbar, obwohl sie längst existiert (gleiches Muster wie ImportView S10).
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

// Löschbestätigung nennt Gruppenname UND Mitgliederzahl aus derselben puren Quelle wie die
// Tabelle (groupView.memberCount), nie neu gerechnet (S12 spec "Die Lehre aus S10").
async function onGruppeLoeschen(groupView) {
  const bestaetigt = await Swal.fire({
    title: 'Gruppe löschen',
    html: `
      <p>Gruppe <strong>${escapeHtml(groupView.id)}</strong> mit
      <strong>${groupView.memberCount}</strong> Mitglied(ern) löschen?</p>
      <p>Die Mitglieder selbst werden dabei <strong>nicht</strong> gelöscht.</p>
    `,
    showCancelButton: true,
    confirmButtonText: 'Löschen',
    cancelButtonText: 'Abbrechen',
  });
  if (!bestaetigt.isConfirmed) return;
  try {
    const result = await window.api.groupsDelete({ groupid: groupView.id });
    if (!result.ok) {
      await Swal.fire({ title: 'Fehler', text: result.message ?? MESSAGES.gruppe_loeschen_fehlgeschlagen, icon: 'error' });
      return;
    }
    if (ausgewaehlteGruppe.value === groupView.id) ausgewaehlteGruppe.value = null;
  } catch (error) {
    console.error('groups.delete failed:', error);
    await Swal.fire({ title: 'Fehler', text: MESSAGES.unerwarteter_serverfehler, icon: 'error' });
  } finally {
    await ladeAlles();
  }
}
</script>

<template>
  <div class="page-header">
    <h1 class="page-title">
      <i
        class="bi bi-collection-fill"
        aria-hidden="true"
      />
      Gruppen
    </h1>
  </div>

  <div class="toolbar">
    <button
      type="button"
      class="btn btn-outline-secondary"
      title="Gruppenliste neu laden"
      :disabled="groupsLadezustand === 'laedt'"
      @click="ladeAlles"
    >
      <i
        class="bi bi-arrow-clockwise"
        :class="{ spin: groupsLadezustand === 'laedt' }"
        aria-hidden="true"
      />
      Neu laden
    </button>
    <button
      type="button"
      class="btn btn-primary"
      title="Gruppe anlegen"
      @click="onGruppeAnlegen"
    >
      <i
        class="bi bi-people"
        aria-hidden="true"
      />
      Gruppe anlegen
    </button>
  </div>

  <div class="content-card">
    <div class="content-card-header">
      <span>Gruppen</span>
    </div>
    <div class="content-card-body">
      <StateBlock
        :zustand="kombinierterZustand"
        :fehlermeldung="kombinierteFehlermeldung"
        @retry="ladeAlles"
      >
        <div class="table-usermanager-wrap">
          <table class="table-usermanager">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mitglieder</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="groupView in groupViewsListe"
                :key="groupView.id"
                :class="{ active: ausgewaehlteGruppe === groupView.id }"
              >
                <td>{{ groupView.id }}</td>
                <td>{{ groupView.memberCount }}</td>
                <td>
                  <span
                    v-if="groupView.istAdmin"
                    class="badge-warning"
                  >
                    geschützt
                  </span>
                </td>
                <td class="aktionen">
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    title="Mitglieder anzeigen"
                    aria-label="Mitglieder anzeigen"
                    @click="onGruppeAuswaehlen(groupView.id)"
                  >
                    <i
                      class="bi bi-people"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-danger btn-sm"
                    :disabled="!istGruppeLoeschbar(groupView.id)"
                    :title="istGruppeLoeschbar(groupView.id) ? 'Gruppe löschen' : 'Die admin-Gruppe kann nicht gelöscht werden'"
                    :aria-label="istGruppeLoeschbar(groupView.id) ? 'Gruppe löschen' : 'Die admin-Gruppe kann nicht gelöscht werden'"
                    @click="onGruppeLoeschen(groupView)"
                  >
                    <i
                      class="bi bi-trash"
                      aria-hidden="true"
                    />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </StateBlock>
    </div>
  </div>

  <div
    v-if="ausgewaehlterGroupView"
    class="content-card"
  >
    <div class="content-card-header">
      <span>Mitglieder von {{ ausgewaehlterGroupView.id }} ({{ ausgewaehlterGroupView.memberCount }})</span>
    </div>
    <div class="content-card-body">
      <div class="mitglied-hinzufuegen">
        <label
          class="form-label"
          for="gruppe-mitglied-hinzufuegen"
        >User hinzufügen</label>
        <select
          id="gruppe-mitglied-hinzufuegen"
          v-model="userZumHinzufuegen"
          class="form-select"
        >
          <option value="">
            Benutzer wählen
          </option>
          <option
            v-for="user in hinzufuegbareUser"
            :key="user.userid"
            :value="user.userid"
          >
            {{ user.displayname }} ({{ user.userid }})
          </option>
        </select>
        <button
          type="button"
          class="btn btn-outline-secondary"
          title="Zur Gruppe hinzufügen"
          :disabled="!userZumHinzufuegen"
          @click="onMitgliedHinzufuegen"
        >
          <i
            class="bi bi-person-check"
            aria-hidden="true"
          />
          Hinzufügen
        </button>
      </div>

      <p
        v-if="mitglieder.length === 0"
        class="notice"
      >
        Keine Einträge
      </p>
      <div
        v-else
        class="table-usermanager-wrap"
      >
        <table class="table-usermanager">
          <thead>
            <tr>
              <th>Benutzername</th>
              <th>Anzeigename</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in mitglieder"
              :key="user.userid"
            >
              <td>{{ user.userid }}</td>
              <td>{{ user.displayname }}</td>
              <td>
                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm"
                  title="Aus Gruppe entfernen"
                  :aria-label="`${user.userid} aus Gruppe entfernen`"
                  @click="onMitgliedEntfernen(user.userid)"
                >
                  <i
                    class="bi bi-person-dash"
                    aria-hidden="true"
                  />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
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
  margin: 0;
}

.aktionen {
  display: flex;
  gap: 6px;
}

tr.active td {
  background: rgba(88, 166, 255, 0.06);
}

.mitglied-hinzufuegen {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.mitglied-hinzufuegen .form-select {
  width: auto;
  flex: 1;
  min-width: 220px;
}
</style>
