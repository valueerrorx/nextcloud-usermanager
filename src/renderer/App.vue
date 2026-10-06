<script setup>
import { computed, onMounted, ref } from 'vue';
import { activeView } from './state.js';
import ConnectView from './views/ConnectView.vue';
import DashboardView from './views/DashboardView.vue';
import UsersView from './views/UsersView.vue';
import GroupsView from './views/GroupsView.vue';
import ImportView from './views/ImportView.vue';

const views = {
  connect: { label: 'Verbindung', component: ConnectView },
  dashboard: { label: 'Dashboard', component: DashboardView },
  users: { label: 'Benutzer', component: UsersView },
  groups: { label: 'Gruppen', component: GroupsView },
  import: { label: 'Import', component: ImportView },
};

const currentComponent = computed(() => views[activeView.value].component);

const version = ref('');

onMounted(async () => {
  try {
    const result = await window.api.appVersion();
    if (result.ok) {
      version.value = result.version;
    }
  } catch (error) {
    console.error('Failed to load app version:', error);
  }
});
</script>

<template>
  <div class="shell">
    <nav class="sidebar">
      <button
        v-for="(view, key) in views"
        :key="key"
        :class="{ active: activeView === key }"
        @click="activeView = key"
      >
        {{ view.label }}
      </button>
      <div class="version">
        v{{ version }}
      </div>
    </nav>
    <main class="content">
      <component :is="currentComponent" />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100vh;
}

.sidebar {
  display: flex;
  flex-direction: column;
  width: 200px;
  background: var(--bg-elev);
  border-right: 1px solid var(--border);
  padding: 8px;
}

.sidebar button {
  background: none;
  border: none;
  color: var(--fg-muted);
  text-align: left;
  padding: 8px;
  cursor: pointer;
}

.sidebar button.active {
  color: var(--fg);
  background: var(--border);
}

.version {
  margin-top: auto;
  color: var(--fg-muted);
  font-size: 0.8em;
}

.content {
  flex: 1;
  padding: 16px;
}
</style>
