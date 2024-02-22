<script lang="ts">
    import type { ComponentNode as ComponentNodeT } from '$lib/script/components/page/types'
    import ComponentNode from '../ComponentNode.svelte'
    import Button from '$lib/components/Button.svelte'

    export let node: ComponentNodeT
    let isOpen = false
    const toggle = () => {
      isOpen = !isOpen
    }
</script>

<Button on:click={toggle}>
    {node.schemaName}
</Button>

{#if isOpen}
    <div class="bg-white absolute top-0 bottom-0 start-0 end-0">
        <Button on:click={toggle}>
            Close {node.schemaName}
        </Button>

        <ComponentNode bind:node />
    </div>
{/if}
