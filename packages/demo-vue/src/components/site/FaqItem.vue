<script setup lang="ts">
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ question: string, answer: string }>()
</script>

<template>
  <details :class="ui.faq">
    <summary :class="ui.faqQuestion">{{ question }}</summary>
    <p :class="ui.faqAnswer">{{ answer }}</p>
  </details>
</template>
