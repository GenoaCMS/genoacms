<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import { perViewOf, turnCarousel } from '@genoacms/demo-support/site'
  import { slideBasisOf, ui } from '@genoacms/demo-support/ui'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { label, perView, items }: { label: string, perView: number, items: readonly ResolvedNode[] } = $props()

  let track: HTMLDivElement | undefined = $state()
</script>

<div class={ui.carousel} role="region" aria-roledescription="carousel" aria-label={label}>
  <div class={ui.carouselTrack} style:--slide-basis={slideBasisOf(perViewOf(perView))} bind:this={track}><GenoaChildren nodes={items} /></div>
  <div class={ui.carouselControls}>
    <button class={ui.carouselButton} type="button" aria-label="Previous" onclick={() => turnCarousel(track, -1)}>‹</button>
    <button class={ui.carouselButton} type="button" aria-label="Next" onclick={() => turnCarousel(track, 1)}>›</button>
  </div>
</div>
