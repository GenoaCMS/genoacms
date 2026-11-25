<script setup lang="ts">
import type { VNode } from 'vue'
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ anchor: string, eyebrow: string, heading: string, intro: string, content: VNode[] }>()
</script>

<template>
  <section :id="anchor === '' ? undefined : anchor" :class="ui.section">
    <div :class="ui.sectionInner">
      <p v-if="eyebrow !== ''" :class="ui.eyebrow">{{ eyebrow }}</p>
      <h2 :class="ui.heading">{{ heading }}</h2>
      <p v-if="intro !== ''" :class="ui.intro">{{ intro }}</p>
      <div :class="ui.content">
        <component :is="child" v-for="(child, i) in content" :key="i" />
      </div>
    </div>
  </section>
</template>
