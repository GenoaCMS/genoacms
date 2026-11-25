<script setup lang="ts">
defineProps<{ time: string, title: string, speaker: string, track: string }>()
</script>

<template>
  <div class="site-agenda">
    <span class="site-agenda__time">{{ time }}</span>
    <div>
      <p class="site-agenda__title">{{ title }}</p>
      <p v-if="speaker !== ''" class="site-agenda__speaker">{{ speaker }}</p>
    </div>
    <span v-if="track !== ''" class="site-agenda__track">{{ track }}</span>
    <span v-else />
  </div>
</template>
