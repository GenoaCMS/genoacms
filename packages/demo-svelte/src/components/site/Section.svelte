<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { anchor, eyebrow, heading, intro, content }: {
    anchor: string, eyebrow: string, heading: string, intro: string, content: readonly ResolvedNode[]
  } = $props()
</script>

<section class="site-section" id={anchor === '' ? undefined : anchor}>
  <div class="site-container">
    {#if eyebrow !== ''}<p class="site-section__eyebrow">{eyebrow}</p>{/if}
    <h2 class="site-section__heading">{heading}</h2>
    {#if intro !== ''}<p class="site-section__intro">{intro}</p>{/if}
    <div class="site-section__content"><GenoaChildren nodes={content} /></div>
  </div>
</section>
