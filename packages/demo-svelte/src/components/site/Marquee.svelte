<script lang="ts">
  import { ui } from '@genoacms/demo-support/ui'

  const { text }: { text: string } = $props()
</script>

<div class={ui.marquee} role="img" aria-label={text}>
  <div class={ui.marqueeTrack} aria-hidden="true">
    {#each { length: 8 }, index (index)}<span class={ui.marqueeItem}>{text}</span>{/each}
  </div>
</div>
