<script lang="ts">
  import type { ResolvedNode } from '@genoacms/sdk'
  import { ui } from '@genoacms/demo-support/ui'
  import GenoaChildren from '../../genoa/GenoaChildren.svelte'

  const { brand, tagline, ctaLabel, ctaLink, body, footer }: {
    brand: string, tagline: string, ctaLabel: string, ctaLink: string, body: readonly ResolvedNode[], footer: string
  } = $props()
</script>

<a class={ui.skipLink} href="#content">Skip to content</a>
<header class={ui.header} id="top">
  <div class={ui.headerInner}>
    <a class={ui.brand} href="#top">
      <span class={ui.brandName}>{brand}</span>
      <span class={ui.brandTagline}>{tagline}</span>
    </a>
    <a class={ui.headerCta} href={ctaLink}>{ctaLabel}</a>
  </div>
</header>
<main class={ui.main} id="content"><GenoaChildren nodes={body} /></main>
<footer class={ui.footer}><p class={ui.footerText}>{footer}</p></footer>
