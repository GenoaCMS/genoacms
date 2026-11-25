<script setup lang="ts">
import { ui } from '@genoacms/demo-support/ui'
/** Text and a number, so a renderer that stringifies everything shows itself. */
defineProps<{ text: string, order: number }>()
</script>

<template>
  <aside :class="ui.demoNote">
    <span :class="ui.demoNoteOrder">{{ order }}</span>
    <p :class="ui.demoNoteText">{{ text }}</p>
  </aside>
</template>
