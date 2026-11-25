<script setup lang="ts">
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ text: string }>()
</script>

<template>
  <div :class="ui.marquee" role="img" :aria-label="text">
    <div :class="ui.marqueeTrack" aria-hidden="true">
      <span v-for="i in 8" :key="i" :class="ui.marqueeItem">{{ text }}</span>
    </div>
  </div>
</template>
