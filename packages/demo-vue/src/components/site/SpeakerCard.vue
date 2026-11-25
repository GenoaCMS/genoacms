<script setup lang="ts">
import { initialsOf } from '@genoacms/demo-support/site'
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ name: string, role: string, photo: string, talk: string }>()
</script>

<template>
  <article :class="ui.speaker">
    <div v-if="photo === ''" :class="ui.speakerPhoto" aria-hidden="true">{{ initialsOf(name) }}</div>
    <img v-else :class="ui.speakerPhoto" :src="photo" :alt="name" loading="lazy">
    <div>
      <h3 :class="ui.speakerName">{{ name }}</h3>
      <p :class="ui.speakerRole">{{ role }}</p>
    </div>
    <p v-if="talk !== ''" :class="ui.speakerTalk">{{ talk }}</p>
  </article>
</template>
