<script setup lang="ts">
import type { VNode } from 'vue'

defineProps<{ anchor: string, eyebrow: string, heading: string, intro: string, content: VNode[] }>()
</script>

<template>
  <section class="site-section" :id="anchor === '' ? undefined : anchor">
    <div class="site-container">
      <p v-if="eyebrow !== ''" class="site-section__eyebrow">{{ eyebrow }}</p>
      <h2 class="site-section__heading">{{ heading }}</h2>
      <p v-if="intro !== ''" class="site-section__intro">{{ intro }}</p>
      <div class="site-section__content">
        <component :is="child" v-for="(child, i) in content" :key="i" />
      </div>
    </div>
  </section>
</template>
