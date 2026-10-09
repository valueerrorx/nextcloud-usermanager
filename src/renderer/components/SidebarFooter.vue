<script setup>
import { computed } from 'vue';
import { hostLabel, lastLoadLabel, statusDot } from '../../shared/connectionUi.js';
import { logout } from '../connectFlow.js';
import { logoutState } from '../../shared/userRows.js';
import { connecting, connection, jobLaeuft, usersFetchedAt } from '../state.js';

defineProps({ version: { type: String, default: '' } });
const emit = defineEmits(['about']);

const dot = computed(() => statusDot({ connected: connection.connected, connecting: connecting.value }));
const host = computed(() => hostLabel(connection.connected ? connection.baseUrl : null));
const logoutZustand = computed(() => logoutState(jobLaeuft.value));
const last = computed(() => lastLoadLabel(usersFetchedAt.value));
</script>

<template>
  <div class="sidebar-footer">
    <div class="sidebar-conn">
      <span
        class="conn-dot"
        :class="dot"
      />
      <span class="sidebar-host">{{ host }}</span>
    </div>
    <div
      v-if="last"
      class="sidebar-last"
    >
      {{ last }}
    </div>
    <button
      v-if="connection.connected"
      type="button"
      class="sidebar-logout-btn"
      :disabled="logoutZustand.disabled"
      :title="logoutZustand.title"
      :aria-label="logoutZustand.title"
      @click="logout"
    >
      <i
        class="bi bi-box-arrow-left"
        aria-hidden="true"
      />
      Abmelden
    </button>
    <button
      type="button"
      class="sidebar-version-btn"
      title="Über diese Anwendung"
      @click="emit('about')"
    >
      v{{ version }}
    </button>
  </div>
</template>
