<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import { MESSAGES } from '../../shared/messages.js';
import { certException, connectError, connection, resetOnConnect } from '../state.js';

const form = reactive({ baseUrl: '', adminUser: '', appPassword: '', remember: false });
const errorMessage = ref('');
const noKeyringNotice = ref(false);
const busy = ref(false);

async function refreshStatus() {
  const status = await window.api.connectionStatus();
  Object.assign(connection, status);
  certException.value = status.certException;
  if (status.hasSaved) {
    if (!form.baseUrl) form.baseUrl = status.savedBaseUrl ?? '';
    if (!form.adminUser) form.adminUser = status.savedAdminUser ?? '';
  }
}

onMounted(() => {
  refreshStatus().catch((error) => {
    errorMessage.value = MESSAGES.unerwarteter_serverfehler;
    console.error('Failed to load connection status:', error);
  });
});

// Set by App.vue's certificate-prompt handler on decline/expiry - surfaced here so the rejection
// is never silently dropped (REVIEW-NOTES [S04]).
watch(connectError, (message) => {
  if (!message) return;
  errorMessage.value = message;
  connectError.value = null;
});

// Shared by connect() and connectWithSaved() - same result shape { ok, status } | { ok: false, messageId, message }.
async function applyResult(result) {
  if (result.ok) {
    errorMessage.value = '';
    // Könnte eine andere Instanz sein (REVIEW-NOTES [S13] CRITICAL) - Benutzerliste, Gruppen,
    // Job-Historie, Importvorschau und Auswahl der vorherigen Verbindung dürfen nicht stehen bleiben.
    resetOnConnect();
    Object.assign(connection, result.status);
    certException.value = result.status.certException;
    if (result.messageId === 'kein_keyring_nur_sitzung') {
      noKeyringNotice.value = true;
      await Swal.fire({ icon: 'warning', title: 'Kein Systemschlüsselbund', text: result.message });
    }
    await refreshStatus(); // picks up hasSaved/savedBaseUrl/savedAdminUser after a remember:true connect
    return;
  }
  errorMessage.value = result.message;
  if (result.messageId === 'gespeichertes_passwort_abgelehnt') {
    form.appPassword = '';
  }
}

async function connect() {
  busy.value = true;
  try {
    const result = await window.api.connect({
      baseUrl: form.baseUrl,
      adminUser: form.adminUser,
      appPassword: form.appPassword,
      remember: form.remember,
    });
    await applyResult(result);
  } catch (error) {
    errorMessage.value = MESSAGES.unerwarteter_serverfehler;
    console.error('connect() failed:', error);
  } finally {
    busy.value = false;
  }
}

async function connectWithSaved() {
  busy.value = true;
  try {
    const result = await window.api.connectSaved();
    await applyResult(result);
  } catch (error) {
    errorMessage.value = MESSAGES.unerwarteter_serverfehler;
    console.error('connectSaved() failed:', error);
  } finally {
    busy.value = false;
  }
}

async function forgetSaved() {
  busy.value = true;
  try {
    const result = await window.api.forgetSaved();
    if (!result.ok) {
      errorMessage.value = result.message ?? MESSAGES.zugang_loeschen_fehlgeschlagen;
      return;
    }
    form.adminUser = '';
    form.baseUrl = '';
    await refreshStatus();
  } catch (error) {
    console.error('forgetSaved() failed:', error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="page-header">
    <h1 class="page-title">
      <i
        class="bi bi-plug"
        aria-hidden="true"
      />
      Verbindung
    </h1>
    <p class="page-subtitle">
      <span
        class="conn-dot"
        :class="connection.connected ? 'connected' : 'disconnected'"
      />
      {{ connection.connected ? 'Verbunden' : 'Nicht verbunden' }}
    </p>
  </div>

  <div class="content-card">
    <div class="content-card-body">
      <form
        class="connect-form"
        @submit.prevent="connect"
      >
        <div class="mb-3">
          <label
            class="form-label"
            for="connect-base-url"
          >Server-URL</label>
          <input
            id="connect-base-url"
            v-model="form.baseUrl"
            type="text"
            class="form-control"
            placeholder="https://cloud.beispiel.de"
            :disabled="busy"
          >
        </div>
        <div class="mb-3">
          <label
            class="form-label"
            for="connect-admin-user"
          >Admin-Benutzer</label>
          <input
            id="connect-admin-user"
            v-model="form.adminUser"
            type="text"
            class="form-control"
            :disabled="busy"
          >
        </div>
        <div class="mb-3">
          <label
            class="form-label"
            for="connect-app-password"
          >App-Passwort</label>
          <input
            id="connect-app-password"
            v-model="form.appPassword"
            type="password"
            class="form-control"
            :disabled="busy"
          >
        </div>
        <div class="mb-3 form-check">
          <input
            id="connect-remember"
            v-model="form.remember"
            type="checkbox"
            class="form-check-input"
            :disabled="busy"
          >
          <label
            class="form-check-label"
            for="connect-remember"
          >
            Zugang speichern
          </label>
        </div>

        <p
          v-if="errorMessage"
          class="text-danger"
        >
          <i
            class="bi bi-exclamation-triangle"
            aria-hidden="true"
          />
          {{ errorMessage }}
        </p>
        <p
          v-if="noKeyringNotice"
          class="text-secondary"
        >
          <i
            class="bi bi-info-circle"
            aria-hidden="true"
          />
          Zugang gilt nur für diese Sitzung
        </p>

        <div class="actions">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="busy"
          >
            <i
              class="bi bi-plug"
              aria-hidden="true"
            />
            Verbinden
          </button>
          <button
            v-if="connection.hasSaved"
            type="button"
            class="btn btn-outline-secondary"
            :disabled="busy"
            @click="connectWithSaved"
          >
            Mit gespeichertem Zugang verbinden
          </button>
          <button
            v-if="connection.hasSaved"
            type="button"
            class="btn btn-outline-danger"
            title="Gespeicherten Zugang löschen"
            :disabled="busy"
            @click="forgetSaved"
          >
            <i
              class="bi bi-trash"
              aria-hidden="true"
            />
            Zugang löschen
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.connect-form {
  display: flex;
  flex-direction: column;
  max-width: 420px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
