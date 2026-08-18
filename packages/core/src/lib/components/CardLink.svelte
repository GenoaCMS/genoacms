<script lang="ts">
  import CardLinkContents from '$lib/components/CardLinkContents.svelte'

  type Props = {
    icon: string
    color?: string
    class?: string
    text: string
    href?: string,
    noscale?: boolean,
    oncontextmenu?: (event: MouseEvent) => void,
    onclick?: (event: MouseEvent) => void
  }
  const { icon, color, class: className = '', text, href = '', noscale, oncontextmenu, onclick, ...rest }: Props = $props()
</script>

{#if href}
    <a {href} {onclick} {oncontextmenu} class={className} {...rest}>
        <CardLinkContents {icon} {text} {color} {noscale} />
    </a>
{:else}
    <button type="button" {onclick} {oncontextmenu} class={className} {...rest}>
        <CardLinkContents {icon} {text} {color} {noscale} />
    </button>
{/if}
