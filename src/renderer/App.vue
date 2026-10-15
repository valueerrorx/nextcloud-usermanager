<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Swal from 'sweetalert2';
import { MESSAGES } from '../shared/messages.js';
import { uiPhase } from '../shared/connectionUi.js';
import { startup } from './connectFlow.js';
import { activeView, certException, connectError, connection, startupGeprueft } from './state.js';
import AboutModal from './components/AboutModal.vue';
import ConnectDialog from './components/ConnectDialog.vue';
import SidebarFooter from './components/SidebarFooter.vue';
import DashboardView from './views/DashboardView.vue';
import UsersView from './views/UsersView.vue';
import GroupsView from './views/GroupsView.vue';
import ImportView from './views/ImportView.vue';

// All views need a connection; until then the connection popup sits above them. icon ist nur
// Darstellung (bi-* Klasse aus der Icon-Tabelle in S09a).
const views = {
  dashboard: { label: 'Dashboard', icon: 'bi-speedometer2', component: DashboardView, gated: true },
  users: { label: 'Benutzer', icon: 'bi-people-fill', component: UsersView, gated: true },
  groups: { label: 'Gruppen', icon: 'bi-collection-fill', component: GroupsView, gated: true },
  import: { label: 'Import', icon: 'bi-upload', component: ImportView, gated: true },
};

const currentComponent = computed(() => views[activeView.value].component);

function selectView(key) {
  if (views[key].gated && !connection.connected) return;
  activeView.value = key;
}

const version = ref('');
const showAbout = ref(false);
const phase = computed(() => uiPhase({ checked: startupGeprueft.value, connected: connection.connected }));

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
  // The decline is otherwise dead: route it into the connection popup's error path so the user sees it,
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

  startup().catch((error) => {
    console.error('Startup check failed:', error);
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
  <div class="app-layout">
    <nav class="app-sidebar">
      <div class="sidebar-brand">
        Nextcloud User Manager
      </div>
      <button
        v-for="(view, key) in views"
        :key="key"
        type="button"
        class="nav-link-custom"
        :class="{ active: activeView === key, disabled: view.gated && !connection.connected }"
        :disabled="view.gated && !connection.connected"
        :title="view.gated && !connection.connected ? 'Bitte zuerst verbinden' : view.label"
        @click="selectView(key)"
      >
        <i
          class="bi"
          :class="view.icon"
          aria-hidden="true"
        />
        <span>{{ view.label }}</span>
      </button>
      <SidebarFooter
        :version="version"
        @about="showAbout = true"
      />
    </nav>
    <main class="main-area">
      <p
        v-if="certException"
        class="cert-banner"
      >
        <i
          class="bi bi-exclamation-triangle"
          aria-hidden="true"
        />
        Unsichere Zertifikatsausnahme aktiv für <strong>{{ certException.host }}</strong>
        (<code class="mono">{{ certException.fingerprint }}</code>)
      </p>
      <p
        v-if="phase === 'pruefe'"
        class="startup-check"
      >
        <i
          class="bi bi-hourglass-split"
          aria-hidden="true"
        />
        Verbindung wird geprüft…
      </p>
      <component
        :is="currentComponent"
        v-else-if="phase === 'bereit'"
      />
    </main>
    <ConnectDialog v-if="phase === 'dialog'" />
    <AboutModal
      v-if="showAbout"
      :version="version"
      @close="showAbout = false"
    />
  </div>
</template>
