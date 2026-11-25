<script setup lang="ts">
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ tag: string, title: string, body: string }>()
</script>

<template>
  <article :class="ui.feature">
    <span v-if="tag !== ''" :class="ui.featureTag">{{ tag }}</span>
    <h3 :class="ui.featureTitle">{{ title }}</h3>
    <p :class="ui.featureBody">{{ body }}</p>
  </article>
</template>
