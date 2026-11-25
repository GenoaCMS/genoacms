<script setup lang="ts">
import type { VNode } from 'vue'
import { columnsOf } from '@genoacms/demo-support/site'

defineProps<{ columns: number, items: VNode[] }>()
</script>

<template>
  <div class="site-grid" :style="{ '--site-columns': columnsOf(columns) }">
    <component :is="child" v-for="(child, i) in items" :key="i" />
  </div>
</template>
