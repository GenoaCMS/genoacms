<script setup lang="ts">
import type { VNode } from 'vue'
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ stats: VNode[] }>()
</script>

<template>
  <section :class="ui.stats">
    <div :class="ui.statsInner">
      <component :is="child" v-for="(child, i) in stats" :key="i" />
    </div>
  </section>
</template>
