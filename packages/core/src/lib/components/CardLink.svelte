<script lang="ts">
    import CardLinkContents from '$lib/components/CardLinkContents.svelte'

    export let icon: string
    export let text: string
    export let href: string = ''
</script>

{#if href}
    <a {href} on:contextmenu|preventDefault|stopPropagation {...$$restProps}>
        <CardLinkContents {icon} {text} />
    </a>
{:else}
    <button type="button" on:click on:contextmenu|preventDefault|stopPropagation {...$$restProps}>
        <CardLinkContents {icon} {text} />
    </button>
{/if}

