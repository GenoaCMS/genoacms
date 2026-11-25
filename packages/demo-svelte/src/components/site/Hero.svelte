<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import { cssImageOf } from '@genoacms/demo-support/site'
  import { ui } from '@genoacms/demo-support/ui'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { eyebrow, heading, lead, primaryLabel, primaryLink, secondaryLabel, secondaryLink, aside, background }: {
    eyebrow: string, heading: string, lead: string,
    primaryLabel: string, primaryLink: string, secondaryLabel: string, secondaryLink: string,
    aside: readonly ResolvedNode[], background: readonly string[]
  } = $props()

  const image = $derived(cssImageOf(background))
</script>

<section class={ui.hero} style:--hero-image={image === '' ? undefined : image}>
  <div class={ui.heroGrid}>
    <div class={ui.heroText}>
      <span class={ui.heroEyebrow}>{eyebrow}</span>
      <h1 class={ui.heroHeading}>{heading}</h1>
      <p class={ui.heroLead}>{lead}</p>
      <div class={ui.heroActions}>
        <a class={ui.buttonPrimary} href={primaryLink}>{primaryLabel}</a>
        {#if secondaryLabel !== ''}<a class={ui.buttonGhost} href={secondaryLink}>{secondaryLabel}</a>{/if}
      </div>
    </div>
    <div class={ui.heroAside}><GenoaChildren nodes={aside} /></div>
  </div>
</section>
