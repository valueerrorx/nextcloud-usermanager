<script setup>
// Loading / Empty / Error für Tabelle, Gruppen, Dashboard (ARCHITECTURE §2/§10). Zeigt bei
// 'bereit' nichts Eigenes - der Slot übernimmt dann die eigentliche Ansicht.
defineProps({
  zustand: { type: String, required: true }, // 'laedt' | 'leer' | 'fehler' | 'bereit'
  fehlermeldung: { type: String, default: '' },
});
defineEmits(['retry']);
</script>

<template>
  <div
    v-if="zustand === 'laedt'"
    class="empty-state"
  >
    <i
      class="bi bi-arrow-clockwise spin"
      aria-hidden="true"
    />
    Lädt…
  </div>
  <div
    v-else-if="zustand === 'leer'"
    class="empty-state"
  >
    <i
      class="bi bi-inbox"
      aria-hidden="true"
    />
    Keine Einträge
  </div>
  <div
    v-else-if="zustand === 'fehler'"
    class="empty-state state-error"
  >
    <i
      class="bi bi-exclamation-triangle"
      aria-hidden="true"
    />
    <p>{{ fehlermeldung }}</p>
    <button
      type="button"
      class="btn btn-outline-danger"
      @click="$emit('retry')"
    >
      <i
        class="bi bi-arrow-clockwise"
        aria-hidden="true"
      />
      Erneut versuchen
    </button>
  </div>
  <slot v-else />
</template>

<style scoped>
.state-error i {
  color: var(--danger);
}

.state-error button {
  margin-top: 12px;
}
</style>
