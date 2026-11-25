<script setup lang="ts">
import type { VNode } from 'vue'
import { ui } from '@genoacms/demo-support/ui'

/** The page root: a slot and nothing else. An ordinary Vue component that knows no GenoaCMS. */
defineProps<{ body: VNode[] }>()
</script>

<template>
  <main :class="ui.demoPage"><component :is="child" v-for="(child, i) in body" :key="i" /></main>
</template>
