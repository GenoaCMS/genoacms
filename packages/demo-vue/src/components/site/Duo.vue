<script setup lang="ts">
import type { VNode } from 'vue'
import { ui } from '@genoacms/demo-support/ui'

defineProps<{
  anchor: string
  startEyebrow: string, startHeading: string, startIntro: string, start: VNode[]
  endEyebrow: string, endHeading: string, endIntro: string, end: VNode[]
}>()
</script>

<template>
  <section :id="anchor === '' ? undefined : anchor" :class="ui.section">
    <div :class="ui.duoGrid">
      <div
        v-for="(column, index) in [
          { eyebrow: startEyebrow, heading: startHeading, intro: startIntro, content: start },
          { eyebrow: endEyebrow, heading: endHeading, intro: endIntro, content: end }
        ]"
        :key="index"
        :class="ui.duoColumn"
      >
        <p v-if="column.eyebrow !== ''" :class="ui.eyebrow">{{ column.eyebrow }}</p>
        <h2 :class="ui.duoHeading">{{ column.heading }}</h2>
        <p v-if="column.intro !== ''" :class="ui.duoIntro">{{ column.intro }}</p>
        <div :class="ui.content">
          <component :is="child" v-for="(child, i) in column.content" :key="i" />
        </div>
      </div>
    </div>
  </section>
</template>
