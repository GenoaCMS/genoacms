<script setup lang="ts">
import { linesOf } from '@genoacms/demo-support/site'

defineProps<{ name: string, price: string, perks: string, highlighted: boolean, ctaLabel: string, ctaLink: string }>()
</script>

<template>
  <article :class="highlighted ? 'site-ticket site-ticket--highlighted' : 'site-ticket'">
    <span v-if="highlighted" class="site-ticket__badge">Most popular</span>
    <p class="site-ticket__name">{{ name }}</p>
    <p class="site-ticket__price">{{ price }}</p>
    <ul class="site-ticket__perks">
      <li v-for="perk in linesOf(perks)" :key="perk">{{ perk }}</li>
    </ul>
    <a :class="highlighted ? 'site-button' : 'site-button site-button--ghost'" :href="ctaLink">{{ ctaLabel }}</a>
  </article>
</template>
