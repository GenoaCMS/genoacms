<script lang="ts">
  import { linesOf } from '@genoacms/demo-support/site'

  const { name, price, perks, highlighted, ctaLabel, ctaLink }: {
    name: string, price: string, perks: string, highlighted: boolean, ctaLabel: string, ctaLink: string
  } = $props()

  const perkList = $derived(linesOf(perks))
</script>

<article class={['site-ticket', highlighted && 'site-ticket--highlighted']}>
  {#if highlighted}<span class="site-ticket__badge">Most popular</span>{/if}
  <p class="site-ticket__name">{name}</p>
  <p class="site-ticket__price">{price}</p>
  <ul class="site-ticket__perks">
    {#each perkList as perk (perk)}<li>{perk}</li>{/each}
  </ul>
  <a class={['site-button', !highlighted && 'site-button--ghost']} href={ctaLink}>{ctaLabel}</a>
</article>
