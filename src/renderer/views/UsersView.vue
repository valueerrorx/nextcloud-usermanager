<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { MESSAGES } from '../../shared/messages.js';
import {
  users, usersFehler, usersFetchedAt, usersLadezustand, usersMode, usersUebersprungen,
} from '../state.js';
import StateBlock from '../components/StateBlock.vue';
import UserTable from '../components/UserTable.vue';

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
  <h1>Benutzer</h1>

  <div class="toolbar">
    <button
      type="button"
      :disabled="usersLadezustand === 'laedt'"
      @click="load"
    >
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

  <StateBlock
    :zustand="usersLadezustand"
    :fehlermeldung="usersFehler ?? ''"
    @retry="load"
  >
    <UserTable :users="users" />
  </StateBlock>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.toolbar button {
  background: var(--accent);
  border: none;
  color: var(--fg);
  padding: 8px 14px;
  border-radius: 4px;
  cursor: pointer;
}

.toolbar button:disabled {
  opacity: 0.6;
  cursor: default;
}

.timestamp {
  color: var(--fg-muted);
  font-size: 0.9em;
}

.notice {
  color: var(--fg-muted);
  margin: 0 0 12px;
}
</style>
