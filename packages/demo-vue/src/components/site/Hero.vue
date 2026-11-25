<script setup lang="ts">
import { computed, type VNode } from 'vue'
import { cssImageOf } from '@genoacms/demo-support/site'
import { ui } from '@genoacms/demo-support/ui'

const props = defineProps<{
  eyebrow: string, heading: string, lead: string,
  primaryLabel: string, primaryLink: string, secondaryLabel: string, secondaryLink: string,
  aside: VNode[], background: string[]
}>()

const image = computed(() => cssImageOf(props.background))
</script>

<template>
  <section :class="ui.hero" :style="image === '' ? undefined : { '--hero-image': image }">
    <div :class="ui.heroGrid">
      <div :class="ui.heroText">
        <span :class="ui.heroEyebrow">{{ eyebrow }}</span>
        <h1 :class="ui.heroHeading">{{ heading }}</h1>
        <p :class="ui.heroLead">{{ lead }}</p>
        <div :class="ui.heroActions">
          <a :class="ui.buttonPrimary" :href="primaryLink">{{ primaryLabel }}</a>
          <a v-if="secondaryLabel !== ''" :class="ui.buttonGhost" :href="secondaryLink">{{ secondaryLabel }}</a>
        </div>
      </div>
      <div :class="ui.heroAside">
        <component :is="child" v-for="(child, i) in aside" :key="i" />
      </div>
    </div>
  </section>
</template>
