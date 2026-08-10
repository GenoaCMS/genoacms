<script lang="ts">
  import CardLinkContents from '$lib/components/CardLinkContents.svelte'

  type Props = {
    icon: string
    text: string
    href?: string,
    noscale?: boolean,
    oncontextmenu?: (event: MouseEvent) => void,
    onclick?: (event: MouseEvent) => void
  }
  const { icon, text, href = '', noscale, oncontextmenu, onclick, ...rest }: Props = $props()
</script>

{#if href}
    <a {href} {onclick} {oncontextmenu} {...rest}>
        <CardLinkContents {icon} {text} {noscale} />
    </a>
{:else}
    <button type="button" {onclick} {oncontextmenu} {...rest}>
        <CardLinkContents {icon} {text} {noscale} />
    </button>
{/if}
