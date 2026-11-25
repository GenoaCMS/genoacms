<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import { ui } from '@genoacms/demo-support/ui'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { anchor, startEyebrow, startHeading, startIntro, start, endEyebrow, endHeading, endIntro, end }: {
    anchor: string,
    startEyebrow: string, startHeading: string, startIntro: string, start: readonly ResolvedNode[],
    endEyebrow: string, endHeading: string, endIntro: string, end: readonly ResolvedNode[]
  } = $props()
</script>

{#snippet column(eyebrow: string, heading: string, intro: string, content: readonly ResolvedNode[])}
  <div class={ui.duoColumn}>
    {#if eyebrow !== ''}<p class={ui.eyebrow}>{eyebrow}</p>{/if}
    <h2 class={ui.duoHeading}>{heading}</h2>
    {#if intro !== ''}<p class={ui.duoIntro}>{intro}</p>{/if}
    <div class={ui.content}><GenoaChildren nodes={content} /></div>
  </div>
{/snippet}

<section class={ui.section} id={anchor === '' ? undefined : anchor}>
  <div class={ui.duoGrid}>
    {@render column(startEyebrow, startHeading, startIntro, start)}
    {@render column(endEyebrow, endHeading, endIntro, end)}
  </div>
</section>
