<script setup>
// Rendert ausschliesslich QuotaInfo (shared/quota.js#parseQuota) plus formatBytes/formatPercent -
// rechnet und formatiert nichts selbst (ARCHITECTURE §2/§4.1, DECISIONS "Berechnungen gehören nie
// in Vue-Komponenten"). Die Balkenbreite kommt aus quotaBalkenBreite.
import { computed } from 'vue';
import { formatBytes, formatPercent, quotaBalkenBreite } from '../../shared/quota.js';

const props = defineProps({
  quota: { type: Object, required: true },
});

const balkenBreite = computed(() => quotaBalkenBreite(props.quota.usagePercent));
</script>

<template>
  <span
    v-if="quota.kind === 'unlimited'"
    class="text-secondary"
  >unbegrenzt</span>
  <span
    v-else-if="quota.kind === 'unknown'"
    class="text-secondary"
  >unbekannt</span>
  <span
    v-else
    class="quota-zelle"
  >
    <span class="mono">{{ formatBytes(quota.usedBytes) }} / {{ formatBytes(quota.limitBytes) }}</span>
    <span
      v-if="balkenBreite !== null"
      class="quota-balken"
      role="img"
      :aria-label="`${formatPercent(quota.usagePercent)} belegt`"
    >
      <span
        class="quota-balken-fuellung"
        :style="{ width: `${balkenBreite}%` }"
      />
    </span>
  </span>
</template>

<style scoped>
.quota-zelle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.quota-balken {
  display: inline-block;
  width: 2.25rem;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  flex-shrink: 0;
}

.quota-balken-fuellung {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: #3fb950;
  opacity: 0.8;
}
</style>
