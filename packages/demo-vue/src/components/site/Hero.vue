<script setup lang="ts">
import type { VNode } from 'vue'

defineProps<{
  eyebrow: string, heading: string, lead: string,
  primaryLabel: string, primaryLink: string, secondaryLabel: string, secondaryLink: string,
  aside: VNode[]
}>()
</script>

<template>
  <section class="site-hero">
    <div class="site-container site-hero__grid">
      <div>
        <span class="site-hero__eyebrow">{{ eyebrow }}</span>
        <h1 class="site-hero__heading">{{ heading }}</h1>
        <p class="site-hero__lead">{{ lead }}</p>
        <div class="site-hero__actions">
          <a class="site-button" :href="primaryLink">{{ primaryLabel }}</a>
          <a v-if="secondaryLabel !== ''" class="site-button site-button--ghost" :href="secondaryLink">{{ secondaryLabel }}</a>
        </div>
      </div>
      <div class="site-hero__aside">
        <component :is="child" v-for="(child, i) in aside" :key="i" />
      </div>
    </div>
  </section>
</template>
