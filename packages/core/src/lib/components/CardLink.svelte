<script lang="ts">
  import CardLinkContents from '$lib/components/CardLinkContents.svelte'

  type Props = {
    icon: string
    text: string
    href?: string,
    oncontextmenu?: (event: MouseEvent) => void,
    onclick?: (event: MouseEvent) => void
  }
  const { icon, text, href = '', oncontextmenu, onclick, ...rest }: Props = $props()
</script>

{#if href}
    <a {href} {onclick} {oncontextmenu} {...rest}>
        <CardLinkContents {icon} {text} />
    </a>
{:else}
    <button type="button" {onclick} {oncontextmenu} {...rest}>
        <CardLinkContents {icon} {text} />
    </button>
{/if}
