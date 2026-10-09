<script setup>
import { reactive, ref, watch } from 'vue';
import { connectWith } from '../connectFlow.js';
import { initialConnectForm } from '../../shared/connectionUi.js';
import { connectError, connecting, connection } from '../state.js';

const form = reactive(initialConnectForm(connection));
const errorMessage = ref('');

// Messages from auto-connect or a declined certificate arrive via connectError.
watch(connectError, (message) => {
  if (!message) return;
  errorMessage.value = message;
  connectError.value = null;
}, { immediate: true });

async function submit() {
  if (connecting.value) return;
  errorMessage.value = '';
  const outcome = await connectWith(form);
  if (!outcome.ok) {
    errorMessage.value = outcome.message;
    form.appPassword = '';
  }
}
</script>

<template>
  <div class="connect-overlay">
    <form
      class="connect-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-title"
      @submit.prevent="submit"
    >
      <h2
        id="connect-title"
        class="connect-title"
      >
        <i
          class="bi bi-plug"
          aria-hidden="true"
        />
        Mit Nextcloud verbinden
      </h2>
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
          :disabled="connecting"
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
          autocomplete="username"
          :disabled="connecting"
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
          autocomplete="current-password"
          :disabled="connecting"
        >
      </div>
      <div class="mb-3 form-check">
        <input
          id="connect-remember"
          v-model="form.remember"
          type="checkbox"
          class="form-check-input"
          :disabled="connecting"
        >
        <label
          class="form-check-label"
          for="connect-remember"
        >Zugang speichern</label>
      </div>
      <p
        v-if="errorMessage"
        class="text-danger"
        role="alert"
      >
        <i
          class="bi bi-exclamation-triangle"
          aria-hidden="true"
        />
        {{ errorMessage }}
      </p>
      <button
        type="submit"
        class="btn btn-primary w-100"
        :disabled="connecting"
      >
        <span
          v-if="connecting"
          class="spinner-border spinner-border-sm"
          aria-hidden="true"
        />
        <i
          v-else
          class="bi bi-plug"
          aria-hidden="true"
        />
        Verbinden
      </button>
    </form>
  </div>
</template>
