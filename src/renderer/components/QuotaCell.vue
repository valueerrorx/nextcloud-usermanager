<script setup>
// Rendert ausschliesslich QuotaInfo (shared/quota.js#parseQuota) plus formatBytes/formatPercent -
// rechnet und formatiert nichts selbst (ARCHITECTURE §2/§4.1, DECISIONS "Berechnungen gehören nie
// in Vue-Komponenten"). formatPercent liefert bereits das deutsche Komma und eine Dezimalstelle.
import { formatBytes, formatPercent } from '../../shared/quota.js';

defineProps({
  quota: { type: Object, required: true },
});
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
    class="mono"
  >
    {{ formatBytes(quota.usedBytes) }} / {{ formatBytes(quota.limitBytes) }}
    ({{ formatPercent(quota.usagePercent) }})
  </span>
</template>
