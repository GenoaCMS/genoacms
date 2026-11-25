<script setup lang="ts">
defineProps<{ tag: string, title: string, body: string }>()
</script>

<template>
  <article class="site-feature">
    <span v-if="tag !== ''" class="site-feature__tag">{{ tag }}</span>
    <h3 class="site-feature__title">{{ title }}</h3>
    <p class="site-feature__body">{{ body }}</p>
  </article>
</template>
