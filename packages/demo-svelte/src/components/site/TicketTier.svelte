<script lang="ts">
  import { linesOf } from '@genoacms/demo-support/site'
  import { ui } from '@genoacms/demo-support/ui'

  const { name, price, perks, highlighted, ctaLabel, ctaLink }: {
    name: string, price: string, perks: string, highlighted: boolean, ctaLabel: string, ctaLink: string
  } = $props()

  const perkList = $derived(linesOf(perks))
</script>

<article class={highlighted ? ui.ticketHighlighted : ui.ticket}>
  {#if highlighted}<span class={ui.ticketBadge}>Most popular</span>{/if}
  <p class={ui.ticketName}>{name}</p>
  <p class={ui.ticketPrice}>{price}</p>
  <ul class={ui.ticketPerks}>
    {#each perkList as perk (perk)}<li class={ui.ticketPerk}>{perk}</li>{/each}
  </ul>
  <a class={highlighted ? ui.ticketCta : ui.ticketCtaGhost} href={ctaLink}>{ctaLabel}</a>
</article>
