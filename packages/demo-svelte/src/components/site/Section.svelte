<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import { ui } from '@genoacms/demo-support/ui'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { anchor, eyebrow, heading, intro, content }: {
    anchor: string, eyebrow: string, heading: string, intro: string, content: readonly ResolvedNode[]
  } = $props()
</script>

<section class={ui.section} id={anchor === '' ? undefined : anchor}>
  <div class={ui.sectionInner}>
    {#if eyebrow !== ''}<p class={ui.eyebrow}>{eyebrow}</p>{/if}
    <h2 class={ui.heading}>{heading}</h2>
    {#if intro !== ''}<p class={ui.intro}>{intro}</p>{/if}
    <div class={ui.content}><GenoaChildren nodes={content} /></div>
  </div>
</section>
