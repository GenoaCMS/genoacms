<script lang="ts">
  import { ui } from '@genoacms/demo-support/ui'

  const { time, title, speaker, track }: { time: string, title: string, speaker: string, track: string } = $props()
</script>

<div class={ui.agenda}>
  <span class={ui.agendaTime}>{time}</span>
  <div>
    <p class={ui.agendaTitle}>{title}</p>
    {#if speaker !== ''}<p class={ui.agendaSpeaker}>{speaker}</p>{/if}
  </div>
  {#if track !== ''}<span class={ui.agendaTrack}>{track}</span>{:else}<span></span>{/if}
</div>
