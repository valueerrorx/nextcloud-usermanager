<script setup>
// Reine Darstellung: Spaltensortierung und Auswahl sind nur Events nach außen, keine eigene
// Filter- oder Sortierlogik (ARCHITECTURE §4.1 - die liegt in shared/filters.js und wird vom
// Elternteil UsersView.vue aufgerufen).
import { alleAusgewaehlt } from '../../shared/filters.js';
import { formatTimestamp } from '../../shared/time.js';
import { gruppenAnzeigename } from '../../shared/groups.js';
import { rowActions, userInitials } from '../../shared/userRows.js';
import QuotaCell from './QuotaCell.vue';

const props = defineProps({
  users: { type: Array, required: true }, // aktuelle Seite, bereits gefiltert und sortiert
  auswahlListe: { type: Array, required: true }, // ganzes Filterergebnis für die Kopf-Checkbox
  sortFeld: { type: String, required: true },
  sortRichtung: { type: String, required: true },
  auswahl: { type: Set, required: true },
  adminUserId: { type: String, default: null },
  gesperrt: { type: Boolean, default: false },
  gruppen: { type: Array, default: () => [] },
});
defineEmits(['sort', 'toggle', 'toggle-alle', 'row-action']);

// Einziger Ort für das Pfeil-Symbol der aktiven Sortierspalte, statt dreifach kopierter Ternary.
function sortPfeil(feld) {
  if (props.sortFeld !== feld) return '';
  return props.sortRichtung === 'absteigend' ? 'bi-caret-down-fill' : 'bi-caret-up-fill';
}
</script>

<template>
  <div class="table-usermanager-wrap">
    <table class="table-usermanager">
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              class="form-check-input"
              title="Alle Treffer auswählen"
              aria-label="Alle Treffer auswählen"
              :checked="alleAusgewaehlt(auswahl, auswahlListe)"
              @change="$emit('toggle-alle')"
            >
          </th>
          <th
            class="sortable"
            :class="{ active: sortFeld === 'userid' }"
            @click="$emit('sort', 'userid')"
          >
            Benutzername
            <i
              v-if="sortPfeil('userid')"
              class="bi"
              :class="sortPfeil('userid')"
              aria-hidden="true"
            />
          </th>
          <th
            class="sortable"
            :class="{ active: sortFeld === 'displayname' }"
            @click="$emit('sort', 'displayname')"
          >
            Anzeigename
            <i
              v-if="sortPfeil('displayname')"
              class="bi"
              :class="sortPfeil('displayname')"
              aria-hidden="true"
            />
          </th>
          <th>E-Mail</th>
          <th>Status</th>
          <th
            class="sortable"
            :class="{ active: sortFeld === 'lastSeen' }"
            @click="$emit('sort', 'lastSeen')"
          >
            Zuletzt gesehen
            <i
              v-if="sortPfeil('lastSeen')"
              class="bi"
              :class="sortPfeil('lastSeen')"
              aria-hidden="true"
            />
          </th>
          <th>Gruppen</th>
          <th
            class="sortable"
            :class="{ active: sortFeld === 'quota' }"
            @click="$emit('sort', 'quota')"
          >
            Kontingent
            <i
              v-if="sortPfeil('quota')"
              class="bi"
              :class="sortPfeil('quota')"
              aria-hidden="true"
            />
          </th>
          <th>Aktionen</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="user in users"
          :key="user.userid"
        >
          <td>
            <input
              type="checkbox"
              class="form-check-input"
              :title="`${user.userid} auswählen`"
              :aria-label="`${user.userid} auswählen`"
              :checked="auswahl.has(user.userid)"
              @change="$emit('toggle', user.userid)"
            >
          </td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <span
                class="user-avatar"
                aria-hidden="true"
              >{{ userInitials(user) }}</span>
              {{ user.userid }}
            </div>
          </td>
          <td>{{ user.displayname }}</td>
          <td>
            <span
              class="email-text"
              :title="user.email || undefined"
            >{{ user.email ?? '—' }}</span>
          </td>
          <td>
            <span :class="user.enabled ? 'badge-active' : 'badge-inactive'">
              {{ user.enabled ? 'aktiv' : 'deaktiviert' }}
            </span>
          </td>
          <td>{{ user.lastSeenMs ? formatTimestamp(user.lastSeenMs, { sekunden: false }) : '—' }}</td>
          <td>
            <span
              v-for="gruppe in user.groups"
              :key="gruppe"
              class="chip-group"
            >{{ gruppenAnzeigename(gruppen, gruppe) }}</span>
          </td>
          <td><QuotaCell :quota="user.quota" /></td>
          <td>
            <div class="d-flex gap-1 flex-nowrap">
              <button
                v-for="aktion in rowActions(user, { adminUserId, gesperrt })"
                :key="aktion.action"
                type="button"
                class="btn-action"
                :class="{ danger: aktion.danger }"
                :title="aktion.title"
                :aria-label="`${aktion.label}: ${user.userid}`"
                :disabled="aktion.disabled"
                @click="$emit('row-action', { userid: user.userid, action: aktion.action })"
              >
                <i
                  class="bi"
                  :class="aktion.icon"
                  aria-hidden="true"
                />
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.sortable {
  cursor: pointer;
  user-select: none;
}

.email-text {
  display: inline-block;
  max-width: 25ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
</style>
