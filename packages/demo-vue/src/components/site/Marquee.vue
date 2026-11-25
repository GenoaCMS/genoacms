<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <div class="site-marquee" :aria-label="text">
    <div class="site-marquee__track" aria-hidden="true">
      <span v-for="i in 8" :key="i" class="site-marquee__item">{{ text }}</span>
    </div>
  </div>
</template>
