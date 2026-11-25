<script setup lang="ts">
defineProps<{ value: string, label: string }>()
</script>

<template>
  <div class="site-stat">
    <span class="site-stat__value">{{ value }}</span>
    <span class="site-stat__label">{{ label }}</span>
  </div>
</template>
