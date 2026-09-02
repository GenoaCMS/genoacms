<script setup lang="ts">
/** Text and a number, so a renderer that stringifies everything shows itself. */
defineProps<{ text: string, order: number }>()
</script>

<template>
  <aside class="note">
    <span class="note-order">{{ order }}</span>
    <p class="note-text">{{ text }}</p>
  </aside>
</template>
