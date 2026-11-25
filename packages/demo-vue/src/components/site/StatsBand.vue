<script setup lang="ts">
import type { VNode } from 'vue'

defineProps<{ stats: VNode[] }>()
</script>

<template>
  <section class="site-stats">
    <div class="site-container site-stats__inner">
      <component :is="child" v-for="(child, i) in stats" :key="i" />
    </div>
  </section>
</template>
