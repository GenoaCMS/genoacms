<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { brand, tagline, ctaLabel, ctaLink, body, footer }: {
    brand: string, tagline: string, ctaLabel: string, ctaLink: string, body: readonly ResolvedNode[], footer: string
  } = $props()
</script>

<header class="site-header">
  <div class="site-container site-header__inner">
    <a class="site-brand" href="#top">
      <span class="site-brand__name">{brand}</span>
      <span class="site-brand__tagline">{tagline}</span>
    </a>
    <a class="site-button" href={ctaLink}>{ctaLabel}</a>
  </div>
</header>
<main id="top" class="site-main"><GenoaChildren nodes={body} /></main>
<footer class="site-footer"><div class="site-container"><p>{footer}</p></div></footer>
