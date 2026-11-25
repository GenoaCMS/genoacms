<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import { ui } from '@genoacms/demo-support/ui'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'
  import { galaxy } from '../../galaxy'

  const { anchor, eyebrow, heading, intro, content }: {
    anchor: string, eyebrow: string, heading: string, intro: string, content: readonly ResolvedNode[]
  } = $props()
</script>

<section class={ui.galaxy} id={anchor === '' ? undefined : anchor}>
  <div class={ui.galaxyHead}>
    {#if eyebrow !== ''}<p class={ui.eyebrow}>{eyebrow}</p>{/if}
    <h2 class={ui.heading}>{heading}</h2>
    {#if intro !== ''}<p class={ui.intro}>{intro}</p>{/if}
  </div>
  <div class={ui.galaxyStage}>
    <canvas class={ui.galaxyCanvas} {@attach galaxy.mount}></canvas>
    <div class={ui.galaxyOverlay}><GenoaChildren nodes={content} /></div>
  </div>
</section>
