<script setup lang="ts">
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ time: string, title: string, speaker: string, track: string }>()
</script>

<template>
  <div :class="ui.agenda">
    <span :class="ui.agendaTime">{{ time }}</span>
    <div>
      <p :class="ui.agendaTitle">{{ title }}</p>
      <p v-if="speaker !== ''" :class="ui.agendaSpeaker">{{ speaker }}</p>
    </div>
    <span v-if="track !== ''" :class="ui.agendaTrack">{{ track }}</span>
    <span v-else />
  </div>
</template>
