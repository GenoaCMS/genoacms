<script setup lang="ts">
import type { VNode } from 'vue'
import { columnsOf } from '@genoacms/demo-support/site'
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ columns: number, items: VNode[] }>()
</script>

<template>
  <div :class="ui.grid" :style="{ '--grid-columns': columnsOf(columns) }">
    <component :is="child" v-for="(child, i) in items" :key="i" />
  </div>
</template>
