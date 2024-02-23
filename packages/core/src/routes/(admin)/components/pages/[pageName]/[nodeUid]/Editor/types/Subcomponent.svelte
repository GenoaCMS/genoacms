<script lang="ts">
    import type { ComponentNode as ComponentNodeT } from '$lib/script/components/page/types'
    import { Button } from 'flowbite-svelte'

    export let node: ComponentNodeT
</script>

<Button color="light" href={node.uid}>
    {node.schemaName}
</Button>
