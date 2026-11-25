<script setup lang="ts">
import type { VNode } from 'vue'
import { ui } from '@genoacms/demo-support/ui'

/** A titled region holding other components — what makes the tree nest. */
defineProps<{ heading: string, content: VNode[] }>()
</script>

<template>
  <section :class="ui.demoSection">
    <h2 :class="ui.demoSectionHeading">{{ heading }}</h2>
    <component :is="child" v-for="(child, i) in content" :key="i" />
  </section>
</template>
