<script setup lang="ts">
import { ref, type VNode } from 'vue'
import { perViewOf, turnCarousel } from '@genoacms/demo-support/site'
import { slideBasisOf, ui } from '@genoacms/demo-support/ui'

defineProps<{ label: string, perView: number, items: VNode[] }>()

const track = ref<HTMLDivElement | null>(null)
</script>

<template>
  <div :class="ui.carousel" role="region" aria-roledescription="carousel" :aria-label="label">
    <div ref="track" :class="ui.carouselTrack" :style="{ '--slide-basis': slideBasisOf(perViewOf(perView)) }">
      <component :is="child" v-for="(child, i) in items" :key="i" />
    </div>
    <div :class="ui.carouselControls">
      <button :class="ui.carouselButton" type="button" aria-label="Previous" @click="turnCarousel(track, -1)">‹</button>
      <button :class="ui.carouselButton" type="button" aria-label="Next" @click="turnCarousel(track, 1)">›</button>
    </div>
  </div>
</template>
