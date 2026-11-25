<script setup lang="ts">
defineProps<{ question: string, answer: string }>()
</script>

<template>
  <details class="site-faq">
    <summary>{{ question }}</summary>
    <p>{{ answer }}</p>
  </details>
</template>
