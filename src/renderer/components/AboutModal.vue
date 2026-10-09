<script setup>
import { ABOUT_URL } from '../../shared/externalUrl.js';
import { MESSAGES } from '../../shared/messages.js';
import { toastError } from '../toast.js';

defineProps({ version: { type: String, default: '' } });
const emit = defineEmits(['close']);

async function openLink() {
  try {
    const result = await window.api.openExternal({ url: ABOUT_URL });
    if (!result.ok) toastError(result.message);
  } catch (error) {
    console.error('openExternal() failed:', error);
    toastError(MESSAGES.link_nicht_erlaubt);
  }
}
</script>

<template>
  <div
    class="modal d-block about-modal-backdrop"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label="Über diese Anwendung"
    @click.self="emit('close')"
  >
    <div class="modal-dialog modal-sm modal-dialog-centered">
      <div class="modal-content about-modal-content">
        <div class="modal-body text-center py-4">
          <div
            class="about-copyleft"
            aria-hidden="true"
          >
            &copy;
          </div>
          <div class="about-year">
            2026
          </div>
          <div class="about-name">
            Nextcloud User Manager
          </div>
          <div class="about-version">
            Version {{ version }}
          </div>
          <div class="about-author">
            Thomas Michael Weissel
          </div>
          <button
            type="button"
            class="btn btn-link btn-sm"
            @click="openLink"
          >
            {{ ABOUT_URL }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
