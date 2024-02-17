<script lang="ts">
    import type { ComponentNode } from '$lib/script/components/page/types'
    import Attribute from './Attribute.svelte'

    export let node: ComponentNode
</script>

{#each Object.values(node.data) as attribute (attribute.name)}
    <Attribute {attribute} />
{/each}
