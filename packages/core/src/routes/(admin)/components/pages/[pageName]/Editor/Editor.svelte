<script lang="ts">
    import type { ComponentNode as ComponentNodeT } from '$lib/script/components/page/types'
    import ComponentNode from './ComponentNode.svelte'

    export let contents: ComponentNodeT
</script>

<div class="p-4">
    <div class="text-2xl">
        Contents:
    </div>
    <div>
        <ComponentNode node={contents} />
    </div>
</div>
