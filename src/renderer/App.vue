<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Swal from 'sweetalert2';
import { MESSAGES } from '../shared/messages.js';
import { activeView, certException, connectError, connection } from './state.js';
import ConnectView from './views/ConnectView.vue';
import DashboardView from './views/DashboardView.vue';
import UsersView from './views/UsersView.vue';
import GroupsView from './views/GroupsView.vue';
import ImportView from './views/ImportView.vue';

// 'connect' stays reachable always; the other four need a successful connection (ARCHITECTURE §7
// "Startverhalten" - Dashboard/Benutzer/Gruppen/Import sind erst nach erfolgreichem Verbinden
// erreichbar).
const views = {
  connect: { label: 'Verbindung', component: ConnectView, gated: false },
  dashboard: { label: 'Dashboard', component: DashboardView, gated: true },
  users: { label: 'Benutzer', component: UsersView, gated: true },
  groups: { label: 'Gruppen', component: GroupsView, gated: true },
  import: { label: 'Import', component: ImportView, gated: true },
};

const currentComponent = computed(() => views[activeView.value].component);

function selectView(key) {
  if (views[key].gated && !connection.connected) return;
  activeView.value = key;
}

const version = ref('');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

// swal2 dialog for tls.onCertificatePrompt (ARCHITECTURE §8) - fingerprint rendered in a readonly,
// selectable input so the admin can copy it to compare against the server.
async function handleCertificatePrompt({ requestId, host, fingerprint, subject, issuer, validTo }) {
  // validTo can be missing/non-numeric for a malformed certificate - guard against rendering
  // "Invalid Date" in the dialog.
  const validToText = typeof validTo === 'number' ? new Date(validTo * 1000).toLocaleString('de-DE') : 'unbekannt';
  const result = await Swal.fire({
    title: 'Unbekanntes Serverzertifikat',
    html: `
      <p><strong>Host:</strong> ${escapeHtml(host)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <p><strong>Issuer:</strong> ${escapeHtml(issuer)}</p>
      <p><strong>Gültig bis:</strong> ${escapeHtml(validToText)}</p>
      <p><strong>SHA-256-Fingerprint:</strong></p>
      <input type="text" readonly value="${escapeHtml(fingerprint)}"
        style="width: 100%; user-select: all;" />
    `,
    showCancelButton: true,
    allowOutsideClick: false,
    confirmButtonText: 'Ausnahme akzeptieren',
    cancelButtonText: 'Ablehnen',
  });

  const akzeptiert = result.isConfirmed;
  const response = await window.api.respondCertificate({ requestId, akzeptiert });
  if (akzeptiert) {
    certException.value = { host, fingerprint };
    return;
  }
  // The decline is otherwise dead: route it into ConnectView's error path so the user sees it,
  // instead of relying on the pending connect() call to resolve first (REVIEW-NOTES [S04]).
  connectError.value = response.messageId ? MESSAGES[response.messageId] : MESSAGES.zertifikat_abgelehnt;
}

let disposeCertificatePrompt = null;

onMounted(async () => {
  disposeCertificatePrompt = window.api.onCertificatePrompt((payload) => {
    handleCertificatePrompt(payload).catch((error) => {
      console.error('Failed to handle certificate prompt:', error);
    });
  });

  try {
    const result = await window.api.appVersion();
    if (result.ok) {
      version.value = result.version;
    }
  } catch (error) {
    console.error('Failed to load app version:', error);
  }
});

onUnmounted(() => {
  disposeCertificatePrompt?.();
});
</script>

<template>
  <div class="shell">
    <nav class="sidebar">
      <button
        v-for="(view, key) in views"
        :key="key"
        :class="{ active: activeView === key, disabled: view.gated && !connection.connected }"
        :disabled="view.gated && !connection.connected"
        :title="view.gated && !connection.connected ? 'Bitte zuerst verbinden' : undefined"
        @click="selectView(key)"
      >
        {{ view.label }}
      </button>
      <div class="version">
        v{{ version }}
      </div>
    </nav>
    <main class="content">
      <p
        v-if="certException"
        class="cert-banner"
      >
        Unsichere Zertifikatsausnahme aktiv für <strong>{{ certException.host }}</strong>
        (<code>{{ certException.fingerprint }}</code>)
      </p>
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

.sidebar button.disabled {
  color: var(--fg-muted);
  cursor: default;
  opacity: 0.5;
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

.cert-banner {
  background: #4a2a2a;
  color: #ffb4b4;
  border: 1px solid #7a3a3a;
  border-radius: 4px;
  padding: 8px 12px;
  margin: 0 0 16px;
}
</style>
