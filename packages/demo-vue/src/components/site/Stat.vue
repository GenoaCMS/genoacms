<script setup lang="ts">
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ value: string, label: string }>()
</script>

<template>
  <div :class="ui.stat">
    <span :class="ui.statValue">{{ value }}</span>
    <span :class="ui.statLabel">{{ label }}</span>
  </div>
</template>
