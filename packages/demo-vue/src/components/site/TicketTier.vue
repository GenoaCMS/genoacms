<script setup lang="ts">
import { linesOf } from '@genoacms/demo-support/site'
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ name: string, price: string, perks: string, highlighted: boolean, ctaLabel: string, ctaLink: string }>()
</script>

<template>
  <article :class="highlighted ? ui.ticketHighlighted : ui.ticket">
    <span v-if="highlighted" :class="ui.ticketBadge">Most popular</span>
    <p :class="ui.ticketName">{{ name }}</p>
    <p :class="ui.ticketPrice">{{ price }}</p>
    <ul :class="ui.ticketPerks">
      <li v-for="perk in linesOf(perks)" :key="perk" :class="ui.ticketPerk">{{ perk }}</li>
    </ul>
    <a :class="highlighted ? ui.ticketCta : ui.ticketCtaGhost" :href="ctaLink">{{ ctaLabel }}</a>
  </article>
</template>
