<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import { MESSAGES } from '../../shared/messages.js';
import { certException, connectError, connection } from '../state.js';

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
  <h1>Verbindung</h1>

  <form
    class="connect-form"
    @submit.prevent="connect"
  >
    <label>
      Server-URL
      <input
        v-model="form.baseUrl"
        type="text"
        placeholder="https://cloud.beispiel.de"
        :disabled="busy"
      >
    </label>
    <label>
      Admin-Benutzer
      <input
        v-model="form.adminUser"
        type="text"
        :disabled="busy"
      >
    </label>
    <label>
      App-Passwort
      <input
        v-model="form.appPassword"
        type="password"
        :disabled="busy"
      >
    </label>
    <label class="checkbox">
      <input
        v-model="form.remember"
        type="checkbox"
        :disabled="busy"
      >
      Zugang speichern
    </label>

    <p
      v-if="errorMessage"
      class="error"
    >
      {{ errorMessage }}
    </p>
    <p
      v-if="noKeyringNotice"
      class="notice"
    >
      Zugang gilt nur für diese Sitzung
    </p>

    <div class="actions">
      <button
        type="submit"
        :disabled="busy"
      >
        Verbinden
      </button>
      <button
        v-if="connection.hasSaved"
        type="button"
        :disabled="busy"
        @click="connectWithSaved"
      >
        Mit gespeichertem Zugang verbinden
      </button>
      <button
        v-if="connection.hasSaved"
        type="button"
        :disabled="busy"
        @click="forgetSaved"
      >
        Zugang löschen
      </button>
    </div>
  </form>
</template>

<style scoped>
.connect-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--fg-muted);
}

label.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

input[type='text'],
input[type='password'] {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 6px 8px;
  border-radius: 4px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  background: var(--accent);
  border: none;
  color: var(--fg);
  padding: 8px 14px;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: default;
}

.error {
  color: #ff6b6b;
  margin: 0;
}

.notice {
  color: var(--fg-muted);
  margin: 0;
}
</style>
