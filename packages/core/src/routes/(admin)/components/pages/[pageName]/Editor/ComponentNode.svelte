<script lang="ts">
    import type { ComponentNode } from '$lib/script/components/page/types'
    import Attribute from './Attribute.svelte'

    export let node: ComponentNode
</script>

{#each node.data as attribute (attribute.name)}
    <Attribute bind:attribute />
{/each}
