<script setup lang="ts">
import type { VNode } from 'vue'

/** A titled region holding other components — what makes the tree nest. */
defineProps<{ heading: string, content: VNode[] }>()
</script>

<template>
  <section class="section">
    <h2 class="section-heading">{{ heading }}</h2>
    <component :is="child" v-for="(child, i) in content" :key="i" />
  </section>
</template>
