<script lang="ts">
  import type { ComponentNode } from '$lib/script/components/page/entry/types'
  import Attribute from './Attribute.svelte'

  export let node: ComponentNode

  $: attributeArray = Object.values(node.data)
</script>

<div>
    <h2>
        {node.name}
    </h2>
    <div>
        {#each attributeArray as attribute (attribute.name)}
            <Attribute bind:attribute />
        {/each}
    </div>
</div>
