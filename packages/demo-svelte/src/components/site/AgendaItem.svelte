<script lang="ts">
  const { time, title, speaker, track }: { time: string, title: string, speaker: string, track: string } = $props()
</script>

<div class="site-agenda">
  <span class="site-agenda__time">{time}</span>
  <div>
    <p class="site-agenda__title">{title}</p>
    {#if speaker !== ''}<p class="site-agenda__speaker">{speaker}</p>{/if}
  </div>
  {#if track !== ''}<span class="site-agenda__track">{track}</span>{:else}<span></span>{/if}
</div>
