<script setup>
// Reine Darstellung: Spaltensortierung und Auswahl sind nur Events nach außen, keine eigene
// Filter- oder Sortierlogik (ARCHITECTURE §4.1 - die liegt in shared/filters.js und wird vom
// Elternteil UsersView.vue aufgerufen).
import { alleAusgewaehlt } from '../../shared/filters.js';
import QuotaCell from './QuotaCell.vue';

const props = defineProps({
  users: { type: Array, required: true }, // bereits gefiltert und sortiert
  sortFeld: { type: String, required: true },
  sortRichtung: { type: String, required: true },
  auswahl: { type: Set, required: true },
  ausgewaehlteAnzahl: { type: Number, required: true },
});
defineEmits(['sort', 'toggle', 'toggle-alle']);

// Einziger Ort für das Pfeil-Symbol der aktiven Sortierspalte, statt dreifach kopierter Ternary.
function sortPfeil(feld) {
  if (props.sortFeld !== feld) return '';
  return props.sortRichtung === 'absteigend' ? '▼' : '▲';
}
</script>

<template>
  <table class="user-table">
    <thead>
      <tr>
        <th>
          <input
            type="checkbox"
            :checked="alleAusgewaehlt(auswahl, users)"
            @change="$emit('toggle-alle')"
          >
          <span class="auswahl-anzahl">{{ ausgewaehlteAnzahl }}</span>
        </th>
        <th
          class="sortable"
          :class="{ active: sortFeld === 'userid' }"
          @click="$emit('sort', 'userid')"
        >
          Benutzername
          <span>{{ sortPfeil('userid') }}</span>
        </th>
        <th
          class="sortable"
          :class="{ active: sortFeld === 'displayname' }"
          @click="$emit('sort', 'displayname')"
        >
          Anzeigename
          <span>{{ sortPfeil('displayname') }}</span>
        </th>
        <th>E-Mail</th>
        <th>Status</th>
        <th>Gruppen</th>
        <th
          class="sortable"
          :class="{ active: sortFeld === 'quota' }"
          @click="$emit('sort', 'quota')"
        >
          Kontingent
          <span>{{ sortPfeil('quota') }}</span>
        </th>
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
            :checked="auswahl.has(user.userid)"
            @change="$emit('toggle', user.userid)"
          >
        </td>
        <td>{{ user.userid }}</td>
        <td>{{ user.displayname }}</td>
        <td>{{ user.email ?? '—' }}</td>
        <td>{{ user.enabled ? 'aktiv' : 'deaktiviert' }}</td>
        <td>{{ user.groups.join(', ') }}</td>
        <td><QuotaCell :quota="user.quota" /></td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.user-table {
  width: 100%;
  border-collapse: collapse;
}

.user-table th,
.user-table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}

.user-table th {
  color: var(--fg-muted);
  font-weight: normal;
}

.user-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.user-table th.active {
  color: var(--fg);
}

.auswahl-anzahl {
  margin-left: 6px;
  color: var(--fg-muted);
}
</style>
