<script setup lang="ts">
import type { VNode } from 'vue'

defineProps<{ brand: string, tagline: string, ctaLabel: string, ctaLink: string, body: VNode[], footer: string }>()
</script>

<template>
  <header class="site-header">
    <div class="site-container site-header__inner">
      <a class="site-brand" href="#top">
        <span class="site-brand__name">{{ brand }}</span>
        <span class="site-brand__tagline">{{ tagline }}</span>
      </a>
      <a class="site-button" :href="ctaLink">{{ ctaLabel }}</a>
    </div>
  </header>
  <main id="top" class="site-main">
    <component :is="child" v-for="(child, i) in body" :key="i" />
  </main>
  <footer class="site-footer"><div class="site-container"><p>{{ footer }}</p></div></footer>
</template>
