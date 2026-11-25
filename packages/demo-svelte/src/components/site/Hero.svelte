<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { eyebrow, heading, lead, primaryLabel, primaryLink, secondaryLabel, secondaryLink, aside }: {
    eyebrow: string, heading: string, lead: string,
    primaryLabel: string, primaryLink: string, secondaryLabel: string, secondaryLink: string,
    aside: readonly ResolvedNode[]
  } = $props()
</script>

<section class="site-hero">
  <div class="site-container site-hero__grid">
    <div>
      <span class="site-hero__eyebrow">{eyebrow}</span>
      <h1 class="site-hero__heading">{heading}</h1>
      <p class="site-hero__lead">{lead}</p>
      <div class="site-hero__actions">
        <a class="site-button" href={primaryLink}>{primaryLabel}</a>
        {#if secondaryLabel !== ''}
          <a class="site-button site-button--ghost" href={secondaryLink}>{secondaryLabel}</a>
        {/if}
      </div>
    </div>
    <div class="site-hero__aside"><GenoaChildren nodes={aside} /></div>
  </div>
</section>
