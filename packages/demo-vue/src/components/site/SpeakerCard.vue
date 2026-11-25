<script setup lang="ts">
import { initialsOf } from '@genoacms/demo-support/site'

defineProps<{ name: string, role: string, photo: string, talk: string }>()
</script>

<template>
  <article class="site-speaker">
    <div v-if="photo === ''" class="site-speaker__photo" aria-hidden="true">{{ initialsOf(name) }}</div>
    <img v-else class="site-speaker__photo" :src="photo" :alt="name" loading="lazy">
    <div>
      <h3 class="site-speaker__name">{{ name }}</h3>
      <p class="site-speaker__role">{{ role }}</p>
    </div>
    <p v-if="talk !== ''" class="site-speaker__talk">{{ talk }}</p>
  </article>
</template>
