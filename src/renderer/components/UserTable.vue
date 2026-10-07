<script setup>
// Reine Leseansicht (ARCHITECTURE §2). Noch keine Auswahl, keine Sortierung, kein Filter - das
// ist S06.
import QuotaCell from './QuotaCell.vue';

defineProps({
  users: { type: Array, required: true },
});
</script>

<template>
  <table class="user-table">
    <thead>
      <tr>
        <th>Benutzername</th>
        <th>Anzeigename</th>
        <th>E-Mail</th>
        <th>Status</th>
        <th>Gruppen</th>
        <th>Kontingent</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="user in users"
        :key="user.userid"
      >
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
</style>
