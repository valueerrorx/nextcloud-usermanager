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
    class="state-block"
  >
    Lädt…
  </div>
  <div
    v-else-if="zustand === 'leer'"
    class="state-block"
  >
    Keine Einträge
  </div>
  <div
    v-else-if="zustand === 'fehler'"
    class="state-block state-error"
  >
    <p>{{ fehlermeldung }}</p>
    <button
      type="button"
      @click="$emit('retry')"
    >
      Erneut versuchen
    </button>
  </div>
  <slot v-else />
</template>

<style scoped>
.state-block {
  padding: 24px;
  text-align: center;
  color: var(--fg-muted);
}

.state-error {
  color: #ff6b6b;
}

.state-error button {
  margin-top: 12px;
  background: var(--accent);
  border: none;
  color: var(--fg);
  padding: 8px 14px;
  border-radius: 4px;
  cursor: pointer;
}
</style>
