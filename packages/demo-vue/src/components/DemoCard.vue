<script setup lang="ts">
/** Two text values, so a wrapper putting them in the wrong props is visible on screen. */
defineProps<{ title: string, body: string }>()
</script>

<template>
  <article class="card">
    <h3 class="card-title">{{ title }}</h3>
    <p class="card-body">{{ body }}</p>
  </article>
</template>
