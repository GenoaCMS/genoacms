<script setup lang="ts">
import type { VNode } from 'vue'
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ brand: string, tagline: string, ctaLabel: string, ctaLink: string, body: VNode[], footer: string }>()
</script>

<template>
  <a :class="ui.skipLink" href="#content">Skip to content</a>
  <header id="top" :class="ui.header">
    <div :class="ui.headerInner">
      <a :class="ui.brand" href="#top">
        <span :class="ui.brandName">{{ brand }}</span>
        <span :class="ui.brandTagline">{{ tagline }}</span>
      </a>
      <a :class="ui.headerCta" :href="ctaLink">{{ ctaLabel }}</a>
    </div>
  </header>
  <main id="content" :class="ui.main">
    <component :is="child" v-for="(child, i) in body" :key="i" />
  </main>
  <footer :class="ui.footer"><p :class="ui.footerText">{{ footer }}</p></footer>
</template>
