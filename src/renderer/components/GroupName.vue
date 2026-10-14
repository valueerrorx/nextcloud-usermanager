<script setup>
defineProps({
  name: { type: String, required: true },
  id: { type: String, required: true },
});
</script>

<template>
  <span class="group-name">
    <span class="group-name-current">{{ name }}</span>
    <span class="group-name-id">{{ id }}</span>
  </span>
</template>
